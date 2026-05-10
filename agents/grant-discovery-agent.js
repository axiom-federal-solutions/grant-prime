// ============================================================
// grant-discovery-agent.js
// Noble Erne, LLC — GRANT PRIME System
//
// Sources covered:
//   FEDERAL:     Grants.gov search2 API (DOL, DOE, HUD, SBA, NSF, general)
//   STATE:       DOE Title programs, HUD Community Dev, SBA regional
//   FOUNDATION:  RSS feeds from Gates, Lumina, MacArthur, RWJF, Kresge
//   EDTECH:      DOL WIOA, DOE Title IV, NSF STEM
//
// Runs daily at 6:00 AM CT via GitHub Actions.
// Deduplicates by grant_id. New records status = 'new'.
// ============================================================

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// ── Helpers ──────────────────────────────────────────────────
function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchWithRetry(url, options = {}, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, { ...options, signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (err) {
      if (i === retries - 1) throw err;
      const wait = Math.pow(2, i) * 1000;
      log(`  Retry ${i + 1}/${retries} in ${wait}ms — ${err.message}`);
      await sleep(wait);
    }
  }
}

async function upsertGrants(grants) {
  if (!grants.length) return 0;
  const { data, error } = await supabase
    .from('grants')
    .upsert(grants, { onConflict: 'grant_id', ignoreDuplicates: true })
    .select('id');
  if (error) { log(`  Supabase error: ${error.message}`); return 0; }
  return data?.length || 0;
}

// ── Source 1: Grants.gov search2 (Federal + State programs) ──
// No API key required. Searches by keyword AND by specific agencies.
async function fetchGrantsGov() {
  log('Fetching Grants.gov (federal keywords)...');
  const results = [];

  const keywords = [
    'workforce development',
    'instructional design',
    'technology training',
    'SAP implementation',
    'small business technology',
    'EdTech',
    'information technology consulting',
    'employee training',
    'capacity building technology',
  ];

  for (const keyword of keywords) {
    try {
      const res = await fetchWithRetry('https://api.grants.gov/v1/api/search2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyword,
          oppStatuses: 'forecasted|posted',
          rows: 20,
          startRecordNum: 0,
          sortBy: 'openDate|desc',
        }),
      });
      const json = await res.json();
      const opps = json.data?.oppHits || json.oppHits || [];

      for (const opp of opps) {
        results.push({
          source: 'federal',
          grant_id: `grants-gov-${opp.id}`,
          title: opp.title || 'Untitled',
          funder: opp.agencyName || 'Federal Agency',
          amount_max: opp.awardCeiling ? Number(opp.awardCeiling) : null,
          deadline: opp.closeDate ? new Date(opp.closeDate).toISOString().split('T')[0] : null,
          description: opp.synopsis || '',
          eligibility: opp.applicantTypes?.join(', ') || '',
          apply_url: `https://www.grants.gov/search-results-detail/${opp.id}`,
          status: 'new',
        });
      }
      log(`  Grants.gov "${keyword}": ${opps.length} results`);
      await sleep(1000);
    } catch (err) {
      log(`  Grants.gov error for "${keyword}": ${err.message}`);
    }
  }
  return results;
}

// ── Source 2: Specific Federal Agencies via Grants.gov ───────
// Targets DOL, DOE, HUD, SBA — all relevant to Noble Erne
async function fetchFederalAgencies() {
  log('Fetching federal agency-specific grants...');
  const results = [];

  const agencies = [
    { code: 'DOL', name: 'U.S. Department of Labor', source: 'edtech' },
    { code: 'ED',  name: 'U.S. Department of Education', source: 'edtech' },
    { code: 'HUD', name: 'U.S. Dept of Housing & Urban Dev', source: 'state' },
    { code: 'SBA', name: 'U.S. Small Business Administration', source: 'federal' },
    { code: 'DOC', name: 'U.S. Department of Commerce', source: 'federal' },
    { code: 'NSF', name: 'National Science Foundation', source: 'edtech' },
  ];

  for (const agency of agencies) {
    try {
      const res = await fetchWithRetry('https://api.grants.gov/v1/api/search2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agencies: agency.code,
          oppStatuses: 'forecasted|posted',
          rows: 25,
          startRecordNum: 0,
        }),
      });
      const json = await res.json();
      const opps = json.data?.oppHits || json.oppHits || [];

      for (const opp of opps) {
        results.push({
          source: agency.source,
          grant_id: `agency-${agency.code.toLowerCase()}-${opp.id}`,
          title: opp.title || 'Untitled',
          funder: agency.name,
          amount_max: opp.awardCeiling ? Number(opp.awardCeiling) : null,
          deadline: opp.closeDate ? new Date(opp.closeDate).toISOString().split('T')[0] : null,
          description: opp.synopsis || '',
          eligibility: opp.applicantTypes?.join(', ') || '',
          apply_url: `https://www.grants.gov/search-results-detail/${opp.id}`,
          status: 'new',
        });
      }
      log(`  ${agency.code}: ${opps.length} results`);
      await sleep(1200);
    } catch (err) {
      log(`  ${agency.code} error: ${err.message}`);
    }
  }
  return results;
}

// ── Source 3: State Grants via Grants.gov Funding Categories ──
// Workforce (WD), Education (ED), Employment/Labor/Training (ELT)
async function fetchStateWorkforce() {
  log('Fetching state/workforce funding categories...');
  const results = [];

  const categories = [
    { code: 'WD', label: 'Workforce Development' },
    { code: 'ED', label: 'Education' },
    { code: 'ELT', label: 'Employment Labor Training' },
    { code: 'ISS', label: 'Information and Statistics' },
    { code: 'BC', label: 'Business and Commerce' },
  ];

  for (const cat of categories) {
    try {
      const res = await fetchWithRetry('https://api.grants.gov/v1/api/search2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fundingCategories: cat.code,
          oppStatuses: 'posted',
          rows: 20,
          startRecordNum: 0,
        }),
      });
      const json = await res.json();
      const opps = json.data?.oppHits || json.oppHits || [];

      for (const opp of opps) {
        results.push({
          source: 'state',
          grant_id: `state-cat-${cat.code}-${opp.id}`,
          title: opp.title || 'Untitled',
          funder: opp.agencyName || `${cat.label} Program`,
          amount_max: opp.awardCeiling ? Number(opp.awardCeiling) : null,
          deadline: opp.closeDate ? new Date(opp.closeDate).toISOString().split('T')[0] : null,
          description: opp.synopsis || '',
          eligibility: opp.applicantTypes?.join(', ') || '',
          apply_url: `https://www.grants.gov/search-results-detail/${opp.id}`,
          status: 'new',
        });
      }
      log(`  Category "${cat.label}": ${opps.length} results`);
      await sleep(1000);
    } catch (err) {
      log(`  Category ${cat.code} error: ${err.message}`);
    }
  }
  return results;
}

// ── Source 4: Foundation RSS Feeds ───────────────────────────
// Major foundations that publish grant opportunities via RSS/XML.
// These are free, no API key needed.
async function fetchFoundationRSS() {
  log('Fetching foundation RSS feeds...');
  const results = [];

  // Foundations with public RSS/news feeds
  const feeds = [
    {
      name: 'Bill & Melinda Gates Foundation',
      url: 'https://www.gatesfoundation.org/about/media-center/rss',
      source: 'foundation',
    },
    {
      name: 'Lumina Foundation',
      url: 'https://www.luminafoundation.org/feed/',
      source: 'foundation',
    },
    {
      name: 'MacArthur Foundation',
      url: 'https://www.macfound.org/rss/grants/',
      source: 'foundation',
    },
    {
      name: 'Robert Wood Johnson Foundation',
      url: 'https://www.rwjf.org/en/grants/grant-opportunities.feed.rss',
      source: 'foundation',
    },
    {
      name: 'Kresge Foundation',
      url: 'https://kresge.org/feed/',
      source: 'foundation',
    },
    {
      name: 'JP Morgan Chase Foundation',
      url: 'https://www.jpmorganchase.com/impact/philanthropy.feed',
      source: 'foundation',
    },
  ];

  for (const feed of feeds) {
    try {
      const res = await fetchWithRetry(feed.url, {
        headers: { 'User-Agent': 'Grant-Prime-Bot/1.0 (Noble Erne LLC grant research)' },
      });
      const xml = await res.text();

      // Parse RSS items with a simple regex — no XML library needed
      const items = [...xml.matchAll(/<item[^>]*>([\s\S]*?)<\/item>/gi)];

      let count = 0;
      for (const item of items.slice(0, 10)) {
        const content = item[1];
        const title = extractTag(content, 'title');
        const link = extractTag(content, 'link');
        const description = extractTag(content, 'description');
        const pubDate = extractTag(content, 'pubDate');
        const guid = extractTag(content, 'guid') || link;

        if (!title || !link) continue;

        // Only include items that look grant-related
        const grantKeywords = /grant|fund|award|opportunit|rfp|request for proposal/i;
        if (!grantKeywords.test(title) && !grantKeywords.test(description)) continue;

        results.push({
          source: feed.source,
          grant_id: `rss-${Buffer.from(guid || title).toString('base64').slice(0, 32)}`,
          title: cleanText(title),
          funder: feed.name,
          amount_min: null,
          amount_max: null,
          deadline: pubDate ? parseRSSDate(pubDate) : null,
          description: cleanText(description).slice(0, 800),
          eligibility: 'See funder website for eligibility details',
          apply_url: link,
          status: 'new',
        });
        count++;
      }
      log(`  ${feed.name}: ${count} grant items`);
      await sleep(1500);
    } catch (err) {
      log(`  RSS error for ${feed.name}: ${err.message}`);
    }
  }
  return results;
}

// ── Source 5: NSF Awards (EdTech / STEM / Tech Training) ─────
async function fetchNSF() {
  log('Fetching NSF awards...');
  const results = [];
  try {
    const params = new URLSearchParams({
      keyword: 'workforce training technology education',
      dateStart: getDateDaysAgo(45),
      printFields: 'id,title,agency,fundsObligatedAmt,date,expDate,abstractText',
      offset: '1',
    });
    const res = await fetchWithRetry(
      `https://api.nsf.gov/services/v1/awards.json?${params}`
    );
    const json = await res.json();
    const awards = json.response?.award || [];

    for (const award of awards.slice(0, 15)) {
      results.push({
        source: 'edtech',
        grant_id: `nsf-${award.id}`,
        title: award.title || 'NSF Award',
        funder: 'National Science Foundation',
        amount_max: award.fundsObligatedAmt ? Number(award.fundsObligatedAmt) : null,
        deadline: award.expDate ? parseFlexDate(award.expDate) : null,
        description: (award.abstractText || '').slice(0, 800),
        eligibility: 'Research institutions, nonprofits, small businesses with R&D focus',
        apply_url: `https://www.nsf.gov/awardsearch/showAward?AWD_ID=${award.id}`,
        status: 'new',
      });
    }
    log(`  NSF: ${awards.length} results`);
  } catch (err) {
    log(`  NSF error: ${err.message}`);
  }
  return results;
}

// ── XML / Date Helpers ────────────────────────────────────────
function extractTag(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, 'i'))
    || xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? match[1].trim() : '';
}

function cleanText(str) {
  return str
    .replace(/<[^>]+>/g, '')     // strip HTML tags
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function parseRSSDate(dateStr) {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    // RSS pub dates are when the grant was posted, not the deadline
    // Add 90 days as estimated deadline
    d.setDate(d.getDate() + 90);
    return d.toISOString().split('T')[0];
  } catch { return null; }
}

function parseFlexDate(dateStr) {
  try {
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
  } catch { return null; }
}

function getDateDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${String(d.getMonth() + 1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}/${d.getFullYear()}`;
}

// ── Main ─────────────────────────────────────────────────────
async function main() {
  log('=== GRANT PRIME Discovery Agent Starting ===');

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
    log('ERROR: Missing SUPABASE_URL or SUPABASE_KEY');
    process.exit(1);
  }

  // Run all sources — if one fails the others still run
  const [federal, agencies, state, foundation, nsf] = await Promise.allSettled([
    fetchGrantsGov(),
    fetchFederalAgencies(),
    fetchStateWorkforce(),
    fetchFoundationRSS(),
    fetchNSF(),
  ]);

  const allGrants = [
    ...(federal.status    === 'fulfilled' ? federal.value    : []),
    ...(agencies.status   === 'fulfilled' ? agencies.value   : []),
    ...(state.status      === 'fulfilled' ? state.value      : []),
    ...(foundation.status === 'fulfilled' ? foundation.value : []),
    ...(nsf.status        === 'fulfilled' ? nsf.value        : []),
  ];

  log(`Total grants found across all sources: ${allGrants.length}`);

  // Insert in batches of 50
  let totalNew = 0;
  const batchSize = 50;
  for (let i = 0; i < allGrants.length; i += batchSize) {
    const batch = allGrants.slice(i, i + batchSize);
    const inserted = await upsertGrants(batch);
    totalNew += inserted;
    log(`  Batch ${Math.ceil(i/batchSize)+1}: ${inserted} new grants inserted`);
  }

  log(`=== Discovery Complete: ${totalNew} new grants added to Supabase ===`);
}

main().catch(err => {
  log(`FATAL: ${err.message}`);
  process.exit(1);
});
