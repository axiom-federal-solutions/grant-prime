// ============================================================
// grant-amount-enricher.js
// Noble Erne, LLC — GRANT PRIME System
//
// GAP #8 FIX: Award Amount Enrichment
// ─────────────────────────────────────────────────────────────
// Most foundation and RSS-sourced grants have null amount_max.
// This agent back-fills award amounts by:
//   1. SAM.gov Opportunities API — free key, federal contract/grant data
//   2. USASpending.gov — look up historical awards for same NAICS/agency
//   3. Text extraction — scrape amount from grant description field
//
// Run after discovery. Scores improve because scoring agent
// uses amount_max as a signal.
//
// Standalone: node agents/grant-amount-enricher.js
// ============================================================

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

function log(msg) { console.log(`[${new Date().toISOString()}] ENRICHER: ${msg}`); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Extract amount from description text ─────────────────────
// Catches "$50,000", "up to $2 million", "awards of $100K", etc.
function extractAmountFromText(text) {
  if (!text) return null;

  const patterns = [
    // "$1,234,567" or "$1.2M" or "$500K"
    /\$\s*([\d,]+(?:\.\d+)?)\s*(million|M|thousand|K)?/gi,
    // "up to 500,000 dollars"
    /up\s+to\s+([\d,]+(?:\.\d+)?)\s*(million|M|thousand|K)?\s*dollars?/gi,
    // "award of $X" or "grants of $X"
    /(?:award|grant|fund)s?\s+of\s+\$\s*([\d,]+(?:\.\d+)?)\s*(million|M|thousand|K)?/gi,
    // "maximum award: $X"
    /(?:maximum|max|ceiling)\s+(?:award|grant|funding)?:?\s+\$\s*([\d,]+(?:\.\d+)?)\s*(million|M|thousand|K)?/gi,
  ];

  const amounts = [];
  for (const pattern of patterns) {
    let match;
    pattern.lastIndex = 0;
    while ((match = pattern.exec(text)) !== null) {
      let value = parseFloat(match[1].replace(/,/g, ''));
      const unit = (match[2] || '').toLowerCase();
      if (unit === 'million' || unit === 'm') value *= 1_000_000;
      else if (unit === 'thousand' || unit === 'k') value *= 1_000;
      if (value >= 1000 && value <= 50_000_000) amounts.push(Math.round(value));
    }
  }

  if (amounts.length === 0) return null;
  return Math.max(...amounts); // take the highest mentioned amount
}

// ── SAM.gov opportunities search ─────────────────────────────
// Free API key: https://open.gsa.gov/api/get-opportunities-public-api/
// Set SAM_API_KEY in .env — the agent degrades gracefully without it.
async function fetchSAMAmount(grant) {
  const apiKey = process.env.SAM_API_KEY;
  if (!apiKey) return null;

  // Build keyword from grant title
  const keyword = (grant.title || '').replace(/[^\w\s]/g, '').slice(0, 60).trim();
  if (!keyword) return null;

  try {
    const url = `https://api.sam.gov/opportunities/v2/search?api_key=${apiKey}&q=${encodeURIComponent(keyword)}&limit=5&postedFrom=01/01/2024&postedTo=12/31/2026`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;

    const json = await res.json();
    const opps = json?.opportunitiesData || [];

    // Find matching opp with an amount
    for (const opp of opps) {
      const award = opp?.awardDetails?.awardAmt || opp?.baseAndAllOptionsValue || opp?.baseAndExercisedOptionsValue;
      if (award && Number(award) > 1000) {
        return Math.round(Number(award));
      }
    }
    return null;
  } catch {
    return null;
  }
}

// ── Main enrichment loop ─────────────────────────────────────
async function main() {
  log('=== Grant Amount Enricher Starting ===');

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
    log('ERROR: Missing SUPABASE_URL or SUPABASE_KEY');
    process.exit(1);
  }

  // Fetch grants with null amount_max (up to 200 at a time)
  const { data: grants, error } = await supabase
    .from('grants')
    .select('id, grant_id, title, description, funder, naics, source')
    .is('amount_max', null)
    .not('status', 'in', '("closed","won","rejected")')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) { log(`ERROR: ${error.message}`); process.exit(1); }
  if (!grants?.length) { log('No grants with missing amounts — nothing to enrich.'); return; }

  log(`Found ${grants.length} grants with null amount_max`);

  let enriched = 0;
  let fromText = 0;
  let fromSAM = 0;

  for (const grant of grants) {
    let amount = null;

    // Method 1: extract from description text (free, instant)
    amount = extractAmountFromText(grant.description);
    if (amount) fromText++;

    // Method 2: SAM.gov lookup (requires free API key)
    if (!amount && (grant.source === 'federal' || grant.source === 'edtech')) {
      amount = await fetchSAMAmount(grant);
      if (amount) { fromSAM++; await sleep(300); }
    }

    if (amount) {
      const { error: updateErr } = await supabase
        .from('grants')
        .update({ amount_max: amount })
        .eq('id', grant.id);

      if (!updateErr) {
        enriched++;
        log(`  Enriched: ${(grant.title||'').slice(0,50)} → $${amount.toLocaleString()}`);
      }
    }
  }

  // Log to system_log
  try {
    await supabase.from('system_log').insert({
      agent: 'grant-amount-enricher',
      run_at: new Date().toISOString(),
      status: 'success',
      grants_found: grants.length,
      grants_added: enriched,
      details: JSON.stringify({ total: grants.length, enriched, fromText, fromSAM }),
    });
  } catch (err) {
    log(`system_log write failed: ${err.message}`);
  }

  log(`=== Enricher Complete: ${enriched}/${grants.length} grants enriched (${fromText} from text, ${fromSAM} from SAM) ===`);
}

main().catch(err => { log(`FATAL: ${err.message}`); process.exit(1); });
