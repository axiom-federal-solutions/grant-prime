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

// ── Noble Erne NAICS codes ──────────────────────────────────
const NOBLE_NAICS = ['541511','541512','541519','541611','541618','611430','611420','611699','611710'];
// ── Walker NAICS codes ──────────────────────────────────────
const WALKER_NAICS = ['236220','238210','237990','236116','561730'];

// ── Target states ────────────────────────────────────────────
const TARGET_STATES = ['TX','LA','VA','FL','OK'];

// ── Query USASpending.gov for recent awards ──────────────────
async function fetchUSASpendingAwards(naicsCodes, entityLabel) {
  const url = 'https://api.usaspending.gov/api/v2/search/spending_by_award/';
  const thisYear = new Date().getFullYear();
  const body = {
    filters: {
      time_period: [{ start_date: `${thisYear-1}-01-01`, end_date: `${thisYear}-12-31` }],
      naics_codes: naicsCodes.slice(0, 5),
      award_type_codes: ['02','03','04','05','A','B','C','D'],
    },
    fields: ['Award ID','Recipient Name','Award Amount','Awarding Agency Name','Place of Performance State Code','Award Type'],
    sort: 'Award Amount',
    order: 'desc',
    limit: 20,
    page: 1,
  };

  const data = await safeFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!data?.results?.length) return { entity: entityLabel, awards: [], totalAmt: 0, avgAmt: 0, topAgencies: [], targetStateAwards: 0 };

  const awards = data.results.map(a => ({
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
async function fetchRecentGrantsGov() {
  const url = 'https://api.grants.gov/grantsws/rest/opportunities/search/';
  const twoDaysAgo = new Date(Date.now() - 48*60*60*1000).toISOString().split('T')[0].replace(/-/g,'/');
  const body = {
    keyword: 'workforce technology training',
    oppStatuses: 'posted',
    postedDateRange: { startDate: twoDaysAgo },
    rows: 10,
    startRecordNum: 0,
    sortBy: 'openDate|desc',
  };

  const data = await safeFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!data?.oppHits?.length) return [];
  return data.oppHits.slice(0, 5).map(o => ({
    title: o.title || 'Unknown',
    agency: o.agencyName || 'Unknown',
    closeDate: o.closeDate || null,
    amount: o.awardFloor || null,
    link: `https://www.grants.gov/search-results-detail/${o.id}`,
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
    { label: 'DOE Workforce', keywords: ['DOE','Department of Energy','energy workforce'] },
    { label: 'HHS/HRSA', keywords: ['HHS','HRSA','health workforce'] },
    { label: 'SBA SBIR/STTR', keywords: ['SBIR','STTR','small business innovation'] },
    { label: 'NSF Education', keywords: ['NSF','National Science Foundation'] },
    { label: 'Veteran Entrepreneurship', keywords: ['veteran entrepreneur','veteran business','veteran-owned startup'] },
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

  log('Querying USASpending.gov for Noble Erne NAICS awards...');
  const nobleIntel = await fetchUSASpendingAwards(NOBLE_NAICS, 'Noble Erne');
  await sleep(1500);

  log('Querying USASpending.gov for Walker Contractors NAICS awards...');
  const walkerIntel = await fetchUSASpendingAwards(WALKER_NAICS, 'Walker Contractors');
  await sleep(1500);

  log('Checking Grants.gov for new postings (48h)...');
  const newPostings = await fetchRecentGrantsGov();

  log('Analyzing source coverage in our DB...');
  const coverage = await getSourceCoverage();

  log('Identifying funding category gaps...');
  const gaps = await getUnusedCategories();

  const intel = {
    generatedAt: new Date().toISOString(),
    nobleErneSector: nobleIntel,
    walkerSector: walkerIntel,
    recentGrantsGovPostings: newPostings,
    dbCoverage: coverage,
    fundingGaps: gaps,
    summary: {
      nobleAvgAward: nobleIntel.avgAmt,
      walkerAvgAward: walkerIntel.avgAmt,
      nobleTopAgency: nobleIntel.topAgencies[0]?.name || 'N/A',
      walkerTopAgency: walkerIntel.topAgencies[0]?.name || 'N/A',
      targetStateHits: nobleIntel.targetStateAwards + walkerIntel.targetStateAwards,
      gapCount: gaps.length,
      newGrantsGovToday: newPostings.length,
    },
  };

  try {
    await supabase.from('system_log').insert({
      agent: 'grant-intel-agent',
      run_at: new Date().toISOString(),
      status: 'success',
      grants_found: (nobleIntel.awards?.length||0) + (walkerIntel.awards?.length||0),
      grants_added: newPostings.length,
      details: JSON.stringify(intel),
    });
    log('Intel written to system_log');
  } catch (err) {
    log(`system_log write failed: ${err.message}`);
  }

  log(`=== Intel Agent Complete: Noble avg $${Math.round((nobleIntel.avgAmt||0)/1000)}K, Walker avg $${Math.round((walkerIntel.avgAmt||0)/1000)}K, ${gaps.length} gaps, ${newPostings.length} new postings ===`);
}

main().catch(err => { log(`FATAL: ${err.message}`); process.exit(1); });
