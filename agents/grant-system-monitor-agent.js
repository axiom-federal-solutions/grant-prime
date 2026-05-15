// ============================================================
// grant-system-monitor-agent.js
// GRANT PRIME — Automated System Monitor
//
// Runs 25 checks across every layer of the system:
//   - Database connectivity and schema integrity
//   - Agent run freshness and silent fail detection
//   - Scoring coverage (score=0 grants still in pipeline)
//   - 3-partner classification accuracy
//   - AI Insights data freshness (strategy + intel)
//   - Proposal API health (server.js /health)
//   - Workflow conflict detection
//   - Email delivery verification
//   - Data integrity (no NULLs, no dupes, no stuck grants)
//   - Pipeline value sanity checks
//
// Writes full report to system_log (agent='grant-system-monitor')
// Emails alert if any HIGH severity checks fail.
//
// Schedule: Daily 10:00 AM CT — after full pipeline completes
// Run manually: node agents/grant-system-monitor-agent.js
// ============================================================

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import sgMail from '@sendgrid/mail';
import fetch from 'node-fetch';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
sgMail.setApiKey(process.env.SENDGRID_API_KEY || '');

const ALERT_EMAIL = process.env.ALERT_EMAIL || 'treagent1@gmail.com';
const FROM_EMAIL  = process.env.SENDGRID_FROM_EMAIL || 'treagent1@gmail.com';
const API_URL     = process.env.API_URL || 'http://localhost:3001';

function log(msg) { console.log(`[${new Date().toISOString()}] MONITOR: ${msg}`); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Check result builder ──────────────────────────────────────
function pass(id, label, detail = '') {
  return { id, label, status: 'PASS', severity: 'info', detail };
}
function warn(id, label, detail = '', severity = 'medium') {
  return { id, label, status: 'WARN', severity, detail };
}
function fail(id, label, detail = '', severity = 'high') {
  return { id, label, status: 'FAIL', severity, detail };
}

// ── M01: Supabase connectivity ────────────────────────────────
async function checkSupabase() {
  try {
    const { count, error } = await supabase.from('grants').select('*', { count: 'exact', head: true });
    if (error) throw new Error(error.message);
    return pass('M01', 'Supabase connectivity', `${count} grants in DB`);
  } catch (err) {
    return fail('M01', 'Supabase connectivity', err.message);
  }
}

// ── M02: Required schema columns exist ───────────────────────
async function checkSchemaColumns() {
  const required = ['id','title','funder','source','score','status','deadline','amount_max','entity_fit','notes','proposal_draft','grant_id'];
  try {
    const { data, error } = await supabase.from('grants').select(required.join(',')).limit(1);
    if (error) {
      const missing = error.message.match(/column "([^"]+)"/g) || [];
      return fail('M02', 'Schema columns', `Missing: ${missing.join(', ')} — run scripts/migrate.sql`);
    }
    return pass('M02', 'Schema columns', `All ${required.length} required columns present`);
  } catch (err) {
    return fail('M02', 'Schema columns', err.message);
  }
}

// ── M03: system_log table exists and is populated ────────────
async function checkSystemLog() {
  try {
    const { count, error } = await supabase.from('system_log').select('*', { count: 'exact', head: true });
    if (error) return fail('M03', 'system_log table', `Table missing or inaccessible: ${error.message}`);
    if (count === 0) return warn('M03', 'system_log table', 'Table exists but is empty — agents have not run yet', 'medium');
    return pass('M03', 'system_log table', `${count} log entries`);
  } catch (err) {
    return fail('M03', 'system_log table', err.message);
  }
}

// ── M04: grant_alerts table exists ───────────────────────────
async function checkGrantAlertsTable() {
  try {
    const { error } = await supabase.from('grant_alerts').select('id').limit(1);
    if (error) return fail('M04', 'grant_alerts table', `Missing — run scripts/migrate.sql: ${error.message}`);
    return pass('M04', 'grant_alerts table', 'Table accessible');
  } catch (err) {
    return fail('M04', 'grant_alerts table', err.message);
  }
}

// ── M05: Discovery agent ran today ────────────────────────────
async function checkDiscoveryFresh() {
  const today = new Date().toISOString().split('T')[0];
  const { data } = await supabase.from('system_log')
    .select('run_at, status, grants_added')
    .eq('agent', 'grant-discovery-agent')
    .gte('run_at', today)
    .order('run_at', { ascending: false })
    .limit(1);

  if (!data?.length) return fail('M05', 'Discovery agent freshness', 'Has not run today');
  if (data[0].status !== 'success') return warn('M05', 'Discovery agent freshness', `Ran today but status: ${data[0].status}`, 'high');
  return pass('M05', 'Discovery agent freshness', `Ran today, +${data[0].grants_added} grants`);
}

// ── M06: Scoring agent ran today ──────────────────────────────
async function checkScoringFresh() {
  const today = new Date().toISOString().split('T')[0];
  const { data } = await supabase.from('system_log')
    .select('run_at, status, grants_found')
    .eq('agent', 'grant-scoring-agent')
    .gte('run_at', today)
    .order('run_at', { ascending: false })
    .limit(1);

  if (!data?.length) return fail('M06', 'Scoring agent freshness', 'Has not run today');
  if (data[0].status !== 'success') return warn('M06', 'Scoring agent freshness', `Ran but status: ${data[0].status}`, 'high');
  return pass('M06', 'Scoring agent freshness', `Scored ${data[0].grants_found} grants`);
}

// ── M07: Strategy agent ran within 25 hours ──────────────────
async function checkStrategyFresh() {
  const cutoff = new Date(Date.now() - 25*60*60*1000).toISOString();
  const { data } = await supabase.from('system_log')
    .select('run_at, status, grants_added')
    .eq('agent', 'grant-strategy-agent')
    .gte('run_at', cutoff)
    .order('run_at', { ascending: false })
    .limit(1);

  if (!data?.length) return warn('M07', 'Strategy agent freshness', 'No run in last 25h — AI Insights may be stale', 'medium');
  if (data[0].status !== 'success') return warn('M07', 'Strategy agent freshness', `Last status: ${data[0].status}`, 'medium');
  return pass('M07', 'Strategy agent freshness', `${data[0].grants_added} recommendations generated`);
}

// ── M08: Intel agent ran within 25 hours ─────────────────────
async function checkIntelFresh() {
  const cutoff = new Date(Date.now() - 25*60*60*1000).toISOString();
  const { data } = await supabase.from('system_log')
    .select('run_at, status')
    .eq('agent', 'grant-intel-agent')
    .gte('run_at', cutoff)
    .order('run_at', { ascending: false })
    .limit(1);

  if (!data?.length) return warn('M08', 'Intel agent freshness', 'No run in last 25h — competitive data may be stale', 'medium');
  if (data[0].status !== 'success') return warn('M08', 'Intel agent freshness', `Last status: ${data[0].status}`, 'medium');
  return pass('M08', 'Intel agent freshness', 'Competitive intel is current');
}

// ── M09: Silent fail detection — score=0 grants stuck ────────
async function checkSilentFails() {
  const cutoff = new Date(Date.now() - 48*60*60*1000).toISOString();
  const { data, count } = await supabase.from('grants')
    .select('id, title, created_at', { count: 'exact' })
    .eq('score', 0)
    .eq('status', 'new')
    .lt('created_at', cutoff);

  if (count === 0) return pass('M09', 'Silent fail detection', 'No stuck unscored grants');
  if (count <= 5) return warn('M09', 'Silent fail detection', `${count} grants score=0 older than 48h — check scoring logs`, 'medium');
  return fail('M09', 'Silent fail detection', `${count} grants with score=0 stuck >48h — scoring agent may be failing silently`, 'high');
}

// ── M10: No grants stuck in scoring (score=0, not new) ───────
async function checkStuckGrants() {
  const cutoff = new Date(Date.now() - 72*60*60*1000).toISOString();
  const { count } = await supabase.from('grants')
    .select('*', { count: 'exact', head: true })
    .neq('status', 'closed')
    .neq('status', 'rejected')
    .neq('status', 'won')
    .lt('updated_at', cutoff)
    .not('status', 'in', '("applied","won","closed","rejected")');

  if (!count || count === 0) return pass('M10', 'No stuck grants (72h+)', 'All active grants recently updated');
  if (count <= 10) return warn('M10', 'No stuck grants (72h+)', `${count} grants unchanged for 72h+`, 'low');
  return warn('M10', 'No stuck grants (72h+)', `${count} grants stuck >72h — check autofix agent`, 'medium');
}

// ── M11: Score distribution sanity ───────────────────────────
async function checkScoreDistribution() {
  const { data } = await supabase.from('grants')
    .select('score')
    .not('status', 'in', '("closed","rejected","won")');

  if (!data?.length) return warn('M11', 'Score distribution', 'No active grants found', 'medium');

  const scores = data.map(g => g.score || 0);
  const above65 = scores.filter(s => s >= 65).length;
  const at0     = scores.filter(s => s === 0).length;
  const pct65   = Math.round(above65 / scores.length * 100);
  const pct0    = Math.round(at0 / scores.length * 100);

  if (pct0 > 30) return fail('M11', 'Score distribution', `${pct0}% of grants have score=0 — scoring coverage problem`, 'high');
  if (pct65 < 10) return warn('M11', 'Score distribution', `Only ${pct65}% score ≥65 — scoring criteria may be too strict`, 'medium');
  return pass('M11', 'Score distribution', `${pct65}% score ≥65, ${pct0}% at 0 (${scores.length} total)`);
}

// ── M12: 3-partner classification coverage ───────────────────
async function checkPartnerClassification() {
  const { data } = await supabase.from('grants')
    .select('entity_fit, notes')
    .not('status', 'in', '("closed","rejected")')
    .gte('score', 65);

  if (!data?.length) return warn('M12', '3-partner classification', 'No scored grants to classify', 'medium');

  let itEdtech = 0, construction = 0, stemEdu = 0, multiPartner = 0, unknown = 0;
  for (const g of data) {
    const ef = (g.entity_fit || g.notes || '').toLowerCase();
    if (ef.includes('stem education') || ef.includes('stem partner') || ef.includes('stem edu')) stemEdu++;
    else if (ef.includes('construction') || ef.includes('sdvosb') || ef.includes('walker')) construction++;
    else if (ef.includes('all partners') || ef.includes('edtech + stem') || ef.includes('it + stem')) multiPartner++;
    else if (ef.includes('it &') || ef.includes('edtech') || ef.includes('noble')) itEdtech++;
    else { itEdtech++; } // default falls to IT/EdTech
  }

  const hasSTEM = stemEdu > 0;
  if (!hasSTEM) return fail('M12', '3-partner classification', 'STEM Education Partner = 0 — re-run scoring agent with new model', 'high');
  return pass('M12', '3-partner classification', `IT/EdTech: ${itEdtech}, Construction: ${construction}, STEM Edu: ${stemEdu}, Multi: ${multiPartner}`);
}

// ── M13: No duplicate grant_ids ──────────────────────────────
async function checkDuplicates() {
  const { data } = await supabase.from('grants')
    .select('grant_id')
    .not('grant_id', 'is', null);

  if (!data?.length) return warn('M13', 'No duplicate grant_ids', 'No grant_ids set — discovery may be skipping dedup', 'low');

  const seen = new Set();
  const dupes = [];
  for (const g of data) {
    if (seen.has(g.grant_id)) dupes.push(g.grant_id);
    seen.add(g.grant_id);
  }

  if (dupes.length > 0) return warn('M13', 'No duplicate grant_ids', `${dupes.length} duplicate grant_ids found — check dedup logic`, 'medium');
  return pass('M13', 'No duplicate grant_ids', `${data.length} unique grant_ids`);
}

// ── M14: High-value grants (≥$100K) exist in pipeline ────────
async function checkHighValueGrants() {
  const { count } = await supabase.from('grants')
    .select('*', { count: 'exact', head: true })
    .gte('amount_max', 100000)
    .not('status', 'in', '("closed","rejected","won")')
    .gte('score', 65);

  if (!count || count === 0) return fail('M14', 'High-value grants in pipeline', 'No high-scoring grants ≥$100K — pipeline may be underpowered', 'high');
  if (count < 5) return warn('M14', 'High-value grants in pipeline', `Only ${count} high-scoring grants ≥$100K`, 'medium');
  return pass('M14', 'High-value grants in pipeline', `${count} grants score≥65 and amount≥$100K`);
}

// ── M15: Grants closing within 7 days ────────────────────────
async function checkUrgentDeadlines() {
  const in7 = new Date(Date.now() + 7*24*60*60*1000).toISOString().split('T')[0];
  const today = new Date().toISOString().split('T')[0];

  const { data } = await supabase.from('grants')
    .select('id, title, deadline, score, status')
    .gte('deadline', today)
    .lte('deadline', in7)
    .not('status', 'in', '("closed","rejected","won","applied")')
    .gte('score', 65)
    .order('deadline', { ascending: true });

  if (!data?.length) return pass('M15', 'Urgent deadlines', 'No high-scoring grants closing in 7 days');
  const titles = data.slice(0, 3).map(g => `${g.title?.slice(0,30)} (${g.deadline})`).join('; ');
  return warn('M15', 'Urgent deadlines', `${data.length} high-scoring grants close in ≤7d: ${titles}`, 'high');
}

// ── M16: AutoFix agent ran recently ──────────────────────────
async function checkAutoFix() {
  const { data } = await supabase.from('system_log')
    .select('run_at, status, details')
    .eq('agent', 'grant-autofix-agent')
    .order('run_at', { ascending: false })
    .limit(1);

  if (!data?.length) return warn('M16', 'AutoFix agent', 'No autofix runs logged — check scheduler', 'medium');

  const runAt = new Date(data[0].run_at);
  const ageHours = Math.round((Date.now() - runAt) / 3600000);
  if (ageHours > 26) return warn('M16', 'AutoFix agent', `Last run ${ageHours}h ago — may have missed today`, 'medium');
  return pass('M16', 'AutoFix agent', `Last run ${ageHours}h ago, status: ${data[0].status}`);
}

// ── M17: Health monitor ran recently ─────────────────────────
async function checkHealthMonitor() {
  const { data } = await supabase.from('system_log')
    .select('run_at, status')
    .eq('agent', 'grant-health-monitor')
    .order('run_at', { ascending: false })
    .limit(1);

  if (!data?.length) return warn('M17', 'Health monitor agent', 'No health monitor runs logged', 'low');
  const ageHours = Math.round((Date.now() - new Date(data[0].run_at)) / 3600000);
  if (ageHours > 26) return warn('M17', 'Health monitor agent', `Last run ${ageHours}h ago`, 'low');
  return pass('M17', 'Health monitor agent', `Last run ${ageHours}h ago`);
}

// ── M18: Proposal API server health ──────────────────────────
async function checkAPIServer() {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(`${API_URL}/health`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    return pass('M18', 'Proposal API server', `Running — ${body.proposalsToday}/${body.dailyCap} proposals today, ${body.inFlight} in-flight`);
  } catch (err) {
    return warn('M18', 'Proposal API server', `Not reachable at ${API_URL}: ${err.message} — start with: node server.js`, 'medium');
  }
}

// ── M19: Missing award amounts ────────────────────────────────
async function checkMissingAmounts() {
  const { count: total } = await supabase.from('grants')
    .select('*', { count: 'exact', head: true })
    .not('status', 'in', '("closed","rejected","won")');

  const { count: missing } = await supabase.from('grants')
    .select('*', { count: 'exact', head: true })
    .is('amount_max', null)
    .not('status', 'in', '("closed","rejected","won")');

  if (!total) return warn('M19', 'Award amount coverage', 'No active grants found', 'low');
  const pct = Math.round((missing / total) * 100);

  if (pct > 50) return warn('M19', 'Award amount coverage', `${pct}% of active grants missing amount_max — run enricher`, 'medium');
  if (pct > 25) return warn('M19', 'Award amount coverage', `${pct}% missing amounts (${missing}/${total})`, 'low');
  return pass('M19', 'Award amount coverage', `${100-pct}% have award amounts (${total-missing}/${total})`);
}

// ── M20: Pipeline value sanity ────────────────────────────────
async function checkPipelineValue() {
  const { data } = await supabase.from('grants')
    .select('amount_max, score')
    .not('status', 'in', '("closed","rejected","won")')
    .gte('score', 65);

  if (!data?.length) return warn('M20', 'Pipeline value', 'No high-scoring grants found', 'medium');

  const total = data.reduce((s, g) => s + (g.amount_max || 0), 0);
  const weighted = data.reduce((s, g) => s + ((g.amount_max || 0) * (g.score || 0) / 100), 0);
  const fmt = v => v >= 1e6 ? '$' + (v/1e6).toFixed(1) + 'M' : v >= 1e3 ? '$' + Math.round(v/1000) + 'K' : '$' + Math.round(v);

  if (total === 0) return warn('M20', 'Pipeline value', 'Total pipeline $0 — all amounts missing for high-scoring grants', 'medium');
  return pass('M20', 'Pipeline value', `Total: ${fmt(total)}, Weighted: ${fmt(weighted)} (${data.length} grants ≥65 score)`);
}

// ── M21: No null status grants ───────────────────────────────
async function checkNullStatus() {
  const { count } = await supabase.from('grants')
    .select('*', { count: 'exact', head: true })
    .is('status', null);

  if (count > 0) return warn('M21', 'No null status grants', `${count} grants with NULL status — may break pipeline filters`, 'medium');
  return pass('M21', 'No null status grants', 'All grants have a status value');
}

// ── M22: Treagent CEO briefing ran today ─────────────────────
async function checkTreagent() {
  const today = new Date().toISOString().split('T')[0];
  const { data } = await supabase.from('system_log')
    .select('run_at, status')
    .eq('agent', 'treagent')
    .gte('run_at', today)
    .order('run_at', { ascending: false })
    .limit(1);

  if (!data?.length) return warn('M22', 'Treagent CEO briefing', 'No briefing sent today yet — check if pipeline ran', 'low');
  if (data[0].status !== 'success') return warn('M22', 'Treagent CEO briefing', `Status: ${data[0].status}`, 'medium');
  return pass('M22', 'Treagent CEO briefing', 'CEO briefing sent today');
}

// ── M23: Discovery source diversity ──────────────────────────
async function checkSourceDiversity() {
  const { data } = await supabase.from('grants')
    .select('source')
    .not('status', 'in', '("closed","rejected")');

  if (!data?.length) return warn('M23', 'Source diversity', 'No active grants', 'low');

  const sources = {};
  for (const g of data) {
    const src = g.source || 'unknown';
    sources[src] = (sources[src] || 0) + 1;
  }

  const count = Object.keys(sources).length;
  if (count < 2) return fail('M23', 'Source diversity', `Only ${count} source(s): ${Object.keys(sources).join(', ')} — discovery agent may be failing`, 'high');
  if (count < 4) return warn('M23', 'Source diversity', `${count} sources: ${Object.keys(sources).join(', ')}`, 'low');
  return pass('M23', 'Source diversity', `${count} sources active: ${Object.keys(sources).join(', ')}`);
}

// ── M24: Recent STEM Education grants classified ──────────────
async function checkSTEMGrantsExist() {
  const { count } = await supabase.from('grants')
    .select('*', { count: 'exact', head: true })
    .or('entity_fit.ilike.%STEM%,notes.ilike.%STEM Education%,notes.ilike.%NSF%,notes.ilike.%urban youth%')
    .not('status', 'in', '("closed","rejected")');

  if (!count || count === 0) return fail('M24', 'STEM Education Partner grants', 'No STEM-classified grants — re-run scoring agent', 'high');
  if (count < 5) return warn('M24', 'STEM Education Partner grants', `Only ${count} STEM grants — scoring coverage may be low`, 'medium');
  return pass('M24', 'STEM Education Partner grants', `${count} STEM-relevant grants in pipeline`);
}

// ── M25: Company names scrubbed from notes/entity_fit ────────
async function checkCompanyNameLeaks() {
  const { count: nobleCount } = await supabase.from('grants')
    .select('*', { count: 'exact', head: true })
    .or('entity_fit.ilike.%Noble Erne%,notes.ilike.%Noble Erne%');

  const { count: walkerCount } = await supabase.from('grants')
    .select('*', { count: 'exact', head: true })
    .or('entity_fit.ilike.%Walker Contractors%,notes.ilike.%Walker Contractors%');

  const total = (nobleCount || 0) + (walkerCount || 0);
  if (total > 0) return warn('M25', 'Company name scrub', `${total} grants still use old company names in DB — re-run scoring`, 'medium');
  return pass('M25', 'Company name scrub', 'No legacy company names found in grant records');
}

// ── Run all checks ────────────────────────────────────────────
async function runAllChecks() {
  log('Running 25 system checks...');

  const results = await Promise.allSettled([
    checkSupabase(),
    checkSchemaColumns(),
    checkSystemLog(),
    checkGrantAlertsTable(),
    checkDiscoveryFresh(),
    checkScoringFresh(),
    checkStrategyFresh(),
    checkIntelFresh(),
    checkSilentFails(),
    checkStuckGrants(),
    checkScoreDistribution(),
    checkPartnerClassification(),
    checkDuplicates(),
    checkHighValueGrants(),
    checkUrgentDeadlines(),
    checkAutoFix(),
    checkHealthMonitor(),
    checkAPIServer(),
    checkMissingAmounts(),
    checkPipelineValue(),
    checkNullStatus(),
    checkTreagent(),
    checkSourceDiversity(),
    checkSTEMGrantsExist(),
    checkCompanyNameLeaks(),
  ]);

  return results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    const id = `M${String(i+1).padStart(2,'0')}`;
    return fail(id, `Check ${id}`, `Unexpected error: ${r.reason?.message || r.reason}`);
  });
}

// ── Email alert for failures ──────────────────────────────────
async function sendMonitorAlert(checks, summary) {
  if (!process.env.SENDGRID_API_KEY) return;

  const highFails = checks.filter(c => c.status === 'FAIL' && c.severity === 'high');
  if (highFails.length === 0 && summary.warnCount === 0) return; // Only email if something needs attention

  const severityColor = { FAIL: '#F87171', WARN: '#F59E0B', PASS: '#34D399' };

  const rows = checks.map(c => `
    <tr style="border-bottom:1px solid rgba(255,255,255,.04);">
      <td style="padding:7px 10px;font-size:11px;color:#8B95AB;font-weight:600;width:48px;">${c.id}</td>
      <td style="padding:7px 10px;font-size:11px;color:#EDF0F7;">${c.label}</td>
      <td style="padding:7px 10px;text-align:center;width:55px;">
        <span style="font-size:9px;font-weight:800;padding:2px 7px;border-radius:3px;background:${severityColor[c.status]}22;color:${severityColor[c.status]}">${c.status}</span>
      </td>
      <td style="padding:7px 10px;font-size:10px;color:#4D5669;max-width:280px;">${(c.detail||'').slice(0,100)}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#06080F;font-family:'Segoe UI',Arial,sans-serif;">
<div style="max-width:780px;margin:0 auto;padding:24px 16px;">
  <div style="background:#0B0F1A;border:1px solid rgba(167,139,250,.3);border-radius:12px;padding:16px 20px;margin-bottom:16px;">
    <div style="font-size:9px;color:#A78BFA;font-weight:700;letter-spacing:.14em;text-transform:uppercase;margin-bottom:4px;">GRANT PRIME · System Monitor</div>
    <div style="font-size:18px;font-weight:800;color:#EDF0F7;">Daily Health Report</div>
    <div style="font-size:11px;color:#8B95AB;margin-top:3px;">${new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})}</div>
  </div>
  <div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap;">
    <div style="flex:1;min-width:90px;background:#0F1424;border-radius:8px;padding:10px;text-align:center;"><div style="font-size:20px;font-weight:800;color:#34D399">${summary.passCount}</div><div style="font-size:9px;color:#4D5669;text-transform:uppercase">PASS</div></div>
    <div style="flex:1;min-width:90px;background:#0F1424;border-radius:8px;padding:10px;text-align:center;"><div style="font-size:20px;font-weight:800;color:#F59E0B">${summary.warnCount}</div><div style="font-size:9px;color:#4D5669;text-transform:uppercase">WARN</div></div>
    <div style="flex:1;min-width:90px;background:#0F1424;border-radius:8px;padding:10px;text-align:center;"><div style="font-size:20px;font-weight:800;color:#F87171">${summary.failCount}</div><div style="font-size:9px;color:#4D5669;text-transform:uppercase">FAIL</div></div>
    <div style="flex:1;min-width:90px;background:#0F1424;border-radius:8px;padding:10px;text-align:center;"><div style="font-size:20px;font-weight:800;color:#8B95AB">${summary.total}</div><div style="font-size:9px;color:#4D5669;text-transform:uppercase">TOTAL CHECKS</div></div>
  </div>
  <table style="width:100%;border-collapse:collapse;background:#0B0F1A;border-radius:8px;overflow:hidden;">
    <thead>
      <tr style="background:#0F1424;">
        <th style="padding:8px 10px;font-size:9px;color:#4D5669;text-align:left;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">ID</th>
        <th style="padding:8px 10px;font-size:9px;color:#4D5669;text-align:left;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">Check</th>
        <th style="padding:8px 10px;font-size:9px;color:#4D5669;text-align:center;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">Status</th>
        <th style="padding:8px 10px;font-size:9px;color:#4D5669;text-align:left;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">Detail</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div style="margin-top:14px;text-align:center;">
    <a href="https://axiom-federal-solutions.github.io/grant-prime/" style="background:#A78BFA;color:#06080F;font-weight:700;font-size:12px;padding:10px 22px;border-radius:6px;text-decoration:none;display:inline-block;">VIEW DASHBOARD</a>
  </div>
  <div style="margin-top:12px;font-size:9px;color:#4D5669;text-align:center;">GRANT PRIME · System Monitor · ${new Date().toISOString()}</div>
</div></body></html>`;

  const subject = summary.failCount > 0
    ? `🚨 GRANT PRIME Monitor: ${summary.failCount} FAIL, ${summary.warnCount} WARN — action needed`
    : `⚠️ GRANT PRIME Monitor: ${summary.warnCount} warnings — ${summary.passCount}/${summary.total} checks passed`;

  try {
    await sgMail.send({ to: ALERT_EMAIL, from: FROM_EMAIL, subject, html });
    log(`Monitor report emailed to ${ALERT_EMAIL}`);
  } catch (err) {
    log(`Email failed: ${err.message}`);
  }
}

// ── Main ──────────────────────────────────────────────────────
async function main() {
  log('=== Grant System Monitor Starting — 25 checks ===');
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
    log('ERROR: Missing SUPABASE_URL/KEY'); process.exit(1);
  }

  const checks = await runAllChecks();

  const summary = {
    total: checks.length,
    passCount: checks.filter(c => c.status === 'PASS').length,
    warnCount: checks.filter(c => c.status === 'WARN').length,
    failCount: checks.filter(c => c.status === 'FAIL').length,
    highFails: checks.filter(c => c.status === 'FAIL' && c.severity === 'high').length,
    runAt: new Date().toISOString(),
  };

  // Log every check result
  for (const c of checks) {
    const icon = c.status === 'PASS' ? '✓' : c.status === 'WARN' ? '⚠' : '✗';
    log(`  ${icon} [${c.id}] ${c.label}: ${c.detail || c.status}`);
  }

  // Write to system_log
  try {
    await supabase.from('system_log').insert({
      agent: 'grant-system-monitor',
      run_at: summary.runAt,
      status: summary.failCount > 0 ? 'degraded' : summary.warnCount > 0 ? 'warning' : 'success',
      grants_found: summary.total,
      grants_added: summary.passCount,
      details: JSON.stringify({ checks, summary }),
    });
    log('Monitor results written to system_log');
  } catch (err) {
    log(`system_log write failed: ${err.message}`);
  }

  // Email if any failures or warnings
  await sendMonitorAlert(checks, summary);

  log(`=== Monitor Complete: ${summary.passCount} PASS · ${summary.warnCount} WARN · ${summary.failCount} FAIL (${summary.total} total) ===`);

  // Exit with error code if any high-severity failures
  if (summary.highFails > 0) process.exit(1);
}

main().catch(err => { log(`FATAL: ${err.message}`); process.exit(1); });
