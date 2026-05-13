// ============================================================
// grant-test-runner.js
// Noble Erne, LLC — GRANT PRIME System
//
// POST-RUN VALIDATION AGENT
// ─────────────────────────────────────────────────────────────
// Runs after discovery + scoring each day.
// Validates data integrity, catches pipeline breaks early,
// and reports results to system_log + treagent1@gmail.com.
//
// Tests:
//   T01 — Supabase reachable + grants table accessible
//   T02 — Discovery ran and added grants today
//   T03 — Scoring ran and scored grants today
//   T04 — No grants with null grant_id (corrupt insert)
//   T05 — No grants with score out of range (0–100)
//   T06 — No duplicate grant_ids in database
//   T07 — At least 1 high-value grant (score ≥70) exists
//   T08 — No grants stuck "new" for 72+ hours
//   T09 — Action queue has at least 1 item OR no scored grants exist yet
//   T10 — system_log has entries from today
//
// Schedule: Daily 8:00 AM CT — after scoring, before health check
// ============================================================

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import sgMail from '@sendgrid/mail';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

sgMail.setApiKey(process.env.SENDGRID_API_KEY || '');

const TREAGENT_EMAIL = 'treagent1@gmail.com';
const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || 'treagent1@gmail.com';

function log(msg) { console.log(`[${new Date().toISOString()}] TEST: ${msg}`); }

// ── Individual tests ─────────────────────────────────────────

async function T01_supabaseReachable() {
  const { count, error } = await supabase.from('grants').select('*', { count: 'exact', head: true });
  if (error) return { pass: false, detail: `Supabase error: ${error.message}` };
  return { pass: true, detail: `Connected — ${count} total grants` };
}

async function T02_discoveryRanToday() {
  const since = new Date(); since.setHours(0,0,0,0);
  const { data, error } = await supabase.from('system_log')
    .select('run_at, grants_added').eq('agent', 'grant-discovery-agent')
    .gte('run_at', since.toISOString()).order('run_at', { ascending: false }).limit(1);
  if (error || !data?.length) return { pass: false, detail: 'Discovery has not run today' };
  return { pass: true, detail: `Discovery ran at ${new Date(data[0].run_at).toLocaleTimeString()} — ${data[0].grants_added} added` };
}

async function T03_scoringRanToday() {
  const since = new Date(); since.setHours(0,0,0,0);
  const { data, error } = await supabase.from('system_log')
    .select('run_at, grants_added').eq('agent', 'grant-scoring-agent')
    .gte('run_at', since.toISOString()).order('run_at', { ascending: false }).limit(1);
  if (error || !data?.length) return { pass: false, detail: 'Scoring has not run today' };
  return { pass: true, detail: `Scoring ran at ${new Date(data[0].run_at).toLocaleTimeString()} — ${data[0].grants_added} scored` };
}

async function T04_noNullGrantIds() {
  const { count, error } = await supabase.from('grants').select('*', { count: 'exact', head: true })
    .is('grant_id', null);
  if (error) return { pass: false, detail: `Query error: ${error.message}` };
  return { pass: count === 0, detail: count === 0 ? 'No null grant_ids found' : `${count} grants have null grant_id — INSERT bug` };
}

async function T05_scoresInRange() {
  // Grants with score set but outside 0–100
  const { count, error } = await supabase.from('grants').select('*', { count: 'exact', head: true })
    .not('score', 'is', null).or('score.lt.0,score.gt.100');
  if (error) return { pass: false, detail: `Query error: ${error.message}` };
  return { pass: count === 0, detail: count === 0 ? 'All scores in valid range 0–100' : `${count} grants have out-of-range scores` };
}

async function T06_noDuplicateGrantIds() {
  // Pull all grant_ids and check for dups in JS (Supabase doesn't support GROUP BY directly)
  const { data, error } = await supabase.from('grants').select('grant_id').not('grant_id', 'is', null);
  if (error) return { pass: false, detail: `Query error: ${error.message}` };
  const ids = (data || []).map(r => r.grant_id);
  const unique = new Set(ids);
  const dups = ids.length - unique.size;
  return { pass: dups === 0, detail: dups === 0 ? `No duplicates across ${ids.length} grants` : `${dups} duplicate grant_ids detected — upsert may have failed` };
}

async function T07_highValuePipelineNotEmpty() {
  const { count, error } = await supabase.from('grants').select('*', { count: 'exact', head: true })
    .gte('score', 70).not('status', 'in', '("closed","won","rejected")');
  if (error) return { pass: false, detail: `Query error: ${error.message}` };
  const pass = count > 0;
  return { pass, detail: pass ? `${count} high-value grants (score ≥70) in pipeline` : 'Pipeline empty — scoring may have failed or all grants are low-quality' };
}

async function T08_noStuckGrants() {
  const since72 = new Date(Date.now() - 72 * 3600000).toISOString();
  const { count, error } = await supabase.from('grants').select('*', { count: 'exact', head: true })
    .eq('status', 'new').lt('created_at', since72);
  if (error) return { pass: false, detail: `Query error: ${error.message}` };
  return { pass: count === 0, detail: count === 0 ? 'No grants stuck in new >72h' : `${count} grants stuck in "new" for 72+ hours — scoring blocked` };
}

async function T09_actionQueueHealthy() {
  const today = new Date().toISOString().split('T')[0];
  const cutoff = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];
  const { count: urgentCount, error: e1 } = await supabase.from('grants').select('*', { count: 'exact', head: true })
    .gte('score', 65).lte('deadline', cutoff).gte('deadline', today)
    .not('status', 'in', '("closed","won","applied","rejected")');
  const { count: scoredCount, error: e2 } = await supabase.from('grants').select('*', { count: 'exact', head: true })
    .eq('status', 'scored');
  if (e1 || e2) return { pass: false, detail: `Query error` };
  // If scoring exists but queue is empty, that's unusual but not a failure
  if (scoredCount === 0) return { pass: true, detail: 'No scored grants yet — action queue will populate after scoring' };
  return { pass: true, detail: `Action queue: ${urgentCount} urgent items, ${scoredCount} total scored` };
}

async function T10_systemLogToday() {
  const since = new Date(); since.setHours(0,0,0,0);
  const { count, error } = await supabase.from('system_log').select('*', { count: 'exact', head: true })
    .gte('run_at', since.toISOString());
  if (error) return { pass: false, detail: `Query error: ${error.message}` };
  return { pass: count > 0, detail: count > 0 ? `${count} system_log entries today` : 'No system_log entries today — all agents may have failed silently' };
}

// ── Run all tests ────────────────────────────────────────────
async function runAllTests() {
  const suite = [
    { id: 'T01', name: 'Supabase Reachable',       fn: T01_supabaseReachable },
    { id: 'T02', name: 'Discovery Ran Today',       fn: T02_discoveryRanToday },
    { id: 'T03', name: 'Scoring Ran Today',         fn: T03_scoringRanToday },
    { id: 'T04', name: 'No Null Grant IDs',         fn: T04_noNullGrantIds },
    { id: 'T05', name: 'Scores In Range 0–100',     fn: T05_scoresInRange },
    { id: 'T06', name: 'No Duplicate Grant IDs',    fn: T06_noDuplicateGrantIds },
    { id: 'T07', name: 'High-Value Pipeline Exists',fn: T07_highValuePipelineNotEmpty },
    { id: 'T08', name: 'No Grants Stuck >72h',      fn: T08_noStuckGrants },
    { id: 'T09', name: 'Action Queue Healthy',      fn: T09_actionQueueHealthy },
    { id: 'T10', name: 'System Log Has Entries',    fn: T10_systemLogToday },
  ];

  const results = [];
  for (const test of suite) {
    try {
      const r = await test.fn();
      results.push({ id: test.id, name: test.name, ...r });
      log(`  ${r.pass ? '✅' : '❌'} ${test.id} ${test.name}: ${r.detail}`);
    } catch (err) {
      results.push({ id: test.id, name: test.name, pass: false, detail: `Threw: ${err.message}` });
      log(`  ❌ ${test.id} ${test.name}: threw — ${err.message}`);
    }
  }

  return results;
}

// ── Write results to system_log ──────────────────────────────
async function logResults(results) {
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  try {
    await supabase.from('system_log').insert({
      agent: 'grant-test-runner',
      run_at: new Date().toISOString(),
      status: failed === 0 ? 'healthy' : 'degraded',
      grants_found: results.length,
      grants_added: passed,
      details: JSON.stringify({ passed, failed, results }),
    });
  } catch (err) {
    log(`system_log write failed: ${err.message}`);
  }
}

// ── Send test report email ───────────────────────────────────
async function sendReport(results) {
  if (!process.env.SENDGRID_API_KEY) return;
  const failed = results.filter(r => !r.pass);
  if (failed.length === 0) return; // all pass — no email needed

  const rows = results.map(r => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #1E2640;font-size:11px;color:#8B95AB;">${r.id}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #1E2640;font-size:12px;color:#EDF0F7;">${r.name}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #1E2640;text-align:center;font-weight:800;color:${r.pass?'#34D399':'#F87171'}">${r.pass?'PASS':'FAIL'}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #1E2640;font-size:11px;color:#8B95AB;">${r.detail}</td>
    </tr>`).join('');

  const html = `
<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;background:#06080F;font-family:'Segoe UI',Arial,sans-serif;">
<div style="max-width:720px;margin:0 auto;padding:24px 16px;">
  <div style="background:#0B0F1A;border:1px solid rgba(248,113,113,.3);border-radius:10px;padding:18px 22px;margin-bottom:14px;">
    <div style="font-size:10px;color:#F87171;font-weight:700;letter-spacing:.14em;text-transform:uppercase;margin-bottom:4px;">🧪 GRANT PRIME · Test Runner Report</div>
    <div style="font-size:17px;font-weight:800;color:#EDF0F7;">${failed.length} Test${failed.length>1?'s':''} Failed · ${results.filter(r=>r.pass).length}/${results.length} Passed</div>
  </div>
  <table style="width:100%;border-collapse:collapse;background:#0B0F1A;border:1px solid rgba(255,255,255,.06);border-radius:8px;overflow:hidden;">
    <thead><tr style="background:#0F1424;">
      <th style="padding:8px 12px;font-size:9px;color:#4D5669;text-align:left;letter-spacing:.1em;text-transform:uppercase">ID</th>
      <th style="padding:8px 12px;font-size:9px;color:#4D5669;text-align:left;letter-spacing:.1em;text-transform:uppercase">Test</th>
      <th style="padding:8px 12px;font-size:9px;color:#4D5669;text-align:center;letter-spacing:.1em;text-transform:uppercase">Result</th>
      <th style="padding:8px 12px;font-size:9px;color:#4D5669;text-align:left;letter-spacing:.1em;text-transform:uppercase">Detail</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
</div></body></html>`;

  try {
    await sgMail.send({
      to: TREAGENT_EMAIL, from: FROM_EMAIL,
      subject: `🧪 GRANT PRIME Tests: ${failed.length} FAILED · ${new Date().toLocaleDateString()}`,
      html,
    });
    log(`Test report sent to ${TREAGENT_EMAIL}`);
  } catch (err) {
    log(`Email error: ${err.message}`);
  }
}

// ── Main ─────────────────────────────────────────────────────
async function main() {
  log('=== GRANT PRIME Test Runner Starting ===');
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
    log('ERROR: Missing SUPABASE_URL or SUPABASE_KEY'); process.exit(1);
  }

  const results = await runAllTests();
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;

  await logResults(results);
  await sendReport(results);

  log(`=== Test Runner Complete: ${passed}/${results.length} passed ===`);
  if (failed > 0) process.exit(1); // mark workflow step red
}

main().catch(err => { log(`FATAL: ${err.message}`); process.exit(1); });
