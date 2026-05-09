// ============================================================
// grant-scoring-agent.js
// Noble Erne, LLC — GRANT PRIME System
//
// What this does:
//   Runs after discovery agent each morning.
//   Pulls all grants with status = 'new' from Supabase.
//   Sends them to Claude Haiku in batches of 20.
//   Haiku scores each 0–100 based on fit for Noble Erne.
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

// ── Connections ──────────────────────────────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ── Noble Erne Profile ───────────────────────────────────────
// This is what Haiku uses to score each grant.
// Update this if Noble Erne's focus areas change.
const NOBLE_ERNE_PROFILE = `
Noble Erne, LLC is an IT consulting firm specializing in:
- SAP implementation and upgrades (primary capability)
- Instructional Design and curriculum development
- Software Administration and training program management
- Industries served: Technology, Oil & Gas, Retail, Government/Military, Finance & Banking, Manufacturing & Industrial, EdTech
- Entity type: LLC, small business, consultant/training firm
- Can serve as prime contractor or subcontractor
- Strongest fit: workforce development funding, IT training grants, SAP-related technology programs, EdTech initiatives
`;

// ── Helpers ──────────────────────────────────────────────────
function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
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
  Description: ${(g.description || '').slice(0, 400)}
  Eligibility: ${(g.eligibility || '').slice(0, 200)}
`).join('\n---\n');

  const prompt = `You are scoring grant opportunities for Noble Erne, LLC.

Company Profile:
${NOBLE_ERNE_PROFILE}

Scoring guide:
- 80–100: Strong match (relevant industry + eligible entity type + right scope of work)
- 50–79: Partial match (some overlap with company capabilities or industries)
- 0–49: Poor fit (wrong industry, wrong entity type, or company clearly ineligible)

Score EACH grant below. Return a JSON array ONLY — no other text.
Format: [{"id": "<grant_id>", "score": <0-100>, "reason": "<one sentence>"}]

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
    const { error } = await supabase
      .from('grants')
      .update({
        score: item.score,
        notes: item.reason,
        status: 'scored',
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

  // Pull all unscored grants
  const { data: grants, error } = await supabase
    .from('grants')
    .select('id, title, funder, description, eligibility')
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

  for (let i = 0; i < grants.length; i += batchSize) {
    const batch = grants.slice(i, i + batchSize);
    const batchNum = Math.ceil(i / batchSize) + 1;
    const totalBatches = Math.ceil(grants.length / batchSize);

    log(`Scoring batch ${batchNum}/${totalBatches} (${batch.length} grants)...`);

    const scores = await scoreBatch(batch);
    const updated = await updateScores(scores);
    totalUpdated += updated;

    log(`  Batch ${batchNum}: ${updated} grants scored`);

    // Wait 2 seconds between batches to respect Anthropic rate limits
    if (i + batchSize < grants.length) {
      await sleep(2000);
    }
  }

  log(`=== Scoring Complete: ${totalUpdated}/${grants.length} grants scored ===`);
}

main().catch(err => {
  log(`FATAL: ${err.message}`);
  process.exit(1);
});
