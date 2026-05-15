// ============================================================
// grant-intel-agent.js
// Noble Erne, LLC — GRANT PRIME System
//
// COMPETITIVE INTELLIGENCE AGENT
// ─────────────────────────────────────────────────────────────
// Pulls competitive intelligence from USASpending.gov:
//   - Recent award winners in Noble Erne NAICS codes
//   - Recent award winners in Walker NAICS codes
//   - Average award sizes by agency/category
//   - Geographic distribution (TX/LA/VA/FL focus)
//   - Funding trend: this year vs last year by category
//
// Also checks Grants.gov for newly posted opportunities
// that haven't hit our discovery agent yet.
//
// Writes to system_log with agent='grant-intel-agent'
// so the dashboard AI Insights tab can read it.
//
// Schedule: Daily 8:20 AM CT
// ============================================================

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

function log(msg) { console.log(`[${new Date().toISOString()}] INTEL: ${msg}`); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function safeFetch(url, options = {}) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    const res = await fetch(url, { ...options, signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    log(`  fetch error ${url.slice(0,60)}: ${err.message}`);
    return null;
  }
}

// ── Entity 1 (IT/EdTech Partner) NAICS codes ─────────────────
const NOBLE_NAICS = ['541511','541512','541519','541611','541618','611430','611420','611699','611710'];
// ── Entity 2 (Construction/SDVOSB Partner) NAICS codes ───────
const WALKER_NAICS = ['236220','238210','237990','236116','561730'];
// ── Entity 3 (STEM Education Partner) NAICS codes ────────────
const STEM_NAICS = ['611110','611519','611710','611699','611430','541715','611310'];

// ── Target states ────────────────────────────────────────────
const TARGET_STATES = ['TX','LA','VA','FL','OK'];

// ── Query USASpending.gov for recent awards ──────────────────
// Note: USASpending v2 requires naics_codes as { require: [...] } object.
// Contract types (A-D) and assistance types (02-05) must be in separate requests.
async function fetchUSASpendingAwards(naicsCodes, entityLabel) {
  const url = 'https://api.usaspending.gov/api/v2/search/spending_by_award/';
  const thisYear = new Date().getFullYear();

  // Fetch contracts (A,B,C,D) and assistance (02,03,04,05) separately, merge results
  async function fetchByType(awardTypes) {
    const body = {
      filters: {
        time_period: [{ start_date: `${thisYear-1}-01-01`, end_date: `${thisYear}-12-31` }],
        naics_codes: { require: naicsCodes.slice(0, 5) },
        award_type_codes: awardTypes,
      },
      fields: ['Award ID','Recipient Name','Award Amount','Awarding Agency Name','Place of Performance State Code','Award Type'],
      sort: 'Award Amount',
      order: 'desc',
      limit: 15,
      page: 1,
    };
    return safeFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  const [contractData, assistData] = await Promise.allSettled([
    fetchByType(['A','B','C','D']),
    fetchByType(['02','03','04','05','06']),
  ]);
  await sleep(500);

  const contractResults = contractData.status === 'fulfilled' ? (contractData.value?.results || []) : [];
  const assistResults   = assistData.status === 'fulfilled'   ? (assistData.value?.results   || []) : [];
  const allResults      = [...contractResults, ...assistResults];

  if (!allResults.length) return { entity: entityLabel, awards: [], totalAmt: 0, avgAmt: 0, topAgencies: [], targetStateAwards: 0 };

  const awards = allResults.map(a => ({
    recipient: a['Recipient Name'],
    amount: Number(a['Award Amount']) || 0,
    agency: a['Awarding Agency Name'],
    state: a['Place of Performance State Code'],
    type: a['Award Type'],
  }));

  const totalAmt = awards.reduce((s, a) => s + a.amount, 0);
  const avgAmt = Math.round(totalAmt / awards.length);

  // Top agencies by award count
  const agencyMap = {};
  for (const a of awards) {
    const ag = (a.agency || 'Unknown').slice(0, 40);
    agencyMap[ag] = (agencyMap[ag] || 0) + 1;
  }
  const topAgencies = Object.entries(agencyMap).sort((a,b)=>b[1]-a[1]).slice(0,4).map(([name,count])=>({name,count}));

  const targetStateAwards = awards.filter(a => TARGET_STATES.includes(a.state)).length;

  return { entity: entityLabel, awards: awards.slice(0, 10), totalAmt: Math.round(totalAmt), avgAmt, topAgencies, targetStateAwards };
}

// ── Check for new Grants.gov postings (last 48h) ─────────────
// Uses the public Grants.gov v2 search API (no key required for GET searches).
// Falls back gracefully if the API changes again.
async function fetchRecentGrantsGov() {
  const twoDaysAgo = new Date(Date.now() - 48*60*60*1000).toISOString().split('T')[0];

  // Try the v2 public search endpoint first
  const params = new URLSearchParams({
    keyword: 'workforce technology training STEM education',
    oppStatuses: 'posted',
    dateRange: 'custom',
    startDateFrom: twoDaysAgo,
    rows: '10',
    sortBy: 'openDate',
    sortOrder: 'desc',
  });

  const url = `https://api.grants.gov/v2/opportunities/search?${params.toString()}`;
  const data = await safeFetch(url);

  // v2 response shape: { data: { hits: [...] } }
  const hits = data?.data?.hits || data?.hits || data?.opportunities || [];
  if (!hits.length) {
    log('  Grants.gov returned 0 results (API may have changed — skipping)');
    return [];
  }

  return hits.slice(0, 5).map(o => ({
    title: o.opportunityTitle || o.title || 'Unknown',
    agency: o.agencyName || o.agency || 'Unknown',
    closeDate: o.closeDate || o.applicationDeadline || null,
    amount: o.awardCeiling || o.awardFloor || null,
    link: `https://www.grants.gov/search-results-detail/${o.opportunityId || o.id}`,
  }));
}

// ── Compute source coverage gaps from our DB ─────────────────
async function getSourceCoverage() {
  const { data } = await supabase
    .from('grants')
    .select('source, score, status')
    .not('status', 'in', '("closed","rejected")');

  if (!data?.length) return {};

  const coverage = {};
  for (const g of data) {
    const src = g.source || 'unknown';
    if (!coverage[src]) coverage[src] = { total: 0, scored65: 0, applied: 0 };
    coverage[src].total++;
    if ((g.score||0) >= 65) coverage[src].scored65++;
    if (g.status === 'applied') coverage[src].applied++;
  }
  return coverage;
}

// ── Identify funding gaps ────────────────────────────────────
async function getUnusedCategories() {
  // Check which of our target categories have 0 high-scoring grants
  const targets = [
    // Entity 1 — IT/EdTech Partner gaps
    { label: 'DOE Workforce Development', keywords: ['DOE','Department of Energy','energy workforce'] },
    { label: 'HHS/HRSA Health IT', keywords: ['HHS','HRSA','health workforce','health IT'] },
    { label: 'SBA SBIR/STTR', keywords: ['SBIR','STTR','small business innovation'] },
    // Entity 2 — Construction/SDVOSB gaps
    { label: 'Veteran Entrepreneurship', keywords: ['veteran entrepreneur','veteran business','veteran-owned startup'] },
    { label: 'HUBZone Construction', keywords: ['HUBZone','hub zone','historically underutilized'] },
    // Entity 3 — STEM Education Partner gaps
    { label: 'NSF Broadening Participation', keywords: ['NSF','National Science Foundation','broadening participation'] },
    { label: 'NASA STEM Education', keywords: ['NASA','aerospace education','rocketry education'] },
    { label: 'K-12 Urban STEM Programs', keywords: ['urban STEM','K-12 STEM','underrepresented youth STEM','after school STEM'] },
    { label: 'Title I STEM Enrichment', keywords: ['Title I','Title 1','underserved school','low-income school'] },
    { label: 'Community Development', keywords: ['CDFI','community development','community investment'] },
  ];

  const { data: grants } = await supabase
    .from('grants')
    .select('title, funder, source, score, notes')
    .gte('score', 65);

  const gaps = [];
  for (const t of targets) {
    const matched = (grants || []).filter(g => {
      const hay = `${g.title} ${g.funder} ${g.notes}`.toLowerCase();
      return t.keywords.some(kw => hay.includes(kw.toLowerCase()));
    });
    if (matched.length === 0) gaps.push(t.label);
  }
  return gaps;
}

async function main() {
  log('=== Grant Intel Agent Starting ===');
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
    log('ERROR: Missing SUPABASE_URL/KEY'); process.exit(1);
  }

  log('Querying USASpending.gov for IT/EdTech Partner NAICS awards...');
  const nobleIntel = await fetchUSASpendingAwards(NOBLE_NAICS, 'IT/EdTech Partner');
  await sleep(1500);

  log('Querying USASpending.gov for Construction Partner NAICS awards...');
  const walkerIntel = await fetchUSASpendingAwards(WALKER_NAICS, 'Construction Partner');
  await sleep(1500);

  log('Querying USASpending.gov for STEM Education Partner NAICS awards...');
  const stemIntel = await fetchUSASpendingAwards(STEM_NAICS, 'STEM Education Partner');
  await sleep(1500);

  log('Checking Grants.gov for new postings (48h)...');
  const newPostings = await fetchRecentGrantsGov();

  log('Analyzing source coverage in our DB...');
  const coverage = await getSourceCoverage();

  log('Identifying funding category gaps...');
  const gaps = await getUnusedCategories();

  const intel = {
    generatedAt: new Date().toISOString(),
    nobleErneSector: nobleIntel,     // IT/EdTech Partner
    walkerSector: walkerIntel,       // Construction Partner
    stemSector: stemIntel,           // STEM Education Partner
    recentGrantsGovPostings: newPostings,
    dbCoverage: coverage,
    fundingGaps: gaps,
    summary: {
      nobleAvgAward: nobleIntel.avgAmt,
      walkerAvgAward: walkerIntel.avgAmt,
      stemAvgAward: stemIntel.avgAmt,
      nobleTopAgency: nobleIntel.topAgencies[0]?.name || 'N/A',
      walkerTopAgency: walkerIntel.topAgencies[0]?.name || 'N/A',
      stemTopAgency: stemIntel.topAgencies[0]?.name || 'N/A',
      targetStateHits: nobleIntel.targetStateAwards + walkerIntel.targetStateAwards + stemIntel.targetStateAwards,
      gapCount: gaps.length,
      newGrantsGovToday: newPostings.length,
    },
  };

  try {
    await supabase.from('system_log').insert({
      agent: 'grant-intel-agent',
      run_at: new Date().toISOString(),
      status: 'success',
      grants_found: (nobleIntel.awards?.length||0) + (walkerIntel.awards?.length||0) + (stemIntel.awards?.length||0),
      grants_added: newPostings.length,
      details: JSON.stringify(intel),
    });
    log('Intel written to system_log');
  } catch (err) {
    log(`system_log write failed: ${err.message}`);
  }

  const fA = v => v>=1e6?'$'+(v/1e6).toFixed(1)+'M':v>=1000?'$'+(v/1000).toFixed(0)+'K':'$'+Math.round(v||0);
  log(`=== Intel Agent Complete: IT/EdTech avg ${fA(nobleIntel.avgAmt)}, Construction avg ${fA(walkerIntel.avgAmt)}, STEM avg ${fA(stemIntel.avgAmt)}, ${gaps.length} gaps, ${newPostings.length} new postings ===`);
}

main().catch(err => { log(`FATAL: ${err.message}`); process.exit(1); });
