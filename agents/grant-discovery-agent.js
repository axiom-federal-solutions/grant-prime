// ============================================================
// grant-discovery-agent.js
// Noble Erne, LLC — GRANT PRIME System
//
// Sources:
//   1. Grants.gov search2 — keyword search (federal)
//   2. Grants.gov search2 — agency-specific (DOL, DOE, HUD, SBA, NSF)
//   3. Grants.gov search2 — funding categories (state/workforce)
//   4. Philanthropy News Digest RFPs RSS (foundation — RELIABLE free source)
//   5. Additional foundation RSS feeds (Lumina, Ford, Annie E. Casey)
//
// Runs daily 6:00 AM CT via GitHub Actions.
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

// Retry fetch up to 3 times with exponential backoff
// Uses manual timeout via Promise.race — compatible with all Node 18 builds
async function fetchWithRetry(url, options = {}, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
      return res;
    } catch (err) {
      if (i === retries - 1) throw err;
      const wait = Math.pow(2, i) * 1200;
      log(`  Retry ${i + 1}/${retries} in ${wait}ms — ${err.message}`);
      await sleep(wait);
    }
  }
}

// Insert grants — skip duplicates using grant_id unique constraint
// Stamps first_seen_year only on NEW inserts (ignoreDuplicates: true skips existing rows)
async function upsertGrants(grants) {
  if (!grants.length) return 0;
  const currentYear = new Date().getFullYear();
  const stamped = grants.map(g => ({ ...g, first_seen_year: g.first_seen_year || currentYear }));
  const { data, error } = await supabase
    .from('grants')
    .upsert(stamped, { onConflict: 'grant_id', ignoreDuplicates: true })
    .select('id');
  if (error) { log(`  Supabase upsert error: ${error.message}`); return 0; }
  return data?.length || 0;
}

// ── Source 1: Grants.gov — Keyword Search ────────────────────
// The search2 API is public, no API key required.
// Response shape: { data: { oppHits: [...], hitCount: N } }
async function fetchGrantsGovKeywords() {
  log('Fetching Grants.gov (keyword search)...');
  const results = [];

  const keywords = [
    // Noble Erne — IT / Training / EdTech
    'workforce development',
    'instructional design',
    'technology training',
    'information technology consulting',
    'employee training program',
    'EdTech',
    'software implementation training',
    'capacity building technology',
    'professional development grant',
    'learning management system',
    // STEM — Science, Technology, Engineering, Mathematics
    'STEM education grant',
    'science technology engineering mathematics',
    'STEM workforce',
    'computer science education',
    'coding education grant',
    'research and development grant',
    'STEM innovation',
    'robotics education',
    'cybersecurity education',
    'data science training',
    'STEM after school',
    'broadening participation STEM',
    // Walker Contractors — SDVOSB / Veteran / Construction
    'service-disabled veteran owned small business',
    'SDVOSB',
    'veteran owned business',
    'veteran contractor',
    'veteran set-aside',
    'veteran entrepreneurship',
    'small business veteran',
    'construction grant federal',
    'facilities renovation federal',
    'infrastructure small business',
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
      // search2 wraps results in json.data.oppHits
      const opps = json?.data?.oppHits || json?.oppHits || [];

      for (const opp of opps) {
        results.push({
          source: 'federal',
          grant_id: `grantsgov-${opp.id}`,   // normalized — no search-type prefix to prevent cross-search duplicates
          title: opp.title || 'Untitled',
          funder: opp.agencyName || 'Federal Agency',
          amount_max: opp.awardCeiling ? Number(opp.awardCeiling) : null,
          deadline: opp.closeDate ? safeDate(opp.closeDate) : null,
          description: opp.synopsis || '',
          eligibility: Array.isArray(opp.applicantTypes) ? opp.applicantTypes.join(', ') : '',
          naics: opp.cfdaNumbers?.[0] || opp.naics || null,
          apply_url: `https://www.grants.gov/search-results-detail/${opp.id}`,
          status: 'new',
        });
      }
      log(`  Keyword "${keyword}": ${opps.length} results`);
      await sleep(1000);
    } catch (err) {
      log(`  Keyword error "${keyword}": ${err.message}`);
    }
  }
  return results;
}

// ── Source 2: Grants.gov — Agency-Specific Searches ──────────
// DOL = EdTech/Workforce, DOE = EdTech, HUD = State, SBA/DOC = Federal
// Note: search2 uses "agencies" as a pipe-separated string for multiple,
// or a single agency code string for one agency.
async function fetchGrantsGovAgencies() {
  log('Fetching Grants.gov (agency-specific)...');
  const results = [];

  const agencies = [
    // Ed / Tech — training, workforce, consulting
    { code: 'DOL', name: 'U.S. Department of Labor',              source: 'edtech'   },
    { code: 'ED',  name: 'U.S. Department of Education',          source: 'edtech'   },
    // STEM — science, research, innovation
    { code: 'NSF', name: 'National Science Foundation',            source: 'edtech'   },
    { code: 'HHS', name: 'U.S. Dept of Health & Human Services',  source: 'edtech'   }, // NIH/SBIR
    { code: 'NASA','name': 'National Aeronautics & Space Admin',   source: 'edtech'   },
    { code: 'DOE', name: 'U.S. Department of Energy',             source: 'edtech'   }, // STEM R&D
    { code: 'NIST','name': 'Natl Institute of Standards & Tech',  source: 'federal'  },
    // Shared — federal / general small business
    { code: 'HUD', name: 'U.S. Dept of Housing & Urban Dev',      source: 'state'    },
    { code: 'SBA', name: 'U.S. Small Business Administration',    source: 'federal'  },
    { code: 'DOC', name: 'U.S. Department of Commerce',           source: 'federal'  },
    { code: 'DOD', name: 'U.S. Department of Defense',            source: 'federal'  },
    // Construction / SDVOSB / Veteran
    { code: 'VA',  name: 'U.S. Dept of Veterans Affairs',         source: 'federal'  },
    { code: 'DOT', name: 'U.S. Department of Transportation',     source: 'federal'  },
    { code: 'GSA', name: 'General Services Administration',       source: 'federal'  },
  ];

  for (const agency of agencies) {
    try {
      const res = await fetchWithRetry('https://api.grants.gov/v1/api/search2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agencies: agency.code,        // single agency code string
          oppStatuses: 'forecasted|posted',
          rows: 25,
          startRecordNum: 0,
        }),
      });
      const json = await res.json();
      const opps = json?.data?.oppHits || json?.oppHits || [];

      for (const opp of opps) {
        results.push({
          source: agency.source,
          grant_id: `grantsgov-${opp.id}`,   // normalized — dedupes with keyword + category results
          title: opp.title || 'Untitled',
          funder: agency.name,
          amount_max: opp.awardCeiling ? Number(opp.awardCeiling) : null,
          deadline: opp.closeDate ? safeDate(opp.closeDate) : null,
          description: opp.synopsis || '',
          eligibility: Array.isArray(opp.applicantTypes) ? opp.applicantTypes.join(', ') : '',
          naics: opp.cfdaNumbers?.[0] || opp.naics || null,
          apply_url: `https://www.grants.gov/search-results-detail/${opp.id}`,
          status: 'new',
        });
      }
      log(`  Agency ${agency.code}: ${opps.length} results`);
      await sleep(1200);
    } catch (err) {
      log(`  Agency ${agency.code} error: ${err.message}`);
    }
  }
  return results;
}

// ── Source 3: Grants.gov — Funding Categories (State/Local) ──
// These categories target workforce, education, and business programs
// that often flow through state and local governments.
async function fetchGrantsGovCategories() {
  log('Fetching Grants.gov (funding categories)...');
  const results = [];

  const categories = [
    // Ed / Tech
    { code: 'WD',  label: 'Workforce Development'       },
    { code: 'ED',  label: 'Education'                   },
    { code: 'ELT', label: 'Employment Labor Training'   },
    { code: 'BC',  label: 'Business and Commerce'       },
    { code: 'ISS', label: 'Information and Statistics'  },
    // STEM
    { code: 'ST',  label: 'Science and Technology'      },
    { code: 'ENV', label: 'Environment (STEM overlap)'  },
    { code: 'HL',  label: 'Health (NIH/STEM pipeline)'  },
    // Construction / Infrastructure
    { code: 'CD',  label: 'Community Development'       },
    { code: 'T',   label: 'Transportation'              },
  ];

  for (const cat of categories) {
    try {
      const res = await fetchWithRetry('https://api.grants.gov/v1/api/search2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fundingCategories: cat.code,
          oppStatuses: 'posted',        // only active, not forecasted
          rows: 20,
          startRecordNum: 0,
        }),
      });
      const json = await res.json();
      const opps = json?.data?.oppHits || json?.oppHits || [];

      for (const opp of opps) {
        results.push({
          source: 'state',
          grant_id: `grantsgov-${opp.id}`,   // normalized — dedupes with keyword + agency results
          title: opp.title || 'Untitled',
          funder: opp.agencyName || `${cat.label} Program`,
          amount_max: opp.awardCeiling ? Number(opp.awardCeiling) : null,
          deadline: opp.closeDate ? safeDate(opp.closeDate) : null,
          description: opp.synopsis || '',
          eligibility: Array.isArray(opp.applicantTypes) ? opp.applicantTypes.join(', ') : '',
          naics: opp.cfdaNumbers?.[0] || opp.naics || null,
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
// Uses Philanthropy News Digest (PND) as the primary source — the most
// reliable free grant RFP RSS feed in the US nonprofit sector.
// Supplemented by foundation WordPress feeds that publish grant news.
async function fetchFoundationRSS() {
  log('Fetching foundation RSS feeds...');
  const results = [];

  const feeds = [
    // PND is the gold standard — specifically lists grant RFPs
    {
      name: 'Philanthropy News Digest (RFPs)',
      url: 'https://philanthropynewsdigest.org/rfps.rss',
      source: 'foundation',
    },
    // WordPress-based foundation sites — reliable RSS
    {
      name: 'Lumina Foundation',
      url: 'https://www.luminafoundation.org/feed/',
      source: 'foundation',
    },
    {
      name: 'Ford Foundation',
      url: 'https://www.fordfoundation.org/news/rss/',
      source: 'foundation',
    },
    {
      name: 'Annie E. Casey Foundation',
      url: 'https://www.aecf.org/feed/',
      source: 'foundation',
    },
    {
      name: 'Kresge Foundation',
      url: 'https://kresge.org/feed/',
      source: 'foundation',
    },
    {
      name: 'Robert Wood Johnson Foundation',
      url: 'https://www.rwjf.org/en.rss',
      source: 'foundation',
    },
    // STEM-specific feeds
    {
      name: 'Bill & Melinda Gates Foundation',
      url: 'https://www.gatesfoundation.org/ideas/rss',
      source: 'foundation',
    },
    {
      name: 'Spencer Foundation (Education R&D)',
      url: 'https://www.spencer.org/feed',
      source: 'foundation',
    },
    {
      name: 'Simons Foundation (STEM)',
      url: 'https://www.simonsfoundation.org/feed/',
      source: 'foundation',
    },
  ];

  for (const feed of feeds) {
    try {
      const res = await fetchWithRetry(feed.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; GrantPrimeBot/1.0; Noble Erne LLC)',
          'Accept': 'application/rss+xml, application/xml, text/xml, */*',
        },
      });

      const xml = await res.text();

      // Parse RSS <item> blocks
      const items = [...xml.matchAll(/<item[^>]*>([\s\S]*?)<\/item>/gi)];

      let count = 0;
      for (const item of items.slice(0, 15)) {
        const content = item[1];
        const title = extractRSSTag(content, 'title');
        const link = extractRSSTag(content, 'link');
        const description = extractRSSTag(content, 'description');
        const pubDate = extractRSSTag(content, 'pubDate');
        const guid = extractRSSTag(content, 'guid') || link || title;

        if (!title) continue;

        // Keyword filter — only pull items that mention grants/funding
        const isGrantRelated = /grant|fund|award|rfp|request for proposal|opportunit|fellowship/i
          .test(title + ' ' + description);
        if (!isGrantRelated && feed.name !== 'Philanthropy News Digest (RFPs)') continue;

        // PND RFPs always qualify — others need keyword match
        const safeId = Buffer.from(String(guid).slice(0, 60)).toString('base64').replace(/[^a-zA-Z0-9]/g,'').slice(0, 30);

        // Try to extract a real deadline from description text first.
        // Fall back to pubDate + 90 days only if no date found.
        const cleanDesc = cleanHTML(description);
        const realDeadline = extractDeadlineFromText(cleanDesc) || extractDeadlineFromText(cleanHTML(title));
        const deadline = realDeadline || (pubDate ? estimateDeadline(pubDate) : null);

        results.push({
          source: feed.source,
          grant_id: `rss-${safeId || Math.random().toString(36).slice(2)}`,
          title: cleanHTML(title).slice(0, 200),
          funder: feed.name,
          amount_min: null,
          amount_max: null,
          deadline,
          description: cleanDesc.slice(0, 800),
          eligibility: 'See funder website for full eligibility requirements',
          naics: null,
          apply_url: link || feed.url,
          status: 'new',
        });
        count++;
      }
      log(`  ${feed.name}: ${count} items matched`);
      await sleep(1500);
    } catch (err) {
      log(`  RSS error for ${feed.name}: ${err.message}`);
    }
  }
  return results;
}

// ── RSS / Text Helpers ────────────────────────────────────────

// Extract content from an RSS tag — handles CDATA and plain text
function extractRSSTag(xml, tag) {
  // Try CDATA first
  const cdata = xml.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]>`, 'i'));
  if (cdata) return cdata[1].trim();
  // Try plain text (stop at next tag)
  const plain = xml.match(new RegExp(`<${tag}[^>]*>([^<]*(?:<(?!\\/?${tag})[^<]*)*)`, 'i'));
  if (plain) return plain[1].trim();
  return '';
}

// Strip HTML tags and decode common entities
function cleanHTML(str) {
  if (!str) return '';
  return str
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g,  '&')
    .replace(/&lt;/g,   '<')
    .replace(/&gt;/g,   '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g,  "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Extract real deadline from RSS description text before falling back to estimate.
// Looks for patterns like "deadline: June 30", "due by 2026-08-15", "applications due March 1"
function extractDeadlineFromText(text) {
  if (!text) return null;
  const clean = cleanHTML(text);

  // Pattern: month name + day (+ optional year)
  const monthNames = 'January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec';
  const patterns = [
    // "deadline: June 30, 2026" or "due: March 15"
    new RegExp(`(?:deadline|due|closes?|submit by|applications? due|proposals? due)[:\\s]+(?:is\\s+)?(?:on\\s+)?(${monthNames})\\s+(\\d{1,2})(?:,?\\s+(\\d{4}))?`, 'i'),
    // "June 30, 2026" standalone near deadline context
    new RegExp(`(${monthNames})\\s+(\\d{1,2}),?\\s+(\\d{4})`, 'i'),
    // ISO format: "2026-08-15"
    /\b(202\d-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01]))\b/,
  ];

  for (const pattern of patterns) {
    const match = clean.match(pattern);
    if (match) {
      try {
        // ISO pattern returns directly
        if (/^\d{4}-\d{2}-\d{2}$/.test(match[1])) return match[1];
        // Month name pattern — reconstruct date string
        const year = match[3] || new Date().getFullYear() + 1;
        const d = new Date(`${match[1]} ${match[2]}, ${year}`);
        if (!isNaN(d.getTime()) && d > new Date()) {
          return d.toISOString().split('T')[0];
        }
      } catch { /* fall through */ }
    }
  }
  return null;
}

// Parse an RSS pubDate and add 90 days as a fallback deadline estimate
function estimateDeadline(dateStr) {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    d.setDate(d.getDate() + 90);
    return d.toISOString().split('T')[0];
  } catch { return null; }
}

// Safely parse any date string to YYYY-MM-DD
function safeDate(dateStr) {
  try {
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
  } catch { return null; }
}

// ── Source 5: SBIR.gov — Small Business Innovation Research ──
// Federal STEM + tech R&D funding for small businesses.
// Public API, no key required. Primary STEM channel.
async function fetchSBIR() {
  log('Fetching SBIR.gov opportunities...');
  const results = [];

  const topics = ['training', 'education', 'workforce', 'cybersecurity', 'data', 'software', 'AI', 'STEM'];

  for (const topic of topics) {
    try {
      const res = await fetchWithRetry(
        `https://api.sbir.gov/public/api/solicitations?keyword=${encodeURIComponent(topic)}&rows=15&start=0&open=true`,
        { headers: { 'Accept': 'application/json' } }
      );
      const json = await res.json();
      const items = json?.response?.docs || json?.docs || [];

      for (const item of items) {
        const id = item.solicitation_number || item.solicitation_id || item.program_year + '-' + item.branch;
        results.push({
          source: 'edtech',
          grant_id: `sbir-${String(id).replace(/\W/g, '-').slice(0, 40)}`,
          title: (item.solicitation_title || item.program_title || 'SBIR Solicitation').slice(0, 200),
          funder: `${item.agency || 'Federal'} SBIR/STTR`,
          amount_max: item.award_ceiling ? Number(item.award_ceiling) : 150000, // Phase I typical
          deadline: item.close_date ? safeDate(item.close_date) : null,
          description: (item.program_description || item.abstract || '').slice(0, 800),
          eligibility: 'Small business (≤500 employees), US-based, qualifying for SBIR/STTR programs',
          naics: item.naics_code || null,
          apply_url: item.solicitation_url || item.program_url || 'https://www.sbir.gov/solicitations',
          status: 'new',
        });
      }
      log(`  SBIR topic "${topic}": ${items.length} results`);
      await sleep(800);
    } catch (err) {
      log(`  SBIR error for "${topic}": ${err.message}`);
    }
  }
  return results;
}

// ── Source 6: NIH Reporter — Education / STEM / Health grants ─
// NIH funds education, STEM, workforce health training programs.
// Public API — no key required. Returns active opportunities.
async function fetchNIH() {
  log('Fetching NIH Reporter opportunities...');
  const results = [];

  const queries = [
    { terms: ['workforce training', 'technology education', 'STEM education'] },
    { terms: ['health information technology', 'digital health training'] },
  ];

  for (const q of queries) {
    for (const term of q.terms) {
      try {
        const res = await fetchWithRetry('https://api.reporter.nih.gov/v2/projects/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            criteria: { advanced_text_search: { operator: 'and', search_field: 'all', search_text: term } },
            include_fields: ['ProjectTitle','AbstractText','OrganizationName','AwardAmount','ProjectEndDate','ProjectStartDate','AgencyCode','NihSpendingCats'],
            offset: 0,
            limit: 10,
            sort_field: 'project_start_date',
            sort_order: 'desc',
          }),
        });
        const json = await res.json();
        const projects = json?.results || [];

        for (const p of projects) {
          // NIH Reporter returns funded projects, not open solicitations —
          // use as intelligence on what NIH funds, flag as 'foundation' source
          // so the dashboard shows them as research leads, not live applications.
          results.push({
            source: 'foundation',
            grant_id: `nih-${(p.project_num || Math.random().toString(36).slice(2)).replace(/\W/g,'-').slice(0,40)}`,
            title: (p.project_title || 'NIH Grant').slice(0, 200),
            funder: `NIH / ${p.agency_code || 'HHS'}`,
            amount_max: p.award_amount ? Number(p.award_amount) : null,
            deadline: p.project_end_date ? safeDate(p.project_end_date) : null,
            description: (p.abstract_text || '').slice(0, 800),
            eligibility: 'Research institutions, universities, small businesses with SBIR/STTR eligibility',
            naics: '541715', // R&D in physical/engineering/life sciences
            apply_url: `https://reporter.nih.gov/project-details/${(p.project_num || '').replace(/\W/g,'')}`,
            status: 'new',
          });
        }
        log(`  NIH term "${term}": ${projects.length} results`);
        await sleep(1000);
      } catch (err) {
        log(`  NIH error for "${term}": ${err.message}`);
      }
    }
  }
  return results;
}

// ── Eligibility Pre-Filter ────────────────────────────────────
// Drop grants explicitly restricted to entity types Noble Erne
// and Walker Contractors cannot be: state govts, tribal govts,
// large universities (unless SBIR-eligible). Cuts noise ~40%.
const INELIGIBLE_TYPES = [
  'state governments',
  'county governments',
  'city or township governments',
  'special district governments',
  'native american tribal governments',
  'native american tribal organizations',
  'public and state controlled institutions',
  'independent school districts',
];

function isEligible(grant) {
  if (!grant.eligibility) return true; // no info → keep
  const elig = grant.eligibility.toLowerCase();
  // If eligibility ONLY lists government/tribal types and not "small business" or "private", drop it
  const hasGovOnly = INELIGIBLE_TYPES.some(t => elig.includes(t));
  const hasSmallBiz = /small business|private|nonprofit|for-profit|commercial|llc|corporation|company/.test(elig);
  // Keep if small biz language present, or if no ineligible type detected
  if (hasGovOnly && !hasSmallBiz) return false;
  return true;
}

// ── Write system log to Supabase ──────────────────────────────
async function writeSystemLog(stats) {
  try {
    await supabase.from('system_log').insert({
      agent: 'grant-discovery-agent',
      run_at: new Date().toISOString(),
      status: 'success',
      grants_found: stats.found,
      grants_added: stats.added,
      grants_filtered: stats.filtered,
      sources_run: stats.sources,
      details: JSON.stringify(stats),
    });
    log(`  System log written to Supabase`);
  } catch (err) {
    log(`  System log write failed (non-fatal): ${err.message}`);
  }
}

// ── Main ─────────────────────────────────────────────────────
async function main() {
  log('=== GRANT PRIME Discovery Agent Starting ===');

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
    log('ERROR: SUPABASE_URL and SUPABASE_KEY are required');
    process.exit(1);
  }

  // Run all sources concurrently — failures in one don't stop others
  const [kw, agencies, cats, foundation, sbir, nih] = await Promise.allSettled([
    fetchGrantsGovKeywords(),
    fetchGrantsGovAgencies(),
    fetchGrantsGovCategories(),
    fetchFoundationRSS(),
    fetchSBIR(),
    fetchNIH(),
  ]);

  const allGrants = [
    ...(kw.status         === 'fulfilled' ? kw.value         : []),
    ...(agencies.status   === 'fulfilled' ? agencies.value   : []),
    ...(cats.status       === 'fulfilled' ? cats.value       : []),
    ...(foundation.status === 'fulfilled' ? foundation.value : []),
    ...(sbir.status       === 'fulfilled' ? sbir.value       : []),
    ...(nih.status        === 'fulfilled' ? nih.value        : []),
  ];

  log(`Total grants found across all sources: ${allGrants.length}`);

  // ── Eligibility pre-filter — drop clearly ineligible grants before dedup/upsert
  const eligible = allGrants.filter(isEligible);
  const filtered = allGrants.length - eligible.length;
  log(`Eligibility pre-filter: removed ${filtered} ineligible grants, ${eligible.length} remain`);

  // ── Deduplicate within this batch by grant_id
  const seen = new Set();
  const unique = eligible.filter(g => {
    if (!g.grant_id || seen.has(g.grant_id)) return false;
    seen.add(g.grant_id);
    return true;
  });
  log(`After local dedup: ${unique.length} unique grants`);

  // ── Insert in batches of 50
  let totalNew = 0;
  const batchSize = 50;
  for (let i = 0; i < unique.length; i += batchSize) {
    const batch = unique.slice(i, i + batchSize);
    const inserted = await upsertGrants(batch);
    totalNew += inserted;
    log(`  Batch ${Math.ceil(i / batchSize) + 1}: ${inserted} new grants added`);
    if (i + batchSize < unique.length) await sleep(500);
  }

  // ── Write run summary to system_log for dashboard daily briefing
  await writeSystemLog({
    found: allGrants.length,
    added: totalNew,
    filtered,
    unique: unique.length,
    sources: {
      grants_gov_keywords: kw.status === 'fulfilled' ? kw.value.length : 'failed',
      grants_gov_agencies: agencies.status === 'fulfilled' ? agencies.value.length : 'failed',
      grants_gov_categories: cats.status === 'fulfilled' ? cats.value.length : 'failed',
      foundation_rss: foundation.status === 'fulfilled' ? foundation.value.length : 'failed',
      sbir: sbir.status === 'fulfilled' ? sbir.value.length : 'failed',
      nih: nih.status === 'fulfilled' ? nih.value.length : 'failed',
    },
  });

  log(`=== Discovery Complete: ${totalNew} new grants added to Supabase ===`);
}

main().catch(err => {
  log(`FATAL: ${err.message}`);
  process.exit(1);
});
