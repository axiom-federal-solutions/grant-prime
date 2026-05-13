// ============================================================
// grant-autofix-agent.js
// Noble Erne, LLC — GRANT PRIME System
//
// SELF-HEALING AGENT
// ─────────────────────────────────────────────────────────────
// Reads system_log for today's agent failures.
// Auto-retries any failed agent (up to 2 attempts each).
// Logs what it fixed to system_log.
// Reports all fixes + remaining failures to treagent1@gmail.com.
//
// Runs BETWEEN health monitor and treagent in the daily chain:
//   Discovery → Scoring → Alerts → Deadlines → Health → AutoFix → Treagent
//
// Schedule: Daily 8:45 AM CT via GitHub Actions (after health check)
// ============================================================

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import sgMail from '@sendgrid/mail';
import { spawn } from 'child_process';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

sgMail.setApiKey(process.env.SENDGRID_API_KEY || '');

const TREAGENT_EMAIL = 'treagent1@gmail.com';
const FROM_EMAIL     = process.env.SENDGRID_FROM_EMAIL || 'treagent1@gmail.com';

// Agent script paths — ordered by dependency
const AGENT_SCRIPTS = {
  'grant-discovery-agent':  'agents/grant-discovery-agent.js',
  'grant-scoring-agent':    'agents/grant-scoring-agent.js',
  'grant-alert-agent':      'agents/grant-alert-agent.js',
  'grant-deadline-monitor': 'agents/grant-deadline-monitor.js',
  'grant-health-monitor':   'agents/grant-health-monitor.js',
};

function log(msg) { console.log(`[${new Date().toISOString()}] AUTOFIX: ${msg}`); }

// Run an agent script and return { success, exitCode, duration }
function runAgent(scriptPath) {
  return new Promise((resolve) => {
    const start = Date.now();
    log(`  Launching: node ${scriptPath}`);

    const proc = spawn('node', [scriptPath], {
      stdio: 'inherit',
      env: process.env,
      timeout: 25 * 60 * 1000, // 25 min max
    });

    proc.on('close', (code) => {
      resolve({ success: code === 0, exitCode: code, duration: Date.now() - start });
    });

    proc.on('error', (err) => {
      resolve({ success: false, exitCode: -1, duration: Date.now() - start, error: err.message });
    });
  });
}

// Detect which agents failed or didn't run today
async function detectFailures() {
  const since = new Date();
  since.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from('system_log')
    .select('agent, run_at, status')
    .gte('run_at', since.toISOString())
    .order('run_at', { ascending: false });

  if (error) {
    log(`ERROR reading system_log: ${error.message}`);
    return Object.keys(AGENT_SCRIPTS); // assume all failed if can't read
  }

  // Latest run per agent today
  const latest = {};
  for (const row of (data || [])) {
    if (!latest[row.agent]) latest[row.agent] = row;
  }

  const failures = [];
  for (const agentKey of Object.keys(AGENT_SCRIPTS)) {
    const run = latest[agentKey];
    if (!run) {
      failures.push({ agent: agentKey, reason: 'did not run today' });
    } else if (run.status === 'error' || run.status === 'failed') {
      failures.push({ agent: agentKey, reason: `exited with status: ${run.status}` });
    }
  }

  return failures;
}

// Log autofix run to system_log
async function logRun(fixed, stillFailing, details) {
  try {
    await supabase.from('system_log').insert({
      agent: 'grant-autofix-agent',
      run_at: new Date().toISOString(),
      status: stillFailing.length === 0 ? 'healthy' : 'degraded',
      grants_found: fixed.length + stillFailing.length,
      grants_added: fixed.length,
      details: JSON.stringify({ fixed, stillFailing, details }),
    });
  } catch (err) {
    log(`system_log write failed: ${err.message}`);
  }
}

// Send fix report email to Treagent
async function sendFixReport(fixed, stillFailing) {
  if (!process.env.SENDGRID_API_KEY) return;
  if (fixed.length === 0 && stillFailing.length === 0) return; // nothing to report

  const fixedRows = fixed.map(f => `
    <tr>
      <td style="padding:9px 14px;border-bottom:1px solid #1E2640;font-size:12px;color:#EDF0F7;">✅ ${f.agent}</td>
      <td style="padding:9px 14px;border-bottom:1px solid #1E2640;font-size:11px;color:#34D399;">${f.reason} → Auto-fixed (${Math.round(f.duration/1000)}s)</td>
    </tr>`).join('');

  const failRows = stillFailing.map(f => `
    <tr>
      <td style="padding:9px 14px;border-bottom:1px solid #1E2640;font-size:12px;color:#EDF0F7;">❌ ${f.agent}</td>
      <td style="padding:9px 14px;border-bottom:1px solid #1E2640;font-size:11px;color:#F87171;">${f.reason} → Auto-fix failed after 2 attempts</td>
    </tr>`).join('');

  const html = `
<!DOCTYPE html><html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#06080F;font-family:'Segoe UI',Arial,sans-serif;">
<div style="max-width:680px;margin:0 auto;padding:24px 16px;">
  <div style="background:#0B0F1A;border:1px solid rgba(52,211,153,.25);border-radius:12px;padding:18px 24px;margin-bottom:16px;">
    <div style="font-size:10px;color:#34D399;font-weight:700;letter-spacing:.14em;text-transform:uppercase;margin-bottom:4px;">🔧 GRANT PRIME · Auto-Fix Report</div>
    <div style="font-size:17px;font-weight:800;color:#EDF0F7;">${fixed.length} Fixed · ${stillFailing.length} Still Failing</div>
    <div style="font-size:11px;color:#8B95AB;margin-top:4px;">${new Date().toLocaleString()}</div>
  </div>
  ${fixed.length ? `
  <div style="margin-bottom:14px;font-size:10px;font-weight:700;color:#34D399;text-transform:uppercase;letter-spacing:.1em">Auto-Fixed Agents</div>
  <table style="width:100%;border-collapse:collapse;background:#0B0F1A;border:1px solid rgba(255,255,255,.06);border-radius:8px;overflow:hidden;margin-bottom:16px;">
    <tbody>${fixedRows}</tbody>
  </table>` : ''}
  ${stillFailing.length ? `
  <div style="margin-bottom:14px;font-size:10px;font-weight:700;color:#F87171;text-transform:uppercase;letter-spacing:.1em">Requires Manual Attention</div>
  <table style="width:100%;border-collapse:collapse;background:#0B0F1A;border:1px solid rgba(248,113,113,.3);border-radius:8px;overflow:hidden;margin-bottom:16px;">
    <tbody>${failRows}</tbody>
  </table>` : ''}
  <div style="padding:10px;background:#0B0F1A;border-radius:6px;font-size:10px;color:#4D5669;text-align:center;">GRANT PRIME Auto-Fix Agent · Noble Erne, LLC</div>
</div>
</body></html>`;

  try {
    await sgMail.send({
      to: TREAGENT_EMAIL,
      from: FROM_EMAIL,
      subject: `🔧 GRANT PRIME AutoFix: ${fixed.length} fixed, ${stillFailing.length} still failing — ${new Date().toLocaleDateString()}`,
      html,
    });
    log(`Fix report sent to ${TREAGENT_EMAIL}`);
  } catch (err) {
    log(`Email error: ${err.message}`);
  }
}

// Main
async function main() {
  log('=== GRANT PRIME Auto-Fix Agent Starting ===');

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
    log('ERROR: Missing SUPABASE_URL or SUPABASE_KEY');
    process.exit(1);
  }

  const failures = await detectFailures();

  if (failures.length === 0) {
    log('All agents ran successfully today — nothing to fix.');
    await logRun([], [], { message: 'No failures detected' });
    log('=== Auto-Fix Complete: NOTHING TO DO ===');
    return;
  }

  log(`Detected ${failures.length} agent failure(s): ${failures.map(f => f.agent).join(', ')}`);

  const fixed = [];
  const stillFailing = [];

  for (const failure of failures) {
    const script = AGENT_SCRIPTS[failure.agent];
    if (!script) {
      stillFailing.push({ ...failure, reason: 'unknown agent — no script path' });
      continue;
    }

    log(`Attempting auto-fix for ${failure.agent} (attempt 1)...`);
    let result = await runAgent(script);

    if (!result.success) {
      log(`  Attempt 1 failed (exit ${result.exitCode}). Retrying...`);
      await new Promise(r => setTimeout(r, 5000)); // 5s cooldown
      result = await runAgent(script);
    }

    if (result.success) {
      log(`  ✅ ${failure.agent} auto-fixed in ${Math.round(result.duration/1000)}s`);
      fixed.push({ agent: failure.agent, reason: failure.reason, duration: result.duration });
    } else {
      log(`  ❌ ${failure.agent} still failing after 2 attempts`);
      stillFailing.push({ agent: failure.agent, reason: `${failure.reason} (2 auto-fix attempts failed)` });
    }
  }

  await logRun(fixed, stillFailing, { failures });
  await sendFixReport(fixed, stillFailing);

  const status = stillFailing.length === 0 ? 'ALL FIXED' : `${stillFailing.length} STILL FAILING`;
  log(`=== Auto-Fix Complete: ${fixed.length} fixed, ${status} ===`);

  if (stillFailing.length > 0) process.exit(1);
}

main().catch(err => {
  log(`FATAL: ${err.message}`);
  process.exit(1);
});
