// ============================================================
// treagent.js
// Noble Erne, LLC — GRANT PRIME System
//
// TREAGENT: CEO AI Agent
// ─────────────────────────────────────────────────────────────
// Treagent is the top-level orchestrator. Every other agent
// reports to Treagent. Treagent runs last — after discovery,
// scoring, alerts, deadlines, and health checks are complete —
// collects their results from system_log, and sends the daily
// CEO briefing email to treagent1@gmail.com.
//
// Responsibilities:
//   1. Read today's run results from all sub-agents in system_log
//   2. Pull key grant pipeline metrics from Supabase
//   3. Detect failures across any agent and flag for auto-repair
//   4. Compose and send the CEO daily briefing email (HTML)
//   5. Write its own run record to system_log
//
// Sub-agents it tracks:
//   - grant-discovery-agent   (finds new grants)
//   - grant-scoring-agent     (scores with Claude Haiku)
//   - grant-alert-agent       (urgent deadline alerts)
//   - grant-deadline-monitor  (7/14/30-day reminders)
//   - grant-health-monitor    (system health checks)
//   - grant-proposal-agent    (proposal drafts on-demand)
//
// Schedule: Daily 9:00 AM CT (2:00 PM UTC) — runs AFTER all others
// Run manually: node agents/treagent.js
// ============================================================

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import sgMail from '@sendgrid/mail';

// ── Connections ──────────────────────────────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

sgMail.setApiKey(process.env.SENDGRID_API_KEY || '');

const TREAGENT_EMAIL = 'treagent1@gmail.com';
const FROM_EMAIL     = process.env.SENDGRID_FROM_EMAIL || 'treagent1@gmail.com';
const ALERT_EMAIL    = process.env.ALERT_EMAIL || TREAGENT_EMAIL;

// Agent definitions — run order and display names
const AGENTS = [
  { key: 'grant-discovery-agent',  name: 'Discovery',    icon: '🔍', schedule: '7:00 AM CT' },
  { key: 'grant-scoring-agent',    name: 'Scoring',      icon: '🧠', schedule: '7:30 AM CT' },
  { key: 'grant-alert-agent',      name: 'Alerts',       icon: '🚨', schedule: '7:30 AM CT' },
  { key: 'grant-deadline-monitor', name: 'Deadlines',    icon: '📅', schedule: '8:00 AM CT' },
  { key: 'grant-health-monitor',   name: 'Health Check', icon: '🏥', schedule: '8:30 AM CT' },
];

function log(msg) { console.log(`[${new Date().toISOString()}] TREAGENT: ${msg}`); }

// ── 1. Collect sub-agent results from system_log ─────────────
async function collectAgentReports() {
  const since = new Date();
  since.setHours(0, 0, 0, 0); // midnight today
  const sinceStr = since.toISOString();

  const { data, error } = await supabase
    .from('system_log')
    .select('agent, run_at, status, grants_found, grants_added, details')
    .gte('run_at', sinceStr)
    .order('run_at', { ascending: false });

  if (error) {
    log(`ERROR reading system_log: ${error.message}`);
    return {};
  }

  // Key by agent name — take the most recent run per agent today
  const reports = {};
  for (const row of (data || [])) {
    if (!reports[row.agent]) {
      reports[row.agent] = {
        ranToday: true,
        runAt: row.run_at,
        status: row.status,
        grantsFound: row.grants_found || 0,
        grantsAdded: row.grants_added || 0,
        details: (() => { try { return JSON.parse(row.details || '{}'); } catch { return {}; } })(),
      };
    }
  }

  // Mark any agent that did NOT appear in today's logs
  for (const a of AGENTS) {
    if (!reports[a.key]) {
      reports[a.key] = { ranToday: false, status: 'missing', grantsFound: 0, grantsAdded: 0, details: {} };
    }
  }

  return reports;
}

// ── 2. Pull pipeline metrics from grants table ───────────────
async function getPipelineMetrics() {
  const today = new Date().toISOString().split('T')[0];

  const [
    totalRes,
    newRes,
    scoredRes,
    highValueRes,
    appliedRes,
    wonRes,
    closingRes,
    todayRes,
  ] = await Promise.allSettled([
    // Total active grants
    supabase.from('grants').select('*', { count: 'exact', head: true }).neq('status', 'closed'),
    // Unscored (new) grants
    supabase.from('grants').select('*', { count: 'exact', head: true }).eq('status', 'new'),
    // Scored grants
    supabase.from('grants').select('*', { count: 'exact', head: true }).eq('status', 'scored'),
    // High-value (score ≥ 80)
    supabase.from('grants').select('*', { count: 'exact', head: true }).gte('score', 80).neq('status', 'closed'),
    // Applied
    supabase.from('grants').select('*', { count: 'exact', head: true }).eq('status', 'applied'),
    // Won
    supabase.from('grants').select('*', { count: 'exact', head: true }).eq('status', 'won'),
    // Closing within 14 days
    supabase.from('grants').select('*', { count: 'exact', head: true })
      .lte('deadline', new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0])
      .gte('deadline', today)
      .gte('score', 65),
    // Added today
    supabase.from('grants').select('*', { count: 'exact', head: true })
      .gte('created_at', new Date().toISOString().split('T')[0]),
  ]);

  function count(r) {
    return r.status === 'fulfilled' ? (r.value.count ?? 0) : 0;
  }

  return {
    totalActive:   count(totalRes),
    unscored:      count(newRes),
    scored:        count(scoredRes),
    highValue:     count(highValueRes),
    applied:       count(appliedRes),
    won:           count(wonRes),
    closingSoon:   count(closingRes),
    addedToday:    count(todayRes),
  };
}

// ── 3. Get top 5 grants by score for the briefing ────────────
async function getTopGrants() {
  const { data, error } = await supabase
    .from('grants')
    .select('title, funder, score, deadline, amount_max, status, category')
    .gte('score', 65)
    .not('status', 'in', '("closed","won","rejected")')
    .order('score', { ascending: false })
    .limit(5);

  if (error) return [];
  return data || [];
}

// ── 4. Detect failures and build remediation notes ───────────
function analyzeFailures(reports) {
  const failures = [];
  const warnings = [];

  for (const a of AGENTS) {
    const r = reports[a.key];
    if (!r.ranToday) {
      failures.push({
        agent: a.name,
        icon: a.icon,
        issue: `Did not run today (scheduled ${a.schedule})`,
        action: `Check GitHub Actions workflow for ${a.key}`,
        severity: 'critical',
      });
    } else if (r.status === 'error' || r.status === 'failed') {
      failures.push({
        agent: a.name,
        icon: a.icon,
        issue: `Ran but exited with error status`,
        action: `Review GitHub Actions logs for ${a.key}`,
        severity: 'critical',
      });
    } else if (r.status === 'degraded') {
      warnings.push({
        agent: a.name,
        icon: a.icon,
        issue: `Degraded — some checks failed`,
        action: `See health monitor details in dashboard`,
        severity: 'warning',
      });
    }
  }

  // Check health monitor details for specific failures
  const health = reports['grant-health-monitor'];
  if (health?.ranToday && health.details?.failures?.length) {
    for (const f of health.details.failures) {
      warnings.push({
        agent: 'Health Monitor',
        icon: '🏥',
        issue: `Check failed: ${f}`,
        action: 'Inspect system_log details in dashboard',
        severity: 'warning',
      });
    }
  }

  return { failures, warnings };
}

// ── 5. Build CEO briefing email ───────────────────────────────
function buildBriefingHTML(reports, metrics, topGrants, analysis, dateStr) {
  const { failures, warnings } = analysis;
  const systemHealth = failures.length === 0 ? 'HEALTHY' : 'DEGRADED';
  const healthColor  = failures.length === 0 ? '#34D399' : '#F87171';
  const healthBg     = failures.length === 0 ? 'rgba(52,211,153,.1)' : 'rgba(248,113,113,.1)';

  // ── Agent Status Table ──
  const agentRows = AGENTS.map(a => {
    const r = reports[a.key];
    const statusIcon = !r.ranToday ? '⛔' : (r.status === 'error' || r.status === 'failed') ? '❌' : r.status === 'degraded' ? '⚠️' : '✅';
    const statusColor = !r.ranToday ? '#F87171' : (r.status === 'error' || r.status === 'failed') ? '#F87171' : r.status === 'degraded' ? '#F59E0B' : '#34D399';
    const runTime = r.ranToday ? new Date(r.runAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' }) + ' CT' : 'Did not run';
    const activity = r.ranToday
      ? (r.grantsAdded > 0 ? `+${r.grantsAdded} processed` : r.grantsFound > 0 ? `${r.grantsFound} checked` : 'Ran — no changes')
      : '—';

    return `
      <tr>
        <td style="padding:10px 14px;border-bottom:1px solid #1E2640;">
          <span style="margin-right:6px;">${a.icon}</span>
          <span style="font-size:12px;font-weight:700;color:#EDF0F7;">${a.name}</span>
        </td>
        <td style="padding:10px 14px;border-bottom:1px solid #1E2640;text-align:center;">
          <span style="font-weight:800;font-size:13px;color:${statusColor}">${statusIcon}</span>
        </td>
        <td style="padding:10px 14px;border-bottom:1px solid #1E2640;font-size:11px;color:#8B95AB;">${runTime}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #1E2640;font-size:11px;color:#8B95AB;">${activity}</td>
      </tr>`;
  }).join('');

  // ── Pipeline KPI Cards ──
  const kpiCards = [
    { label: 'Total Active',    value: metrics.totalActive, color: '#8B95AB' },
    { label: 'Added Today',     value: metrics.addedToday,  color: '#00E5FF' },
    { label: 'High-Value (≥80)',value: metrics.highValue,   color: '#34D399' },
    { label: 'Closing in 14d', value: metrics.closingSoon, color: '#F87171' },
    { label: 'Applied',        value: metrics.applied,     color: '#A78BFA' },
    { label: 'Won',            value: metrics.won,         color: '#E9C46A' },
  ].map(k => `
    <td style="padding:0 6px;">
      <div style="background:#0B0F1A;border:1px solid rgba(255,255,255,.06);border-radius:8px;padding:12px 14px;text-align:center;min-width:90px;">
        <div style="font-size:22px;font-weight:900;color:${k.color};line-height:1.1;">${k.value}</div>
        <div style="font-size:9px;color:#4D5669;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin-top:3px;">${k.label}</div>
      </div>
    </td>`).join('');

  // ── Top Grants ──
  const topGrantRows = topGrants.length === 0
    ? '<tr><td colspan="4" style="padding:14px;text-align:center;color:#4D5669;font-size:12px;">No scored grants yet — run npm run scoring</td></tr>'
    : topGrants.map(g => {
        const daysLeft = g.deadline ? Math.ceil((new Date(g.deadline) - new Date()) / 86400000) : null;
        const deadlineText = daysLeft !== null ? `${daysLeft}d` : 'TBD';
        const deadlineColor = daysLeft === null ? '#4D5669' : daysLeft <= 14 ? '#F87171' : daysLeft <= 30 ? '#F59E0B' : '#34D399';
        const scoreColor = g.score >= 80 ? '#34D399' : g.score >= 65 ? '#E9C46A' : '#F59E0B';
        const amount = g.amount_max ? `$${Number(g.amount_max).toLocaleString()}` : 'TBD';
        return `
          <tr>
            <td style="padding:10px 14px;border-bottom:1px solid #1E2640;">
              <div style="font-size:12px;font-weight:700;color:#EDF0F7;">${(g.title || '').slice(0, 55)}${(g.title||'').length > 55 ? '…' : ''}</div>
              <div style="font-size:10px;color:#8B95AB;margin-top:2px;">${g.funder || '—'} · ${g.category || 'Federal'}</div>
            </td>
            <td style="padding:10px 14px;border-bottom:1px solid #1E2640;text-align:center;">
              <span style="font-size:16px;font-weight:900;color:${scoreColor}">${g.score}</span>
            </td>
            <td style="padding:10px 14px;border-bottom:1px solid #1E2640;text-align:center;font-size:11px;color:#8B95AB;">${amount}</td>
            <td style="padding:10px 14px;border-bottom:1px solid #1E2640;text-align:center;">
              <span style="font-size:11px;font-weight:700;color:${deadlineColor}">${deadlineText}</span>
            </td>
          </tr>`;
      }).join('');

  // ── Failures / Warnings Section ──
  let issueSection = '';
  if (failures.length > 0 || warnings.length > 0) {
    const issueItems = [
      ...failures.map(f => `
        <div style="display:flex;align-items:flex-start;gap:10px;padding:10px 14px;border-bottom:1px solid #1E2640;background:rgba(248,113,113,.05);">
          <span style="font-size:14px;flex-shrink:0;">${f.icon}</span>
          <div style="flex:1;">
            <div style="font-size:11px;font-weight:700;color:#F87171;text-transform:uppercase;letter-spacing:.08em;">⛔ ${f.agent} — CRITICAL</div>
            <div style="font-size:12px;color:#EDF0F7;margin-top:2px;">${f.issue}</div>
            <div style="font-size:10px;color:#8B95AB;margin-top:3px;">→ ${f.action}</div>
          </div>
        </div>`),
      ...warnings.map(w => `
        <div style="display:flex;align-items:flex-start;gap:10px;padding:10px 14px;border-bottom:1px solid #1E2640;background:rgba(245,158,11,.04);">
          <span style="font-size:14px;flex-shrink:0;">${w.icon}</span>
          <div style="flex:1;">
            <div style="font-size:11px;font-weight:700;color:#F59E0B;text-transform:uppercase;letter-spacing:.08em;">⚠️ ${w.agent} — WARNING</div>
            <div style="font-size:12px;color:#EDF0F7;margin-top:2px;">${w.issue}</div>
            <div style="font-size:10px;color:#8B95AB;margin-top:3px;">→ ${w.action}</div>
          </div>
        </div>`),
    ].join('');

    issueSection = `
    <div style="margin-bottom:20px;">
      <div style="font-size:10px;font-weight:700;color:#F87171;letter-spacing:.14em;text-transform:uppercase;margin-bottom:8px;">⚠️ Issues Requiring Attention (${failures.length + warnings.length})</div>
      <div style="background:#0B0F1A;border:1px solid rgba(248,113,113,.3);border-radius:10px;overflow:hidden;">
        ${issueItems}
      </div>
    </div>`;
  }

  // ── Compose full HTML ──
  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>GRANT PRIME Daily Briefing</title></head>
<body style="margin:0;padding:0;background:#06080F;font-family:'Segoe UI',Arial,sans-serif;">
<div style="max-width:780px;margin:0 auto;padding:24px 16px;">

  <!-- Header -->
  <div style="background:linear-gradient(135deg,#0B0F1A 0%,#0F1E18 100%);border:1px solid rgba(52,211,153,.25);border-radius:14px;padding:22px 28px;margin-bottom:18px;">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px;">
      <div>
        <div style="font-size:10px;color:#34D399;font-weight:700;letter-spacing:.18em;text-transform:uppercase;margin-bottom:4px;">GRANT PRIME · CEO DAILY BRIEFING</div>
        <div style="font-size:22px;font-weight:900;color:#EDF0F7;line-height:1.15;">${dateStr}</div>
        <div style="font-size:12px;color:#8B95AB;margin-top:4px;">Noble Erne, LLC &amp; Walker Contractors LLC · Automated Report by Treagent</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:${healthColor};background:${healthBg};border:1px solid ${healthColor};border-radius:6px;padding:5px 12px;display:inline-block;">
          SYSTEM ${systemHealth}
        </div>
        <div style="font-size:10px;color:#4D5669;margin-top:5px;">${failures.length} failure${failures.length !== 1 ? 's' : ''} · ${warnings.length} warning${warnings.length !== 1 ? 's' : ''}</div>
      </div>
    </div>
  </div>

  <!-- Pipeline KPIs -->
  <div style="margin-bottom:18px;">
    <div style="font-size:10px;font-weight:700;color:#8B95AB;letter-spacing:.14em;text-transform:uppercase;margin-bottom:8px;">📊 Pipeline Snapshot</div>
    <table style="width:100%;border-collapse:separate;border-spacing:0;"><tr>${kpiCards}</tr></table>
  </div>

  <!-- Issues (only if any) -->
  ${issueSection}

  <!-- Agent Report -->
  <div style="margin-bottom:18px;">
    <div style="font-size:10px;font-weight:700;color:#8B95AB;letter-spacing:.14em;text-transform:uppercase;margin-bottom:8px;">🤖 Agent Activity Report</div>
    <table style="width:100%;border-collapse:collapse;background:#0B0F1A;border:1px solid rgba(255,255,255,.06);border-radius:10px;overflow:hidden;">
      <thead>
        <tr style="background:#0F1424;">
          <th style="padding:9px 14px;text-align:left;font-size:9px;font-weight:700;color:#4D5669;letter-spacing:.12em;text-transform:uppercase;">Agent</th>
          <th style="padding:9px 14px;text-align:center;font-size:9px;font-weight:700;color:#4D5669;letter-spacing:.12em;text-transform:uppercase;">Status</th>
          <th style="padding:9px 14px;text-align:left;font-size:9px;font-weight:700;color:#4D5669;letter-spacing:.12em;text-transform:uppercase;">Run Time</th>
          <th style="padding:9px 14px;text-align:left;font-size:9px;font-weight:700;color:#4D5669;letter-spacing:.12em;text-transform:uppercase;">Activity</th>
        </tr>
      </thead>
      <tbody>${agentRows}</tbody>
    </table>
  </div>

  <!-- Top Grants -->
  <div style="margin-bottom:18px;">
    <div style="font-size:10px;font-weight:700;color:#8B95AB;letter-spacing:.14em;text-transform:uppercase;margin-bottom:8px;">🏆 Top Opportunities by Score</div>
    <table style="width:100%;border-collapse:collapse;background:#0B0F1A;border:1px solid rgba(255,255,255,.06);border-radius:10px;overflow:hidden;">
      <thead>
        <tr style="background:#0F1424;">
          <th style="padding:9px 14px;text-align:left;font-size:9px;font-weight:700;color:#4D5669;letter-spacing:.12em;text-transform:uppercase;">Grant / Funder</th>
          <th style="padding:9px 14px;text-align:center;font-size:9px;font-weight:700;color:#4D5669;letter-spacing:.12em;text-transform:uppercase;">Score</th>
          <th style="padding:9px 14px;text-align:center;font-size:9px;font-weight:700;color:#4D5669;letter-spacing:.12em;text-transform:uppercase;">Award</th>
          <th style="padding:9px 14px;text-align:center;font-size:9px;font-weight:700;color:#4D5669;letter-spacing:.12em;text-transform:uppercase;">Deadline</th>
        </tr>
      </thead>
      <tbody>${topGrantRows}</tbody>
    </table>
  </div>

  <!-- Footer -->
  <div style="padding:14px;background:#0B0F1A;border:1px solid rgba(255,255,255,.06);border-radius:8px;font-size:10px;color:#4D5669;text-align:center;line-height:1.7;">
    GRANT PRIME · Treagent CEO Briefing · Noble Erne, LLC &amp; Walker Contractors LLC<br>
    Sub-agents: Discovery → Scoring → Alerts → Deadlines → Health Monitor → Treagent<br>
    Dashboard: <a href="https://axiom-federal-solutions.github.io/grant-prime/" style="color:#34D399;text-decoration:none;">axiom-federal-solutions.github.io/grant-prime</a>
  </div>

</div>
</body>
</html>`;
}

// ── 6. Write Treagent's own run record ───────────────────────
async function logRun(status, agentCount, details) {
  try {
    await supabase.from('system_log').insert({
      agent: 'treagent',
      run_at: new Date().toISOString(),
      status,
      grants_found: agentCount,
      grants_added: 0,
      details: JSON.stringify(details),
    });
    log('Run logged to system_log');
  } catch (err) {
    log(`system_log write failed: ${err.message}`);
  }
}

// ── Main ──────────────────────────────────────────────────────
async function main() {
  log('=== TREAGENT CEO Briefing Starting ===');

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
    log('ERROR: Missing SUPABASE_URL or SUPABASE_KEY');
    process.exit(1);
  }

  if (!process.env.SENDGRID_API_KEY) {
    log('WARNING: SENDGRID_API_KEY not set — briefing will not be emailed');
  }

  log('Collecting sub-agent reports from system_log...');
  const reports = await collectAgentReports();

  log('Pulling pipeline metrics from Supabase...');
  const metrics = await getPipelineMetrics();

  log('Fetching top grants...');
  const topGrants = await getTopGrants();

  log('Analyzing failures...');
  const analysis = analyzeFailures(reports);

  const { failures, warnings } = analysis;
  log(`System status: ${failures.length} failures, ${warnings.length} warnings`);
  log(`Pipeline: ${metrics.totalActive} active grants · ${metrics.highValue} high-value · ${metrics.closingSoon} closing soon`);

  // Build and send briefing email
  const dateStr = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

  const html = buildBriefingHTML(reports, metrics, topGrants, analysis, dateStr);

  const systemStatus = failures.length === 0 ? 'HEALTHY' : 'DEGRADED';
  const subjectEmoji = failures.length === 0 ? '✅' : '⚠️';

  const msg = {
    to: TREAGENT_EMAIL,
    from: FROM_EMAIL,
    subject: `${subjectEmoji} GRANT PRIME CEO Briefing · ${systemStatus} · ${metrics.highValue} High-Value · ${metrics.closingSoon} Closing Soon · ${new Date().toLocaleDateString()}`,
    html,
  };

  if (process.env.SENDGRID_API_KEY) {
    try {
      await sgMail.send(msg);
      log(`CEO briefing emailed to ${TREAGENT_EMAIL}`);
    } catch (err) {
      log(`SendGrid error: ${err.message}`);
      if (err.response) log(`  Details: ${JSON.stringify(err.response.body)}`);
    }
  } else {
    log('Skipping email send — no SendGrid key');
  }

  // Log Treagent's own run
  await logRun(
    failures.length === 0 ? 'healthy' : 'degraded',
    AGENTS.length,
    {
      systemStatus,
      failures: failures.length,
      warnings: warnings.length,
      metrics,
      agentsRanToday: Object.values(reports).filter(r => r.ranToday).length,
    }
  );

  log(`=== TREAGENT Complete: ${systemStatus} · Briefing sent to ${TREAGENT_EMAIL} ===`);
}

main().catch(err => {
  log(`FATAL: ${err.message}`);
  process.exit(1);
});
