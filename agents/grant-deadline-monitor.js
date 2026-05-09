// ============================================================
// grant-deadline-monitor.js
// Noble Erne, LLC — GRANT PRIME System
//
// What this does:
//   Runs daily at 8:00 AM CT via GitHub Actions.
//   Checks for grants with deadlines in exactly 7, 14, or 30 days.
//   Sends targeted reminder emails for each threshold.
//   Auto-closes grants whose deadline has already passed.
//   Logs all reminders to grant_alerts table.
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

function formatDate(dateStr) {
  if (!dateStr) return 'No deadline';
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
}

// Get the date that is exactly N days from today (as YYYY-MM-DD string)
function getDateInDays(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

// Get today's date as YYYY-MM-DD
function today() {
  return new Date().toISOString().split('T')[0];
}

// ── Build Reminder Email ─────────────────────────────────────
function buildReminderHTML(grants, daysLabel) {
  const urgencyColor = daysLabel === '7 days' ? '#F87171' : daysLabel === '14 days' ? '#F59E0B' : '#34D399';

  const grantList = grants.map(g => `
  <div style="background:#0F1424;border:1px solid rgba(255,255,255,.06);border-left:3px solid ${urgencyColor};border-radius:8px;padding:14px 16px;margin-bottom:10px;">
    <div style="font-weight:700;font-size:14px;color:#EDF0F7;">${g.title}</div>
    <div style="font-size:12px;color:#8B95AB;margin-top:3px;">${g.funder || 'Unknown Funder'}</div>
    <div style="display:flex;gap:16px;margin-top:8px;font-size:11px;">
      <span style="color:${urgencyColor};font-weight:700;">⏰ Due: ${formatDate(g.deadline)}</span>
      <span style="color:#34D399;font-weight:700;">Score: ${g.score}</span>
    </div>
    ${g.apply_url ? `<div style="margin-top:10px;"><a href="${g.apply_url}" style="background:${urgencyColor};color:#06080F;font-weight:700;font-size:11px;padding:6px 14px;border-radius:5px;text-decoration:none;">VIEW APPLICATION →</a></div>` : ''}
  </div>`).join('');

  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#06080F;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px;">
    <div style="background:#0B0F1A;border:1px solid ${urgencyColor}44;border-radius:12px;padding:20px 24px;margin-bottom:16px;">
      <div style="font-size:11px;color:${urgencyColor};font-weight:700;letter-spacing:.12em;text-transform:uppercase;margin-bottom:6px;">⚡ Deadline Reminder</div>
      <div style="font-size:20px;font-weight:800;color:#EDF0F7;">
        ${grants.length} Grant${grants.length > 1 ? 's' : ''} Due in <span style="color:${urgencyColor};">${daysLabel}</span>
      </div>
      <div style="font-size:13px;color:#8B95AB;margin-top:6px;">Noble Erne, LLC · GRANT PRIME System</div>
    </div>
    ${grantList}
    <div style="margin-top:14px;padding:12px;background:#0B0F1A;border-radius:8px;font-size:10px;color:#4D5669;text-align:center;">
      GRANT PRIME · Noble Erne, LLC · Automated deadline monitor
    </div>
  </div>
</body>
</html>`;
}

// ── Send reminder email ──────────────────────────────────────
async function sendReminder(grants, days) {
  const label = `${days} days`;
  const html = buildReminderHTML(grants, label);

  const urgencyPrefix = days === 7 ? '🚨 URGENT' : days === 14 ? '⚠️ ACTION NEEDED' : '📅 REMINDER';

  const msg = {
    to: ALERT_EMAIL,
    from: FROM_EMAIL,
    subject: `${urgencyPrefix}: ${grants.length} Grant${grants.length > 1 ? 's' : ''} Due in ${label} — GRANT PRIME`,
    html,
  };

  await sgMail.send(msg);
  log(`  Sent ${label} reminder for ${grants.length} grants`);

  // Log to Supabase
  const alertRows = grants.map(g => ({
    grant_id: g.id,
    alert_type: 'deadline_reminder',
  }));
  await supabase.from('grant_alerts').insert(alertRows);
}

// ── Close expired grants ─────────────────────────────────────
async function closeExpiredGrants() {
  const todayStr = today();

  // Find grants past their deadline that aren't already closed/won
  const { data: expired, error } = await supabase
    .from('grants')
    .select('id, title, deadline')
    .lt('deadline', todayStr)
    .in('status', ['new', 'scored']); // don't touch applied/won grants

  if (error) {
    log(`  Error finding expired grants: ${error.message}`);
    return 0;
  }

  if (!expired || expired.length === 0) return 0;

  // Mark them all as closed
  const ids = expired.map(g => g.id);
  const { error: updateError } = await supabase
    .from('grants')
    .update({ status: 'closed' })
    .in('id', ids);

  if (updateError) {
    log(`  Error closing expired grants: ${updateError.message}`);
    return 0;
  }

  log(`  Auto-closed ${expired.length} expired grants`);
  return expired.length;
}

// ── Main ─────────────────────────────────────────────────────
async function main() {
  log('=== GRANT PRIME Deadline Monitor Starting ===');

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY || !process.env.SENDGRID_API_KEY) {
    log('ERROR: Missing required environment variables');
    process.exit(1);
  }

  // Check each threshold: 7, 14, and 30 days out
  const thresholds = [7, 14, 30];
  let totalReminders = 0;

  for (const days of thresholds) {
    const targetDate = getDateInDays(days);

    // Pull grants due on exactly that date, scored ≥50, not yet applied/won/closed
    const { data: grants, error } = await supabase
      .from('grants')
      .select('id, title, funder, deadline, score, apply_url, status')
      .eq('deadline', targetDate)
      .gte('score', 50) // only remind on grants worth pursuing
      .in('status', ['new', 'scored'])
      .order('score', { ascending: false });

    if (error) {
      log(`  Error checking ${days}-day threshold: ${error.message}`);
      continue;
    }

    if (!grants || grants.length === 0) {
      log(`  No grants due in ${days} days`);
      continue;
    }

    log(`  Found ${grants.length} grants due in ${days} days — sending reminder`);

    try {
      await sendReminder(grants, days);
      totalReminders += grants.length;
    } catch (err) {
      log(`  SendGrid error for ${days}-day reminder: ${err.message}`);
    }
  }

  // Auto-close expired grants
  const closed = await closeExpiredGrants();

  log(`=== Deadline Monitor Complete: ${totalReminders} reminders sent, ${closed} grants closed ===`);
}

main().catch(err => {
  log(`FATAL: ${err.message}`);
  process.exit(1);
});
