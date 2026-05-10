// ============================================================
// grant-discovery-agent.js
// Noble Erne, LLC — GRANT PRIME System
//
// What this does:
//   Runs daily at 6:00 AM CT via GitHub Actions.
//   Pulls new grant opportunities from:
//     1. Grants.gov API (federal grants)
//     2. SAM.gov API (federal contracts/grants)
//     3. DOL WIOA (workforce dev / EdTech)
//     4. NSF Award Search (EdTech / tech grants)
//   Deduplicates by grant_id before inserting.
//   New records go into Supabase with status = 'new'.
// ============================================================

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

// ── Connect to Supabase ──────────────────────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// ── Helpers ──────────────────────────────────────────────────

// Log with a timestamp so we know when things ran
function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

// Wait between API calls so we don't get rate-limited (1 req/sec)
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Retry a fetch up to 3 times with exponential backoff
async function fetchWithRetry(url, options = {}, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, options);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return res;
    } catch (err) {
      if (i === retries - 1) throw err;
      const wait = Math.pow(2, i) * 1000; // 1s, 2s, 4s
      log(`  Retry ${i + 1}/${retries} in ${wait}ms — ${err.message}`);
      await sleep(wait);
    }
  }
}

// Insert grants into Supabase, skipping ones we already have
async function upsertGrants(grants) {
  if (!grants.length) return 0;

  // onConflict: if grant_id already exists, do nothing (skip it)
  const { data, error } = await supabase
    .from('grants')
    .upsert(grants, { onConflict: 'grant_id', ignoreDuplicates: true })
    .select('id');

  if (error) {
    log(`  Supabase error: ${error.message}`);
    return 0;
  }
  return data?.length || 0;
}

// ── Source 1: Grants.gov ────────────────────────────────────
// Searches for grants relevant to Noble Erne's industries.
// API docs: https://www.grants.gov/web/grants/search-grants.html
async function fetchGrantsGov() {
  log('Fetching Grants.gov...');
  const results = [];

  // Search keywords that match Noble Erne's work
  const keywords = [
    'workforce development',
    'instructional design',
    'technology training',
    'SAP implementation',
    'small business technology',
    'EdTech',
    'information technology consulting',
  ];

  for (const keyword of keywords) {
    try {
      // Grants.gov search2 API — no API key required
      const url = `https://api.grants.gov/v1/api/search2`;
      const body = JSON.stringify({
        keyword,
        oppStatuses: 'forecasted|posted', // active opportunities only
        rows: 25,
        startRecordNum: 0,
        sortBy: 'openDate|desc',
      });

      const res = await fetchWithRetry(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body,
      });

      const json = await res.json();
      const opps = json.data?.oppHits || json.oppHits || [];

      for (const opp of opps) {
        results.push({
          source: 'federal',
          grant_id: `grants-gov-${opp.id}`,
          title: opp.title || 'Untitled',
          funder: opp.agencyName || 'Federal Agency',
          amount_min: null,
          amount_max: opp.awardCeiling ? Number(opp.awardCeiling) : null,
          deadline: opp.closeDate ? new Date(opp.closeDate).toISOString().split('T')[0] : null,
          description: opp.synopsis || '',
          eligibility: opp.applicantTypes?.join(', ') || '',
          apply_url: `https://www.grants.gov/search-results-detail/${opp.id}`,
          status: 'new',
        });
      }

      log(`  Grants.gov "${keyword}": ${opps.length} results`);
      await sleep(1000); // 1 req/sec rate limit
    } catch (err) {
      log(`  Grants.gov error for "${keyword}": ${err.message}`);
    }
  }

  return results;
}

// ── Source 2: SAM.gov ───────────────────────────────────────
// SAM.gov has both federal contracts AND grants.
// API docs: https://open.gsa.gov/api/opportunities-api/
async function fetchSamGov() {
  log('Fetching SAM.gov...');
  const results = [];

  const keywords = ['training', 'workforce', 'technology consulting', 'instructional'];

  for (const keyword of keywords) {
    try {
      const params = new URLSearchParams({
        api_key: process.env.SAM_GOV_API_KEY || '',
        q: keyword,
        ptype: 'g', // g = grant
        limit: '20',
        offset: '0',
      });

      const res = await fetchWithRetry(
        `https://api.sam.gov/opportunities/v2/search?${params}`
      );
      const json = await res.json();
      const opps = json.opportunitiesData || [];

      for (const opp of opps) {
        results.push({
          source: 'federal',
          grant_id: `sam-gov-${opp.noticeId}`,
          title: opp.title || 'Untitled',
          funder: opp.department || opp.subtierName || 'Federal',
          amount_min: null,
          amount_max: null,
          deadline: opp.responseDeadLine
            ? new Date(opp.responseDeadLine).toISOString().split('T')[0]
            : null,
          description: opp.description || '',
          eligibility: '',
          apply_url: opp.uiLink || `https://sam.gov/opp/${opp.noticeId}`,
          status: 'new',
        });
      }

      log(`  SAM.gov "${keyword}": ${opps.length} results`);
      await sleep(1000);
    } catch (err) {
      log(`  SAM.gov error for "${keyword}": ${err.message}`);
    }
  }

  return results;
}

// ── Source 3: DOL WIOA / Workforce Dev ─────────────────────
// Department of Labor publishes WIOA grants via their API.
// These are prime targets for Noble Erne's EdTech/training work.
async function fetchDOLWorkforce() {
  log('Fetching DOL Workforce grants...');
  const results = [];

  try {
    // DOL uses Grants.gov backend — search specifically for DOL agency
    const url = `https://api.grants.gov/v1/api/search2`;
    const body = JSON.stringify({
      agencies: 'DOL',
      oppStatuses: 'forecasted|posted',
      rows: 25,
      startRecordNum: 0,
    });

    const res = await fetchWithRetry(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    const json = await res.json();
    const opps = json.data?.oppHits || json.oppHits || [];

    for (const opp of opps) {
      results.push({
        source: 'edtech',
        grant_id: `dol-${opp.id}`,
        title: opp.title || 'Untitled',
        funder: 'U.S. Department of Labor',
        amount_min: null,
        amount_max: opp.awardCeiling ? Number(opp.awardCeiling) : null,
        deadline: opp.closeDate ? new Date(opp.closeDate).toISOString().split('T')[0] : null,
        description: opp.synopsis || '',
        eligibility: opp.applicantTypes?.join(', ') || '',
        apply_url: `https://www.grants.gov/search-results-detail/${opp.id}`,
        status: 'new',
      });
    }

    log(`  DOL grants: ${opps.length} results`);
  } catch (err) {
    log(`  DOL error: ${err.message}`);
  }

  await sleep(1000);
  return results;
}

// ── Source 4: NSF (National Science Foundation) ─────────────
// NSF funds EdTech, STEM, and technology programs.
// Good fit for Noble Erne's tech + training work.
async function fetchNSF() {
  log('Fetching NSF grants...');
  const results = [];

  try {
    // NSF Awards API is public — no key needed
    const params = new URLSearchParams({
      keyword: 'workforce training technology',
      dateStart: getDateDaysAgo(30), // only look at last 30 days
      printFields: 'id,title,agency,awardeeName,fundsObligatedAmt,date,expDate,abstractText',
      offset: '1',
    });

    const res = await fetchWithRetry(
      `https://api.nsf.gov/services/v1/awards.json?${params}`
    );
    const json = await res.json();
    const awards = json.response?.award || [];

    for (const award of awards.slice(0, 20)) {
      results.push({
        source: 'edtech',
        grant_id: `nsf-${award.id}`,
        title: award.title || 'NSF Award',
        funder: 'National Science Foundation',
        amount_min: null,
        amount_max: award.fundsObligatedAmt ? Number(award.fundsObligatedAmt) : null,
        deadline: award.expDate
          ? new Date(award.expDate).toISOString().split('T')[0]
          : null,
        description: award.abstractText || '',
        eligibility: 'Research institutions, nonprofits, small businesses',
        apply_url: `https://www.nsf.gov/awardsearch/showAward?AWD_ID=${award.id}`,
        status: 'new',
      });
    }

    log(`  NSF grants: ${awards.length} results`);
  } catch (err) {
    log(`  NSF error: ${err.message}`);
  }

  return results;
}

// Returns a date string N days ago in MM/DD/YYYY format (NSF API format)
function getDateDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
}

// ── Main ─────────────────────────────────────────────────────
async function main() {
  log('=== GRANT PRIME Discovery Agent Starting ===');

  // Validate env vars before doing anything
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
    log('ERROR: Missing SUPABASE_URL or SUPABASE_KEY');
    process.exit(1);
  }

  let totalNew = 0;

  // Run all 4 sources
  const [grantsGov, samGov, dol, nsf] = await Promise.allSettled([
    fetchGrantsGov(),
    fetchSamGov(),
    fetchDOLWorkforce(),
    fetchNSF(),
  ]);

  // Combine all results, filter out failed sources
  const allGrants = [
    ...(grantsGov.status === 'fulfilled' ? grantsGov.value : []),
    ...(samGov.status === 'fulfilled' ? samGov.value : []),
    ...(dol.status === 'fulfilled' ? dol.value : []),
    ...(nsf.status === 'fulfilled' ? nsf.value : []),
  ];

  log(`Total grants found across all sources: ${allGrants.length}`);

  // Insert in batches of 50 to avoid Supabase payload limits
  const batchSize = 50;
  for (let i = 0; i < allGrants.length; i += batchSize) {
    const batch = allGrants.slice(i, i + batchSize);
    const inserted = await upsertGrants(batch);
    totalNew += inserted;
    log(`  Batch ${Math.ceil(i / batchSize) + 1}: ${inserted} new grants inserted`);
  }

  log(`=== Discovery Complete: ${totalNew} new grants added to Supabase ===`);
}

main().catch(err => {
  log(`FATAL: ${err.message}`);
  process.exit(1);
});
