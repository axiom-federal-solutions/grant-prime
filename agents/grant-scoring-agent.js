// ============================================================
// grant-scoring-agent.js
// Noble Erne, LLC — GRANT PRIME System
//
// What this does:
//   Runs after discovery agent each morning.
//   Pulls all grants with status = 'new' from Supabase.
//   Sends them to Claude Haiku in batches of 20.
//   Haiku scores each 0–100 for Noble Erne LLC AND Walker Contractors LLC (SDVOSB).
//   Entity fit stored in notes: [Noble Erne], [Walker Contractors], or [Both].
//   Updates score and status = 'scored' in Supabase.
//
// Cost note:
//   Claude Haiku is ~$0.00025/1K input tokens.
//   A batch of 20 grants ≈ 3,000 tokens = ~$0.001 per batch.
//   Scoring 200 grants/day ≈ $0.01/day = ~$0.30/month.
// ============================================================

import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import sgMail from '@sendgrid/mail';
import { createWriteStream, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const LOG_DIR = join(__dir, '..', 'logs');
try { mkdirSync(LOG_DIR, { recursive: true }); } catch {}
const logFile = createWriteStream(join(LOG_DIR, 'scoring.log'), { flags: 'a' });

// ── Connections ──────────────────────────────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

sgMail.setApiKey(process.env.SENDGRID_API_KEY || '');
const ALERT_EMAIL = process.env.ALERT_EMAIL || 'treagent1@gmail.com';
const FROM_EMAIL  = process.env.SENDGRID_FROM_EMAIL || 'treagent1@gmail.com';

// ── Company Profiles ─────────────────────────────────────────
// Two affiliated entities under Noble Erne, LLC / Axiom Federal Solutions.
// Walker Contractors LLC is SDVOSB-certified — eligible for veteran
// set-asides, VA contracts, DOD small business programs, and SBA set-asides.
//
// NAICS codes sourced from IQE PRIME config/settings.json and scout-state.js
const COMPANY_PROFILES = `
ENTITY 1 — Noble Erne, LLC (Ed / Tech category)
Type: IT consulting firm, LLC, small business, can prime or sub
Primary capabilities: SAP implementation & upgrades, Instructional Design, Software Administration, Training Program Management, eLearning (SCORM/xAPI), LMS administration
Industries: Technology, Oil & Gas, Retail, Government/Military, Finance & Banking, Manufacturing & Industrial, EdTech, Workforce Development
NAICS codes (Noble Erne — Ed/Tech):
  541511 — Custom Computer Programming Services
  541512 — Computer Systems Design Services
  541519 — Other Computer Related Services (SAP/ERP admin)
  541611 — Administrative Management and General Management Consulting
  541618 — Other Management Consulting Services
  611430 — Professional and Management Development Training
  611420 — Computer Training
  611699 — All Other Miscellaneous Schools and Instruction
  611710 — Educational Support Services
Best fit: workforce development grants, IT training funding, SAP/ERP technology programs, EdTech initiatives, capacity building, employee training programs, instructional design contracts

ENTITY 1B — Noble Erne, LLC (STEM category — overlapping)
Noble Erne can also pursue STEM-adjacent grants where technology training, computer science education, or IT capacity building is the primary focus.
NAICS codes (STEM overlap):
  541715 — Research and Development in the Physical, Engineering, and Life Sciences
  541720 — Research and Development in the Social Sciences and Humanities
  611310 — Colleges, Universities and Professional Schools (partnership grants)
  611519 — Other Technical and Trade Schools
  611420 — Computer Training (STEM education pathway)
  334111 — Electronic Computer Manufacturing (deep STEM)
  519130 — Internet Publishing and Broadcasting (EdTech/STEM platform)
Best fit: STEM workforce pipeline grants, computer science education funding, coding bootcamp support, data science training, STEM teacher development, NSF/NIH education supplements

ENTITY 2 — Walker Contractors LLC (DBA: Axiom Federal Solutions)
Type: Construction/renovation/facilities firm, SDVOSB certified, VOSB eligible, small business
Certifications: SDVOSB (Service-Disabled Veteran-Owned Small Business), VOSB (Veteran-Owned Small Business)
Industries: federal construction, commercial renovation, infrastructure, facilities maintenance, janitorial/supply, government renovation
Geography: HQ Dallas TX — targets TX, OK, LA, AR, NM, CO, KS, MO
NAICS codes (Walker Contractors):
  236220 — Commercial and Institutional Building Construction (PRIMARY)
  238210 — Electrical Contractors and Other Wiring Installation
  237990 — Other Heavy and Civil Engineering Construction
  236116 — New Multifamily Housing Construction
  561730 — Landscaping Services / Grounds Maintenance
  424710 — Petroleum and Petroleum Products Merchant Wholesalers (Fuel supply)
  424130 — Industrial Paper / Janitorial Supply Merchant Wholesalers
  424490 — Other Grocery and Related Products (PPE supply)
  424120 — Stationery and Office Supplies Merchant Wholesalers
  424410 — General Line Grocery Merchant Wholesalers (Food/Beverage supply)
Best fit: VA construction/renovation grants, DOD facilities programs, veteran entrepreneurship funding, SBA SDVOSB set-asides, federal construction, infrastructure grants, HUBZone programs, supply chain grants
`;

// ── Helpers ──────────────────────────────────────────────────
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  logFile.write(line + '\n');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Score a batch of grants via Claude Haiku ─────────────────
// We send up to 20 grants at once to save API calls.
async function scoreBatch(grants) {
  // Build the list of grants for Haiku to score
  const grantList = grants.map((g, i) => `
Grant ${i + 1}:
  ID: ${g.id}
  Title: ${g.title}
  Funder: ${g.funder || 'Unknown'}
  Source Category: ${g.source || 'unknown'}
  NAICS Code: ${g.naics || 'not listed'}
  Description: ${(g.description || '').slice(0, 400)}
  Eligibility: ${(g.eligibility || '').slice(0, 200)}
`).join('\n---\n');

  const prompt = `You are scoring grant opportunities for two affiliated companies. Score each grant for BOTH entities and return the HIGHEST score.

Company Profiles:
${COMPANY_PROFILES}

NAICS MATCHING RULES (apply these first before reading description):
- If the grant lists a NAICS code matching Noble Erne's codes (541511, 541512, 541519, 541611, 541618, 611430) → Noble Erne scores 85+
- If the grant lists a NAICS code matching Walker's codes (236220, 238210, 237990, 236116, 561730, 424710, 424130, 424490, 424120, 424410) → Walker scores 85+
- If no NAICS listed, score based on description keywords and industry fit

SCORING GUIDE:
- 90–100: Exact NAICS match + entity eligible + right scope
- 80–89: Strong description fit or NAICS match with minor gaps
- 50–79: Partial match — some overlap with capabilities
- 0–49: Poor fit — wrong industry, wrong entity type, or ineligible

AUTOMATIC HIGH SCORES — Walker Contractors:
- Any grant mentioning: "veteran", "SDVOSB", "VOSB", "service-disabled veteran", "veteran-owned", "veteran set-aside", "veteran contractor", "VA construction", "veteran entrepreneur" → Walker scores 88+
- Any construction, renovation, facilities, or infrastructure grant → Walker scores 75+

AUTOMATIC HIGH SCORES — Noble Erne (Ed/Tech):
- Any grant mentioning: "workforce development", "instructional design", "SAP", "ERP", "IT training", "software training", "eLearning", "EdTech", "technology training", "employee training", "LMS", "curriculum development", "professional development" → Noble Erne scores 85+

AUTOMATIC HIGH SCORES — Noble Erne (STEM):
- Any grant mentioning: "STEM", "computer science education", "coding", "robotics", "cybersecurity education", "data science", "science and technology", "STEM workforce", "broadening participation", "NSF", "NIH education", "STEM after school" → Noble Erne scores 80+ (entity: "Noble Erne", label it STEM in reason)

SUBCONTRACTING OPPORTUNITIES — BOTH entities:
- Any grant/contract mentioning: "subcontracting plan", "mentor protege", "small business teaming", "prime contractor", "subcontract", "teaming agreement" → use entity "Both" and score 75+ if either entity has relevant NAICS. Note "Subcontracting opportunity" in reason.

Return a JSON array ONLY — no markdown, no explanation outside the array.
Format: [{"id": "<grant_uuid>", "score": <0-100>, "entity": "<Noble Erne|Walker Contractors|Both>", "category": "<EdTech|STEM|Construction|Foundation|Federal|Subcontract>", "reason": "<one sentence max 120 chars>"}]

Category rules:
- "STEM" if the grant is science/technology/engineering/math R&D, computer science education, robotics, NSF/NIH funded
- "EdTech" if the grant is training, instructional design, workforce development, SAP/ERP, LMS, curriculum
- "Construction" if the grant is building, renovation, facilities, infrastructure, SDVOSB/veteran construction
- "Foundation" if the grant comes from a private foundation (non-government)
- "Federal" for all other federal government grants that don't fit the above

Grants to score:
${grantList}`;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    });

    const responseText = message.content[0].text.trim();

    // Extract JSON from the response (Haiku sometimes adds extra text)
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('No JSON array found in Haiku response');

    const scores = JSON.parse(jsonMatch[0]);
    return scores;
  } catch (err) {
    log(`  Haiku scoring error: ${err.message}`);
    // Return default scores so we don't block the pipeline
    return grants.map(g => ({ id: g.id, score: 0, reason: 'Scoring failed — retry needed' }));
  }
}

// ── Update scores in Supabase ────────────────────────────────
async function updateScores(scores) {
  let updated = 0;

  for (const item of scores) {
    // Encode entity + category into notes — category column not in current schema.
    // To add it: ALTER TABLE grants ADD COLUMN category TEXT;
    const entityLabel = item.entity   ? `[${item.entity}] `   : '';
    const catLabel    = item.category ? `[${item.category}] ` : '';
    const { error } = await supabase
      .from('grants')
      .update({
        score:      item.score,
        entity_fit: item.entity || 'Noble Erne',
        notes:      `${entityLabel}${catLabel}${item.reason || ''}`,
        status:     'scored',
      })
      .eq('id', item.id);

    if (error) {
      log(`  Failed to update grant ${item.id}: ${error.message}`);
    } else {
      updated++;
    }
  }

  return updated;
}

// ── Main ─────────────────────────────────────────────────────
async function main() {
  log('=== GRANT PRIME Scoring Agent Starting ===');

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY || !process.env.ANTHROPIC_API_KEY) {
    log('ERROR: Missing required environment variables');
    process.exit(1);
  }

  // Pull all unscored grants — include naics and source for better scoring
  const { data: grants, error } = await supabase
    .from('grants')
    .select('id, title, funder, description, eligibility, source, naics')
    .eq('status', 'new');

  if (error) {
    log(`ERROR fetching grants: ${error.message}`);
    process.exit(1);
  }

  if (!grants || grants.length === 0) {
    log('No new grants to score. Exiting.');
    return;
  }

  log(`Found ${grants.length} grants to score`);

  // Process in batches of 20 (Haiku handles this well, stays cheap)
  const batchSize = 20;
  let totalUpdated = 0;
  let totalHighScore = 0;

  for (let i = 0; i < grants.length; i += batchSize) {
    const batch = grants.slice(i, i + batchSize);
    const batchNum = Math.ceil(i / batchSize) + 1;
    const totalBatches = Math.ceil(grants.length / batchSize);

    log(`Scoring batch ${batchNum}/${totalBatches} (${batch.length} grants)...`);

    const scores = await scoreBatch(batch);
    totalHighScore += scores.filter(s => s.score >= 80).length;
    const updated = await updateScores(scores);
    totalUpdated += updated;

    log(`  Batch ${batchNum}: ${updated} grants scored`);

    // Wait 2 seconds between batches to respect Anthropic rate limits
    if (i + batchSize < grants.length) {
      await sleep(2000);
    }
  }

  log(`=== Scoring Complete: ${totalUpdated}/${grants.length} grants scored ===`);

  // ── Write run summary to system_log ──────────────────────
  try {
    await supabase.from('system_log').insert({
      agent: 'grant-scoring-agent',
      run_at: new Date().toISOString(),
      status: 'success',
      grants_found: grants.length,
      grants_added: totalUpdated,
      details: JSON.stringify({
        total_scored: totalUpdated,
        high_score_count: totalHighScore,
        batches: Math.ceil(grants.length / 20),
      }),
    });
    log('System log written to Supabase');
  } catch (err) {
    log(`System log write failed (non-fatal): ${err.message}`);
  }

  // ── Scoring completion email digest ──────────────────────
  if (process.env.SENDGRID_API_KEY && totalUpdated > 0) {
    try {
      // Pull top 10 high-scoring grants for the digest
      const { data: topGrants } = await supabase
        .from('grants')
        .select('title, funder, score, entity_fit, deadline, apply_url')
        .eq('status', 'scored')
        .gte('score', 75)
        .order('score', { ascending: false })
        .limit(10);

      const rows = (topGrants || []).map(g => `
        <tr>
          <td style="padding:8px 10px;border-bottom:1px solid #1a2540;font-size:12px;color:#EDF0F7">${g.title?.slice(0, 60)}${g.title?.length > 60 ? '…' : ''}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #1a2540;font-size:12px;color:#8B95AB">${g.funder || '—'}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #1a2540;font-size:12px;text-align:center;font-weight:800;color:${g.score >= 85 ? '#34D399' : g.score >= 75 ? '#E9C46A' : '#F59E0B'}">${g.score}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #1a2540;font-size:11px;color:#8B95AB">${g.deadline || '—'}</td>
        </tr>`).join('');

      const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#06080F;font-family:'Segoe UI',Arial,sans-serif;">
<div style="max-width:700px;margin:0 auto;padding:24px 16px;">
  <div style="background:#0B0F1A;border:1px solid rgba(52,211,153,.25);border-radius:12px;padding:20px 24px;margin-bottom:20px;">
    <div style="font-size:10px;color:#34D399;font-weight:700;letter-spacing:.12em;text-transform:uppercase;margin-bottom:6px">GRANT PRIME · Scoring Complete</div>
    <div style="font-size:20px;font-weight:800;color:#EDF0F7">Daily Scoring Report</div>
    <div style="font-size:13px;color:#8B95AB;margin-top:4px">${new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'})}</div>
  </div>
  <div style="display:flex;gap:12px;margin-bottom:20px">
    <div style="flex:1;background:#0F1424;border:1px solid rgba(255,255,255,.06);border-radius:8px;padding:16px;text-align:center">
      <div style="font-size:28px;font-weight:800;color:#34D399">${totalUpdated}</div>
      <div style="font-size:10px;color:#8B95AB;text-transform:uppercase;letter-spacing:.1em">Grants Scored</div>
    </div>
    <div style="flex:1;background:#0F1424;border:1px solid rgba(255,255,255,.06);border-radius:8px;padding:16px;text-align:center">
      <div style="font-size:28px;font-weight:800;color:#E9C46A">${totalHighScore}</div>
      <div style="font-size:10px;color:#8B95AB;text-transform:uppercase;letter-spacing:.1em">Score 80+</div>
    </div>
  </div>
  ${rows ? `<div style="background:#0F1424;border:1px solid rgba(255,255,255,.06);border-radius:8px;overflow:hidden;margin-bottom:20px">
    <div style="padding:12px 16px;font-size:10px;color:#4D5669;font-weight:700;letter-spacing:.1em;text-transform:uppercase;border-bottom:1px solid rgba(255,255,255,.06)">Top Opportunities (Score 75+)</div>
    <table style="width:100%;border-collapse:collapse">
      <thead><tr style="background:#0B0F1A">
        <th style="padding:8px 10px;text-align:left;font-size:10px;color:#4D5669;font-weight:700;text-transform:uppercase">Grant</th>
        <th style="padding:8px 10px;text-align:left;font-size:10px;color:#4D5669;font-weight:700;text-transform:uppercase">Funder</th>
        <th style="padding:8px 10px;text-align:center;font-size:10px;color:#4D5669;font-weight:700;text-transform:uppercase">Score</th>
        <th style="padding:8px 10px;text-align:left;font-size:10px;color:#4D5669;font-weight:700;text-transform:uppercase">Deadline</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>` : ''}
  <div style="text-align:center;margin-top:16px">
    <a href="https://axiom-federal-solutions.github.io/grant-prime/" style="background:#34D399;color:#06080F;font-weight:700;font-size:12px;padding:12px 28px;border-radius:6px;text-decoration:none;display:inline-block">OPEN GRANT PRIME DASHBOARD</a>
  </div>
  <div style="margin-top:14px;padding:12px;background:#0B0F1A;border-radius:8px;font-size:10px;color:#4D5669;text-align:center">
    GRANT PRIME · Noble Erne, LLC · Automated by Claude Haiku
  </div>
</div></body></html>`;

      await sgMail.send({
        to: ALERT_EMAIL,
        from: FROM_EMAIL,
        subject: `GRANT PRIME: ${totalUpdated} grants scored — ${totalHighScore} high-priority`,
        html,
      });
      log(`Scoring digest emailed to ${ALERT_EMAIL}`);
    } catch (emailErr) {
      log(`Scoring email failed (non-fatal): ${emailErr.message}`);
    }
  }
}

main().catch(err => {
  log(`FATAL: ${err.message}`);
  process.exit(1);
});
