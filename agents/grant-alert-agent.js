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

// ── Build HTML Email ─────────────────────────────────────────
function buildEmailHTML(grants, dateStr) {
  const grantRows = grants.map(g => {
    const days = daysUntil(g.deadline);
    const daysText = days !== null ? `${days} days left` : 'No deadline';

    return `
    <tr>
      <td style="padding:14px 16px;border-bottom:1px solid #1E2640;">
        <div style="font-weight:700;font-size:14px;color:#EDF0F7;margin-bottom:4px;">${g.title}</div>
        <div style="font-size:12px;color:#8B95AB;">${g.funder || 'Unknown Funder'}</div>
        <div style="font-size:11px;color:#4D5669;margin-top:4px;">${(g.notes || '').slice(0, 120)}</div>
      </td>
      <td style="padding:14px 16px;border-bottom:1px solid #1E2640;text-align:center;white-space:nowrap;">
        <span style="background:${scoreColor(g.score)}22;color:${scoreColor(g.score)};font-weight:800;font-size:16px;padding:4px 10px;border-radius:6px;">${g.score}</span>
      </td>
      <td style="padding:14px 16px;border-bottom:1px solid #1E2640;text-align:center;white-space:nowrap;">
        <div style="font-size:12px;color:#EDF0F7;">${formatDate(g.deadline)}</div>
        <div style="font-size:10px;color:${urgencyColor(days)};font-weight:600;margin-top:2px;">${daysText}</div>
      </td>
      <td style="padding:14px 16px;border-bottom:1px solid #1E2640;text-align:center;white-space:nowrap;">
        <div style="font-size:12px;color:#34D399;">${formatAmount(g.amount_min, g.amount_max)}</div>
      </td>
      <td style="padding:14px 16px;border-bottom:1px solid #1E2640;text-align:center;">
        <a href="${g.apply_url || '#'}" style="background:#34D399;color:#06080F;font-weight:700;font-size:11px;padding:6px 14px;border-radius:5px;text-decoration:none;display:inline-block;">APPLY</a>
      </td>
    </tr>`;
  }).join('');

  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#06080F;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:800px;margin:0 auto;padding:24px 16px;">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#0B0F1A,#0F1424);border:1px solid rgba(52,211,153,.25);border-radius:12px;padding:24px 28px;margin-bottom:20px;">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">
        <div style="width:40px;height:40px;border-radius:8px;background:linear-gradient(135deg,#34D399,#059669);display:flex;align-items:center;justify-content:center;font-weight:900;color:#fff;font-size:18px;">G</div>
        <div>
          <div style="font-size:18px;font-weight:800;color:#EDF0F7;">GRANT PRIME <span style="color:#34D399;">Daily Digest</span></div>
          <div style="font-size:11px;color:#4D5669;letter-spacing:.1em;text-transform:uppercase;">Noble Erne, LLC · ${dateStr}</div>
        </div>
      </div>
      <div style="font-size:13px;color:#8B95AB;margin-top:8px;">
        ${grants.length} high-fit grant ${grants.length === 1 ? 'opportunity' : 'opportunities'} scored ≥70 with deadlines within 60 days.
      </div>
    </div>

    <!-- Grants Table -->
    <table style="width:100%;border-collapse:collapse;background:#0B0F1A;border:1px solid rgba(255,255,255,.06);border-radius:10px;overflow:hidden;">
      <thead>
        <tr style="background:#0F1424;">
          <th style="padding:10px 16px;text-align:left;font-size:10px;font-weight:700;color:#4D5669;letter-spacing:.12em;text-transform:uppercase;">Grant</th>
          <th style="padding:10px 16px;text-align:center;font-size:10px;font-weight:700;color:#4D5669;letter-spacing:.12em;text-transform:uppercase;">Score</th>
          <th style="padding:10px 16px;text-align:center;font-size:10px;font-weight:700;color:#4D5669;letter-spacing:.12em;text-transform:uppercase;">Deadline</th>
          <th style="padding:10px 16px;text-align:center;font-size:10px;font-weight:700;color:#4D5669;letter-spacing:.12em;text-transform:uppercase;">Amount</th>
          <th style="padding:10px 16px;text-align:center;font-size:10px;font-weight:700;color:#4D5669;letter-spacing:.12em;text-transform:uppercase;">Action</th>
        </tr>
      </thead>
      <tbody>
        ${grantRows}
      </tbody>
    </table>

    <!-- Footer -->
    <div style="margin-top:16px;padding:14px 16px;background:#0B0F1A;border:1px solid rgba(255,255,255,.06);border-radius:8px;font-size:11px;color:#4D5669;text-align:center;">
      GRANT PRIME · Noble Erne, LLC · Automated daily digest · Reply to unsubscribe
    </div>
  </div>
</body>
</html>`;
}

// ── Log alerts to Supabase ───────────────────────────────────
async function logAlerts(grants) {
  const alertRows = grants.map(g => ({
    grant_id: g.id,
    alert_type: 'daily_digest',
  }));

  const { error } = await supabase.from('grant_alerts').insert(alertRows);
  if (error) log(`  Alert log error: ${error.message}`);
}

// ── Main ─────────────────────────────────────────────────────
async function main() {
  log('=== GRANT PRIME Alert Agent Starting ===');

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY || !process.env.SENDGRID_API_KEY) {
    log('ERROR: Missing required environment variables');
    process.exit(1);
  }

  // Date 60 days from now
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + 60);
  const cutoffStr = cutoff.toISOString().split('T')[0];

  // Pull top grants: scored ≥70, deadline within 60 days, not yet applied/closed
  const { data: grants, error } = await supabase
    .from('grants')
    .select('id, title, funder, amount_min, amount_max, deadline, notes, score, apply_url, status')
    .eq('status', 'scored')
    .gte('score', 70)
    .lte('deadline', cutoffStr)
    .gte('deadline', new Date().toISOString().split('T')[0]) // not already past
    .order('score', { ascending: false })
    .limit(20);

  if (error) {
    log(`ERROR fetching grants: ${error.message}`);
    process.exit(1);
  }

  if (!grants || grants.length === 0) {
    log('No qualifying grants to alert on today. Exiting.');
    return;
  }

  log(`Found ${grants.length} grants to include in digest`);

  // Build and send the email
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

  const html = buildEmailHTML(grants, today);

  const msg = {
    to: ALERT_EMAIL,
    from: FROM_EMAIL,
    subject: `GRANT PRIME: ${grants.length} High-Fit Grants · ${today}`,
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
