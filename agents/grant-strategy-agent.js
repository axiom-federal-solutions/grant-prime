// ============================================================
// grant-strategy-agent.js
// Noble Erne, LLC — GRANT PRIME System
//
// AI STRATEGIC RECOMMENDATIONS AGENT
// ─────────────────────────────────────────────────────────────
// Runs after scoring daily. Reads the current grant pipeline,
// computes coverage gaps and distribution stats, then sends
// the full context to Claude Haiku for strategic analysis.
//
// Outputs:
//   - 5–7 actionable strategic recommendations
//   - Coverage gap analysis by source + category
//   - Opportunity risk flags
//   - Writes to system_log for dashboard to read
//   - Emails strategic brief to treagent1@gmail.com
//
// Schedule: Daily 8:15 AM CT — after scoring, before tests
// Run manually: node agents/grant-strategy-agent.js
// ============================================================

import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import sgMail from '@sendgrid/mail';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
sgMail.setApiKey(process.env.SENDGRID_API_KEY || '');

const ALERT_EMAIL = process.env.ALERT_EMAIL || 'treagent1@gmail.com';
const FROM_EMAIL  = process.env.SENDGRID_FROM_EMAIL || 'treagent1@gmail.com';

function log(msg) { console.log(`[${new Date().toISOString()}] STRATEGY: ${msg}`); }
function fmtAmt(v) { if(!v&&v!==0)return '—'; return v>=1e9?'$'+(v/1e9).toFixed(2)+'B':v>=1e6?'$'+(v/1e6).toFixed(1)+'M':v>=1000?'$'+(v/1000).toFixed(0)+'K':'$'+Math.round(v); }

// ── Build pipeline stats from Supabase ─────────────────────
async function buildPipelineStats() {
  const { data: grants, error } = await supabase
    .from('grants')
    .select('id, score, source, status, amount_max, deadline, notes, entity_fit, funder')
    .not('status', 'in', '("closed","won","rejected")')
    .gt('score', 0);

  if (error || !grants?.length) return null;

  const now = Date.now();

  // Score distribution
  const dist = { '80-100': 0, '65-79': 0, '50-64': 0, '0-49': 0 };
  for (const g of grants) {
    const s = g.score || 0;
    if (s >= 80) dist['80-100']++;
    else if (s >= 65) dist['65-79']++;
    else if (s >= 50) dist['50-64']++;
    else dist['0-49']++;
  }

  // Source breakdown
  const bySource = {};
  for (const g of grants) {
    const src = g.source || 'unknown';
    if (!bySource[src]) bySource[src] = { count: 0, highScore: 0, totalAmt: 0, scored65: 0 };
    bySource[src].count++;
    if ((g.score || 0) >= 80) bySource[src].highScore++;
    if ((g.score || 0) >= 65) bySource[src].scored65++;
    bySource[src].totalAmt += g.amount_max || 0;
  }

  // Entity breakdown
  const noble = grants.filter(g => (g.entity_fit || '').toLowerCase().includes('noble') || !(g.entity_fit || '').toLowerCase().includes('walker'));
  const walker = grants.filter(g => (g.entity_fit || '').toLowerCase().includes('walker') || (g.notes || '').toLowerCase().includes('sdvosb'));

  // Urgency breakdown
  const closing7 = grants.filter(g => {
    if (!g.deadline) return false;
    const d = Math.ceil((new Date(g.deadline) - now) / 86400000);
    return d <= 7 && d > 0;
  }).length;
  const closing30 = grants.filter(g => {
    if (!g.deadline) return false;
    const d = Math.ceil((new Date(g.deadline) - now) / 86400000);
    return d <= 30 && d > 0;
  }).length;
  const rolling = grants.filter(g => !g.deadline).length;

  // Pipeline value
  const totalPipeline = grants.reduce((a, g) => a + (g.amount_max || 0), 0);
  const weightedPipeline = grants.reduce((a, g) => a + ((g.amount_max || 0) * (g.score || 0) / 100), 0);
  const highValueCount = grants.filter(g => (g.amount_max || 0) >= 100000).length;
  const missingAmounts = grants.filter(g => !g.amount_max).length;

  // Applied/won stats
  const { count: applied } = await supabase.from('grants').select('*', { count: 'exact', head: true }).eq('status', 'applied');
  const { count: won } = await supabase.from('grants').select('*', { count: 'exact', head: true }).eq('status', 'won');

  // Top funders by score
  const funderMap = {};
  for (const g of grants.filter(g => (g.score || 0) >= 65)) {
    const f = g.funder || 'Unknown';
    if (!funderMap[f]) funderMap[f] = { count: 0, score: 0, amt: 0 };
    funderMap[f].count++;
    funderMap[f].score += g.score || 0;
    funderMap[f].amt += g.amount_max || 0;
  }
  const topFunders = Object.entries(funderMap)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 8)
    .map(([name, v]) => ({ name, count: v.count, avgScore: Math.round(v.score / v.count), totalAmt: v.amt }));

  return {
    total: grants.length,
    applied: applied || 0,
    won: won || 0,
    winRate: applied ? Math.round((won || 0) / applied * 100) : 0,
    dist,
    bySource,
    nobleErneFit: noble.length,
    walkerFit: walker.length,
    closing7,
    closing30,
    rolling,
    totalPipeline,
    weightedPipeline: Math.round(weightedPipeline),
    highValueCount,
    missingAmounts,
    topFunders,
  };
}

// ── Ask Claude Haiku for strategic recommendations ──────────
async function generateRecommendations(stats) {
  const sourceList = Object.entries(stats.bySource)
    .map(([src, v]) => `  - ${src}: ${v.count} grants, ${v.scored65} score ≥65, $${Math.round(v.totalAmt/1000)}K total`)
    .join('\n');

  const funderList = stats.topFunders.slice(0, 5)
    .map(f => `  - ${f.name}: ${f.count} grants, avg score ${f.avgScore}`)
    .join('\n');

  const prompt = `You are a strategic grant advisor for a 3-partner consortium: an IT & EdTech Partner (SAP/workforce development/instructional design), a Construction Partner (SDVOSB veteran-owned construction/facilities), and a STEM Education Partner (K-12 urban STEM for underrepresented youth, Houston TX). Analyze their grant pipeline and provide 6 specific, actionable strategic recommendations.

PIPELINE DATA:
Total active grants: ${stats.total}
Applications submitted: ${stats.applied} | Won: ${stats.won} | Win rate: ${stats.winRate}%
Score 80-100: ${stats.dist['80-100']} | Score 65-79: ${stats.dist['65-79']} | Score 50-64: ${stats.dist['50-64']} | Score 0-49: ${stats.dist['0-49']}
Closing in 7 days: ${stats.closing7} | Closing in 30 days: ${stats.closing30} | Rolling/no deadline: ${stats.rolling}
IT/EdTech Partner fit: ${stats.nobleErneFit} grants | Construction Partner fit: ${stats.walkerFit} grants
Total pipeline: ${fmtAmt(stats.totalPipeline)} | Probability-weighted: ${fmtAmt(stats.weightedPipeline)}
High-value (≥$100K): ${stats.highValueCount} grants | Missing award amounts: ${stats.missingAmounts}

GRANTS BY SOURCE:
${sourceList}

TOP RECURRING FUNDERS (score ≥65):
${funderList}

Return a JSON array of EXACTLY 6 recommendations. No markdown, no explanation outside the array.
Format: [{"priority":"high|medium|low","category":"Source Gap|Entity Strategy|Timing|Pipeline|Compliance|Competitive","title":"<15 word max title>","insight":"<specific actionable recommendation, 2-3 sentences, reference specific numbers from the data>","action":"<single next step, under 12 words>"}]

Be brutally specific. Reference the actual numbers. No generic advice.`;

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = msg.content[0].text.trim();
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('No JSON in response');
    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    log(`Haiku recommendation error: ${err.message}`);
    return [{
      priority: 'high',
      category: 'Pipeline',
      title: 'Strategy generation failed — retry needed',
      insight: `Claude Haiku returned an invalid response: ${err.message}`,
      action: 'Run strategy agent manually',
    }];
  }
}

// ── Write results to system_log ─────────────────────────────
async function logResults(recommendations, stats) {
  try {
    await supabase.from('system_log').insert({
      agent: 'grant-strategy-agent',
      run_at: new Date().toISOString(),
      status: 'success',
      grants_found: stats.total,
      grants_added: recommendations.length,
      details: JSON.stringify({
        recommendations,
        stats: {
          total: stats.total,
          applied: stats.applied,
          won: stats.won,
          winRate: stats.winRate,
          totalPipeline: stats.totalPipeline,
          weightedPipeline: stats.weightedPipeline,
          dist: stats.dist,
          bySource: stats.bySource,
          closing7: stats.closing7,
          closing30: stats.closing30,
          topFunders: stats.topFunders,
        },
      }),
    });
    log('Results written to system_log');
  } catch (err) {
    log(`system_log write failed: ${err.message}`);
  }
}

// ── Email strategic brief ───────────────────────────────────
async function sendStrategicBrief(recommendations, stats) {
  if (!process.env.SENDGRID_API_KEY) return;

  const priorityColor = { high: '#F87171', medium: '#F59E0B', low: '#34D399' };
  const rows = recommendations.map(r => `
    <div style="margin-bottom:14px;border-left:3px solid ${priorityColor[r.priority]||'#8B95AB'};padding:12px 16px;background:#0F1424;border-radius:0 8px 8px 0;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:6px;">
        <span style="font-size:12px;font-weight:800;color:#EDF0F7;">${r.title}</span>
        <span style="font-size:9px;font-weight:700;padding:2px 7px;border-radius:3px;background:${priorityColor[r.priority]||'#8B95AB'}22;color:${priorityColor[r.priority]||'#8B95AB'};text-transform:uppercase;white-space:nowrap">${r.priority} · ${r.category}</span>
      </div>
      <div style="font-size:12px;color:#8B95AB;line-height:1.65;margin-bottom:6px;">${r.insight}</div>
      <div style="font-size:11px;color:#34D399;font-weight:600;">→ ${r.action}</div>
    </div>`).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#06080F;font-family:'Segoe UI',Arial,sans-serif;">
<div style="max-width:700px;margin:0 auto;padding:24px 16px;">
  <div style="background:#0B0F1A;border:1px solid rgba(167,139,250,.3);border-radius:12px;padding:20px 24px;margin-bottom:18px;">
    <div style="font-size:10px;color:#A78BFA;font-weight:700;letter-spacing:.14em;text-transform:uppercase;margin-bottom:6px;">GRANT PRIME · AI Strategic Brief</div>
    <div style="font-size:20px;font-weight:800;color:#EDF0F7;">Daily Strategy Report</div>
    <div style="font-size:12px;color:#8B95AB;margin-top:4px;">${new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})}</div>
  </div>
  <div style="display:flex;gap:10px;margin-bottom:18px;flex-wrap:wrap;">
    <div style="flex:1;min-width:100px;background:#0F1424;border:1px solid rgba(255,255,255,.06);border-radius:8px;padding:12px;text-align:center;"><div style="font-size:22px;font-weight:800;color:#8B95AB">${stats.total}</div><div style="font-size:9px;color:#4D5669;text-transform:uppercase;letter-spacing:.1em">Active Grants</div></div>
    <div style="flex:1;min-width:100px;background:#0F1424;border:1px solid rgba(255,255,255,.06);border-radius:8px;padding:12px;text-align:center;"><div style="font-size:22px;font-weight:800;color:#34D399">${fmtAmt(stats.weightedPipeline)}</div><div style="font-size:9px;color:#4D5669;text-transform:uppercase;letter-spacing:.1em">Weighted Pipeline</div></div>
    <div style="flex:1;min-width:100px;background:#0F1424;border:1px solid rgba(255,255,255,.06);border-radius:8px;padding:12px;text-align:center;"><div style="font-size:22px;font-weight:800;color:#F87171">${stats.closing7}</div><div style="font-size:9px;color:#4D5669;text-transform:uppercase;letter-spacing:.1em">Closing in 7d</div></div>
    <div style="flex:1;min-width:100px;background:#0F1424;border:1px solid rgba(255,255,255,.06);border-radius:8px;padding:12px;text-align:center;"><div style="font-size:22px;font-weight:800;color:#E9C46A">${stats.winRate}%</div><div style="font-size:9px;color:#4D5669;text-transform:uppercase;letter-spacing:.1em">Win Rate</div></div>
  </div>
  <div style="font-size:10px;font-weight:700;color:#A78BFA;text-transform:uppercase;letter-spacing:.12em;margin-bottom:12px;">🧠 AI Recommendations (Claude Haiku)</div>
  ${rows}
  <div style="margin-top:16px;text-align:center;">
    <a href="https://axiom-federal-solutions.github.io/grant-prime/" style="background:#A78BFA;color:#06080F;font-weight:700;font-size:12px;padding:11px 26px;border-radius:6px;text-decoration:none;display:inline-block;">VIEW FULL DASHBOARD</a>
  </div>
  <div style="margin-top:14px;font-size:9px;color:#4D5669;text-align:center;">GRANT PRIME · AI Strategy Agent · Noble Erne, LLC</div>
</div></body></html>`;

  try {
    await sgMail.send({
      to: ALERT_EMAIL, from: FROM_EMAIL,
      subject: `🧠 GRANT PRIME Strategy: ${recommendations.filter(r=>r.priority==='high').length} high-priority recommendations — ${new Date().toLocaleDateString()}`,
      html,
    });
    log(`Strategic brief sent to ${ALERT_EMAIL}`);
  } catch (err) {
    log(`Email failed: ${err.message}`);
  }
}

async function main() {
  log('=== Grant Strategy Agent Starting ===');
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY || !process.env.ANTHROPIC_API_KEY) {
    log('ERROR: Missing required env vars'); process.exit(1);
  }

  log('Building pipeline stats...');
  const stats = await buildPipelineStats();
  if (!stats) {
    log('No scored grants found — run scoring agent first');
    await supabase.from('system_log').insert({
      agent: 'grant-strategy-agent', run_at: new Date().toISOString(),
      status: 'skipped', grants_found: 0, grants_added: 0,
      details: JSON.stringify({ message: 'No scored grants available' }),
    }).catch(() => {});
    return;
  }

  log(`Pipeline: ${stats.total} grants · $${Math.round(stats.totalPipeline/1000)}K total · $${Math.round(stats.weightedPipeline/1000)}K weighted`);
  log('Generating AI recommendations via Claude Haiku...');
  const recommendations = await generateRecommendations(stats);
  log(`Generated ${recommendations.length} recommendations`);

  await logResults(recommendations, stats);
  await sendStrategicBrief(recommendations, stats);
  log(`=== Strategy Agent Complete: ${recommendations.length} recommendations ===`);
}

main().catch(err => { log(`FATAL: ${err.message}`); process.exit(1); });
