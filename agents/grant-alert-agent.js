// ============================================================
// grant-alert-agent.js
// Noble Erne, LLC — GRANT PRIME System
//
// What this does:
//   Runs daily at 7:30 AM CT via GitHub Actions.
//   Pulls all scored grants (score >= 70) with deadlines
//   within the next 60 days.
//   Sends a clean HTML email digest to treagent1@gmail.com
//   via SendGrid.
//   Logs each alert to the grant_alerts table.
// ============================================================

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import sgMail from '@sendgrid/mail';

// ── Connections ──────────────────────────────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const ALERT_EMAIL = process.env.ALERT_EMAIL || 'treagent1@gmail.com';
const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || 'treagent1@gmail.com';

// ── Helpers ──────────────────────────────────────────────────
function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

// Format a date nicely: "Jun 15, 2025"
function formatDate(dateStr) {
  if (!dateStr) return 'No deadline';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

// Calculate days until deadline
function daysUntil(dateStr) {
  if (!dateStr) return null;
  const diff = new Date(dateStr) - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

// Color-code the score badge
function scoreColor(score) {
  if (score >= 80) return '#34D399'; // green
  if (score >= 65) return '#E9C46A'; // gold
  return '#F59E0B';                   // amber
}

// Color-code urgency of deadline
function urgencyColor(days) {
  if (days <= 14) return '#F87171'; // red — urgent
  if (days <= 30) return '#F59E0B'; // amber — soon
  return '#34D399';                  // green — plenty of time
}

// Format dollar amount
function formatAmount(min, max) {
  if (!min && !max) return 'Amount TBD';
  if (max) return `Up to $${Number(max).toLocaleString()}`;
  if (min) return `From $${Number(min).toLocaleString()}`;
  return 'Amount TBD';
}

// Category color map
function categoryColor(cat) {
  return { EdTech:'#00E5FF', STEM:'#A78BFA', Construction:'#34D399', Foundation:'#E9C46A', Federal:'#8B95AB' }[cat] || '#8B95AB';
}
function categoryIcon(cat) {
  return { EdTech:'💼', STEM:'🔬', Construction:'🏗️', Foundation:'🏦', Federal:'🏛️' }[cat] || '📄';
}

// ── Build HTML Alert Email (HIGH PRIORITY ONLY) ───────────────
// Daily digest moved to dashboard. Email fires only for:
//   Score ≥80 + deadline ≤14 days (urgent action required)
//   Grouped by category for instant triage.
function buildEmailHTML(grants, dateStr) {
  // Group by category
  const cats = {};
  for (const g of grants) {
    const cat = g.category || 'Federal';
    if (!cats[cat]) cats[cat] = [];
    cats[cat].push(g);
  }

  const sections = Object.entries(cats).map(([cat, list]) => {
    const rows = list.map(g => {
      const days = daysUntil(g.deadline);
      const daysText = days !== null ? `${days} days left` : 'No deadline';
      return `
      <tr>
        <td style="padding:12px 16px;border-bottom:1px solid #1E2640;">
          <div style="font-weight:700;font-size:13px;color:#EDF0F7;margin-bottom:3px;">${g.title}</div>
          <div style="font-size:11px;color:#8B95AB;">${g.funder || '—'} · ${formatAmount(g.amount_min, g.amount_max)}</div>
          <div style="font-size:10px;color:#4D5669;margin-top:3px;">${(g.notes || '').slice(0, 100)}</div>
        </td>
        <td style="padding:12px 16px;border-bottom:1px solid #1E2640;text-align:center;white-space:nowrap;">
          <span style="color:${scoreColor(g.score)};font-weight:800;font-size:15px;">${g.score}</span>
        </td>
        <td style="padding:12px 16px;border-bottom:1px solid #1E2640;text-align:center;white-space:nowrap;">
          <div style="font-size:11px;color:${urgencyColor(days)};font-weight:700;">${daysText}</div>
          <div style="font-size:10px;color:#8B95AB;">${formatDate(g.deadline)}</div>
        </td>
        <td style="padding:12px 16px;border-bottom:1px solid #1E2640;text-align:center;">
          <a href="${g.apply_url || '#'}" style="background:#34D399;color:#06080F;font-weight:700;font-size:10px;padding:5px 12px;border-radius:5px;text-decoration:none;display:inline-block;">APPLY →</a>
        </td>
      </tr>`;
    }).join('');

    return `
    <div style="margin-bottom:20px;">
      <div style="font-size:10px;font-weight:700;color:${categoryColor(cat)};letter-spacing:.14em;text-transform:uppercase;margin-bottom:8px;">${categoryIcon(cat)} ${cat} · ${list.length} grant${list.length>1?'s':''}</div>
      <table style="width:100%;border-collapse:collapse;background:#0B0F1A;border:1px solid rgba(255,255,255,.06);border-radius:8px;overflow:hidden;">
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }).join('');

  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#06080F;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:760px;margin:0 auto;padding:24px 16px;">
    <div style="background:linear-gradient(135deg,#0B0F1A,#0F1424);border:1px solid rgba(248,113,113,.4);border-radius:12px;padding:20px 24px;margin-bottom:20px;">
      <div style="font-size:10px;color:#F87171;font-weight:700;letter-spacing:.14em;text-transform:uppercase;margin-bottom:6px;">🚨 GRANT PRIME · Urgent Action Required</div>
      <div style="font-size:18px;font-weight:800;color:#EDF0F7;">High-Priority Grants Closing Soon</div>
      <div style="font-size:12px;color:#8B95AB;margin-top:6px;">${grants.length} grant${grants.length>1?'s':''} scored ≥80 · deadline ≤14 days · ${dateStr}</div>
      <div style="font-size:11px;color:#4D5669;margin-top:4px;">Full digest available on your dashboard · This email = action required now</div>
    </div>
    ${sections}
    <div style="margin-top:12px;padding:12px;background:#0B0F1A;border:1px solid rgba(255,255,255,.06);border-radius:8px;font-size:10px;color:#4D5669;text-align:center;">
      GRANT PRIME · Noble Erne, LLC &amp; Walker Contractors LLC · Alerts fire only for score ≥80, deadline ≤14 days
    </div>
  </div>
</body>
</html>`;
}

// ── Log alerts to Supabase (upsert prevents duplicate rows on re-runs) ───
async function logAlerts(grants) {
  const today = new Date().toISOString().split('T')[0];
  const alertRows = grants.map(g => ({
    grant_id:   g.id,
    alert_type: 'urgent_deadline',
    alerted_on: today,          // date-scoped — one row per grant per day
  }));

  // ON CONFLICT (grant_id, alert_type, alerted_on) DO NOTHING prevents duplicates
  // Requires a unique constraint — see SQL migration 004
  const { error } = await supabase
    .from('grant_alerts')
    .upsert(alertRows, { onConflict: 'grant_id,alert_type,alerted_on', ignoreDuplicates: true });

  if (error) log(`  Alert log error: ${error.message}`);
  else log(`  Logged ${alertRows.length} alert records (duplicates ignored)`);
}

// ── Main ─────────────────────────────────────────────────────
async function main() {
  log('=== GRANT PRIME Alert Agent Starting ===');

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY || !process.env.SENDGRID_API_KEY) {
    log('ERROR: Missing required environment variables');
    process.exit(1);
  }

  // URGENT ONLY: score ≥80 + deadline ≤14 days — full digest lives on dashboard
  const today = new Date().toISOString().split('T')[0];
  const cutoff14 = new Date();
  cutoff14.setDate(cutoff14.getDate() + 14);
  const cutoffStr = cutoff14.toISOString().split('T')[0];

  const { data: grants, error } = await supabase
    .from('grants')
    .select('id, title, funder, amount_min, amount_max, deadline, notes, score, apply_url, status, category, entity_fit')
    .eq('status', 'scored')
    .gte('score', 80)
    .lte('deadline', cutoffStr)
    .gte('deadline', today)
    // Budget pre-filter: only grants with viable award amounts ($10K+)
    .or('amount_max.gte.10000,amount_max.is.null')
    .order('score', { ascending: false })
    .limit(25);

  if (error) {
    log(`ERROR fetching grants: ${error.message}`);
    process.exit(1);
  }

  if (!grants || grants.length === 0) {
    log('No urgent grants (score ≥80, ≤14 days) today. No email sent — full digest on dashboard.');
    return;
  }

  log(`Found ${grants.length} URGENT grants to alert on`);

  const todayLabel = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

  const html = buildEmailHTML(grants, todayLabel);

  const msg = {
    to: ALERT_EMAIL,
    from: FROM_EMAIL,
    subject: `🚨 GRANT PRIME URGENT: ${grants.length} Grant${grants.length>1?'s':''} Closing in ≤14 Days · ${todayLabel}`,
    html,
  };

  try {
    await sgMail.send(msg);
    log(`Email sent to ${ALERT_EMAIL}`);
    await logAlerts(grants);
  } catch (err) {
    log(`SendGrid error: ${err.message}`);
    if (err.response) log(`  Details: ${JSON.stringify(err.response.body)}`);
    process.exit(1);
  }

  log(`=== Alert Agent Complete: ${grants.length} grants emailed ===`);
}

main().catch(err => {
  log(`FATAL: ${err.message}`);
  process.exit(1);
});
