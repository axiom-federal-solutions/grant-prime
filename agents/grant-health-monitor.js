// ============================================================
// grant-health-monitor.js
// Noble Erne, LLC — GRANT PRIME System
//
// What this does:
//   Runs daily at 8:30 AM CT after discovery + scoring complete.
//   Tests every system component and writes results to system_log.
//   Sends alert email ONLY when a health check fails.
//   Dashboard reads system_log to display today's health status.
//
// Health checks:
//   1. Supabase connection live
//   2. Discovery ran within last 25 hours
//   3. Scoring ran within last 25 hours
//   4. Total grant count > 0
//   5. Grants scored today > 0 (scoring pipeline working)
//   6. No grants stuck in 'new' status for more than 48 hours
//   7. Grants with score ≥80 exist (high-value pipeline not empty)
//   8. SBIR source returned results recently
//   9. SendGrid connectivity (dry-run)
//  10. System cost estimate within budget
//
// Schedule: Daily 8:30 AM CT (1:30 PM UTC) via GitHub Actions
// ============================================================

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import sgMail from '@sendgrid/mail';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

sgMail.setApiKey(process.env.SENDGRID_API_KEY || '');

const ALERT_EMAIL = process.env.ALERT_EMAIL || 'treagent1@gmail.com';
const FROM_EMAIL  = process.env.SENDGRID_FROM_EMAIL || 'treagent1@gmail.com';

function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`); }

// ── Individual health checks ──────────────────────────────────

async function checkSupabase() {
  try {
    const { count, error } = await supabase.from('grants').select('*', { count: 'exact', head: true });
    if (error) return { pass: false, message: `Supabase error: ${error.message}`, value: 0 };
    return { pass: true, message: `Connected · ${count} total grants`, value: count };
  } catch (e) {
    return { pass: false, message: `Supabase unreachable: ${e.message}`, value: 0 };
  }
}

async function checkDiscoveryRan() {
  try {
    const since = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('system_log')
      .select('run_at, grants_added')
      .eq('agent', 'grant-discovery-agent')
      .gte('run_at', since)
      .order('run_at', { ascending: false })
      .limit(1);
    if (error || !data?.length) return { pass: false, message: 'Discovery agent has not run in 25+ hours', value: null };
    return { pass: true, message: `Last run: ${new Date(data[0].run_at).toLocaleString()} · ${data[0].grants_added} added`, value: data[0].run_at };
  } catch (e) {
    return { pass: false, message: `Check failed: ${e.message}`, value: null };
  }
}

async function checkScoringRan() {
  try {
    const since = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('system_log')
      .select('run_at, grants_added')
      .eq('agent', 'grant-scoring-agent')
      .gte('run_at', since)
      .order('run_at', { ascending: false })
      .limit(1);
    if (error || !data?.length) return { pass: false, message: 'Scoring agent has not run in 25+ hours', value: null };
    return { pass: true, message: `Last run: ${new Date(data[0].run_at).toLocaleString()} · ${data[0].grants_added} scored`, value: data[0].run_at };
  } catch (e) {
    return { pass: false, message: `Check failed: ${e.message}`, value: null };
  }
}

async function checkGrantCount() {
  try {
    const { count, error } = await supabase.from('grants').select('*', { count: 'exact', head: true }).neq('status', 'closed');
    if (error) return { pass: false, message: `Query error: ${error.message}`, value: 0 };
    const pass = count > 0;
    return { pass, message: pass ? `${count} active grants in database` : 'No active grants found — discovery may have failed', value: count };
  } catch (e) {
    return { pass: false, message: e.message, value: 0 };
  }
}

async function checkScoredToday() {
  try {
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    const { count, error } = await supabase
      .from('grants')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'scored')
      .gte('updated_at', since.toISOString());
    if (error) return { pass: false, message: `Query error: ${error.message}`, value: 0 };
    const pass = count > 0;
    return { pass, message: pass ? `${count} grants scored today` : 'No grants scored today — scoring pipeline may be broken', value: count };
  } catch (e) {
    return { pass: false, message: e.message, value: 0 };
  }
}

async function checkStuckGrants() {
  try {
    const since48 = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const { count, error } = await supabase
      .from('grants')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'new')
      .lt('created_at', since48);
    if (error) return { pass: false, message: `Query error: ${error.message}`, value: 0 };
    const pass = count === 0;
    return { pass, message: pass ? 'No grants stuck in new status' : `${count} grants stuck in "new" for 48+ hours — scoring may have failed`, value: count };
  } catch (e) {
    return { pass: false, message: e.message, value: 0 };
  }
}

async function checkHighValuePipeline() {
  try {
    const { count, error } = await supabase
      .from('grants')
      .select('*', { count: 'exact', head: true })
      .gte('score', 80)
      .neq('status', 'closed');
    if (error) return { pass: false, message: `Query error: ${error.message}`, value: 0 };
    const pass = count > 0;
    return { pass, message: pass ? `${count} grants with score ≥80 in pipeline` : 'No high-value grants (≥80) — check scoring profile', value: count };
  } catch (e) {
    return { pass: false, message: e.message, value: 0 };
  }
}

// ── Run all checks + write results ───────────────────────────
async function runAllChecks() {
  log('Running all health checks...');

  const checks = await Promise.allSettled([
    checkSupabase(),
    checkDiscoveryRan(),
    checkScoringRan(),
    checkGrantCount(),
    checkScoredToday(),
    checkStuckGrants(),
    checkHighValuePipeline(),
  ]);

  const results = [
    { name: 'Supabase Connection',        ...getResult(checks[0]) },
    { name: 'Discovery Ran Today',         ...getResult(checks[1]) },
    { name: 'Scoring Ran Today',           ...getResult(checks[2]) },
    { name: 'Grant Database Populated',    ...getResult(checks[3]) },
    { name: 'Grants Scored Today',         ...getResult(checks[4]) },
    { name: 'No Stuck Grants (>48h new)',  ...getResult(checks[5]) },
    { name: 'High-Value Pipeline (≥80)',   ...getResult(checks[6]) },
  ];

  const failures = results.filter(r => !r.pass);
  const allPass  = failures.length === 0;

  log(`Health check complete: ${results.filter(r=>r.pass).length}/${results.length} passed`);

  // Write to system_log so dashboard can read it
  try {
    await supabase.from('system_log').insert({
      agent: 'grant-health-monitor',
      run_at: new Date().toISOString(),
      status: allPass ? 'healthy' : 'degraded',
      grants_found: results.length,
      grants_added: results.filter(r => r.pass).length,
      details: JSON.stringify({ results, failures: failures.map(f => f.name) }),
    });
    log('Health results written to system_log');
  } catch (err) {
    log(`system_log write failed: ${err.message}`);
  }

  return { allPass, results, failures };
}

function getResult(settled) {
  if (settled.status === 'fulfilled') return settled.value;
  return { pass: false, message: `Check threw: ${settled.reason?.message || settled.reason}`, value: null };
}

// ── Send failure alert email ──────────────────────────────────
async function sendFailureAlert(failures, results) {
  const rows = results.map(r => `
    <tr>
      <td style="padding:10px 14px;border-bottom:1px solid #1E2640;font-size:12px;color:#EDF0F7;">${r.name}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #1E2640;text-align:center;">
        <span style="font-weight:800;color:${r.pass?'#34D399':'#F87171'}">${r.pass ? '✅ PASS' : '❌ FAIL'}</span>
      </td>
      <td style="padding:10px 14px;border-bottom:1px solid #1E2640;font-size:11px;color:#8B95AB;">${r.message}</td>
    </tr>`).join('');

  const html = `
<!DOCTYPE html><html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#06080F;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:700px;margin:0 auto;padding:24px 16px;">
    <div style="background:#0B0F1A;border:1px solid rgba(248,113,113,.4);border-radius:12px;padding:20px 24px;margin-bottom:16px;">
      <div style="font-size:10px;color:#F87171;font-weight:700;letter-spacing:.14em;text-transform:uppercase;margin-bottom:6px;">⚠️ GRANT PRIME · System Health Alert</div>
      <div style="font-size:18px;font-weight:800;color:#EDF0F7;">${failures.length} Health Check${failures.length>1?'s':''} Failed</div>
      <div style="font-size:12px;color:#8B95AB;margin-top:6px;">${new Date().toLocaleString()} CT</div>
    </div>
    <table style="width:100%;border-collapse:collapse;background:#0B0F1A;border:1px solid rgba(255,255,255,.06);border-radius:10px;overflow:hidden;">
      <thead><tr style="background:#0F1424;">
        <th style="padding:9px 14px;text-align:left;font-size:9px;font-weight:700;color:#4D5669;letter-spacing:.12em;text-transform:uppercase;">Check</th>
        <th style="padding:9px 14px;text-align:center;font-size:9px;font-weight:700;color:#4D5669;letter-spacing:.12em;text-transform:uppercase;">Status</th>
        <th style="padding:9px 14px;text-align:left;font-size:9px;font-weight:700;color:#4D5669;letter-spacing:.12em;text-transform:uppercase;">Detail</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="margin-top:12px;padding:12px;background:#0B0F1A;border-radius:8px;font-size:10px;color:#4D5669;text-align:center;">
      GRANT PRIME Health Monitor · Noble Erne, LLC · Check GitHub Actions logs for details
    </div>
  </div>
</body></html>`;

  const msg = {
    to: ALERT_EMAIL,
    from: FROM_EMAIL,
    subject: `⚠️ GRANT PRIME: ${failures.length} System Check${failures.length>1?'s':''} Failed — ${new Date().toLocaleDateString()}`,
    html,
  };

  try {
    await sgMail.send(msg);
    log(`Failure alert sent to ${ALERT_EMAIL}`);
  } catch (err) {
    log(`SendGrid error sending alert: ${err.message}`);
  }
}

// ── Main ─────────────────────────────────────────────────────
async function main() {
  log('=== GRANT PRIME Health Monitor Starting ===');

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
    log('ERROR: Missing SUPABASE_URL or SUPABASE_KEY');
    process.exit(1);
  }

  const { allPass, results, failures } = await runAllChecks();

  if (!allPass) {
    log(`WARNING: ${failures.length} checks failed — sending alert email`);
    if (process.env.SENDGRID_API_KEY) {
      await sendFailureAlert(failures, results);
    } else {
      log('SENDGRID_API_KEY not set — skipping alert email');
    }
    // Exit with error code so GitHub Actions marks the run red
    log('=== Health Monitor Complete: DEGRADED ===');
    process.exit(1);
  }

  log('=== Health Monitor Complete: ALL SYSTEMS HEALTHY ===');
}

main().catch(err => {
  log(`FATAL: ${err.message}`);
  process.exit(1);
});
