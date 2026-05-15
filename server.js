// ============================================================
// server.js
// GRANT PRIME — Proposal API Server
//
// Bridges the dashboard UI to the Node.js proposal agent.
// Run ONCE before using the "Generate Proposal" button:
//
//   node server.js
//
// Listens on http://localhost:3001
// Endpoints:
//   GET  /health              — liveness check
//   POST /generate-proposal   — body: { grantId: "uuid" }
// ============================================================

import 'dotenv/config';
import http from 'http';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import sgMail from '@sendgrid/mail';

const PORT = process.env.PORT || 3001;
const ALLOWED_ORIGINS = [
  'https://axiom-federal-solutions.github.io',
  'http://localhost',
  'http://127.0.0.1',
  'null', // file:// origin appears as 'null'
];

// ── Connections ──────────────────────────────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const ALERT_EMAIL = process.env.ALERT_EMAIL || 'treagent1@gmail.com';
const FROM_EMAIL  = process.env.SENDGRID_FROM_EMAIL || 'treagent1@gmail.com';

// ── Partner Profiles (entity-neutral labels) ─────────────────

const IT_EDTECH_PROFILE = `
ENTITY TYPE: IT & EdTech Partner — LLC, Small Business
CONTACT EMAIL: treagent1@gmail.com
NAICS: 541511, 541512, 541519, 541611, 541618, 611430, 611420

CORE CAPABILITIES:
1. SAP Implementation & Upgrades
   - Full lifecycle SAP project delivery
   - S/4HANA migrations and system upgrades
   - End-user training program development for SAP systems
   - Cross-industry SAP deployments (Oil & Gas, Finance, Manufacturing, Retail, Government)

2. Instructional Design & eLearning
   - Curriculum development for technical and enterprise software training
   - eLearning module creation (SCORM, xAPI)
   - Blended learning program design and delivery
   - Performance support tools, job aids, and knowledge management

3. Software Administration & IT Consulting
   - LMS administration and configuration
   - Training program management and delivery
   - Post-go-live support and optimization
   - IT workforce development and upskilling programs

INDUSTRIES SERVED:
Technology, Oil & Gas, Retail, Government & Military, Finance & Banking,
Manufacturing & Industrial, EdTech, Workforce Development

PAST PERFORMANCE:
- SAP training programs for Fortune 500 clients in oil, gas, and manufacturing
- Instructional content for national retail rollouts
- Federal and state government SAP implementations
- Workforce training curricula for industrial organizations

DIFFERENTIATORS:
- Deep SAP domain expertise combined with instructional design mastery
- Proven track record across private sector and federal government
- Agile delivery model suited for small business set-asides
- Cost-effective delivery at enterprise-grade quality
`;

const CONSTRUCTION_PROFILE = `
ENTITY TYPE: Construction Partner — SDVOSB (Service-Disabled Veteran-Owned Small Business), VOSB
CONTACT EMAIL: treagent1@gmail.com
CERTIFICATIONS: SDVOSB certified, VOSB eligible, SAM.gov registered
NAICS: 236220 (primary), 238210, 237990, 236116, 561730, 424710, 424130, 424490, 424120, 424410
GEOGRAPHY: Dallas, TX based — serves TX, OK, LA, AR, NM, CO, KS, MO and nationwide federal contracts

CORE CAPABILITIES:
1. Construction & Renovation
   - Commercial and institutional building construction (NAICS 236220)
   - Electrical contracting and wiring installation (NAICS 238210)
   - Heavy and civil engineering construction (NAICS 237990)
   - Multifamily housing construction and renovation (NAICS 236116)

2. Facilities & Grounds Management
   - Grounds maintenance and landscaping services (NAICS 561730)
   - Facility maintenance and operations support
   - Janitorial and property maintenance services

3. Supply Chain & Logistics
   - Petroleum and fuel supply (NAICS 424710)
   - Janitorial and paper supply distribution (NAICS 424130)
   - PPE and safety equipment supply (NAICS 424490)
   - Office supply and furniture distribution (NAICS 424120)

VETERAN STATUS:
- Service-Disabled Veteran-Owned Small Business — eligible for all SDVOSB/VOSB set-aside programs
- VA SDVOSB verified — priority access to VA construction and renovation contracts
- Qualifies for SBA sole-source awards up to $4M (construction) under veteran set-aside authority

PAST PERFORMANCE:
- Federal renovation and construction projects across the South-Central region
- Supply chain delivery to government facilities in TX/LA/OK corridor
- SDVOSB set-aside contract performance — on-time, on-budget delivery

DIFFERENTIATORS:
- SDVOSB/VOSB status provides competitive edge on all veteran set-aside programs
- Strong regional presence in TX/LA/OK corridor with national federal reach
- Versatile capability set — construction, supply chain, and facilities under one SDVOSB entity
`;

const STEM_EDUCATION_PROFILE = `
ENTITY TYPE: STEM Education Partner — Non-profit / Community Organization
CONTACT EMAIL: treagent1@gmail.com
NAICS: 611110, 611519, 611710, 611699, 611430, 541715, 611310

MISSION:
Transforming STEM education for underrepresented youth through hands-on, culturally relevant
programming. STEM = Science, Technology, Engineering, Mathematics with an Urban Perspective.
Primary focus: K-12 students in underserved urban communities, Houston, TX.

CORE PROGRAMS:
1. Saturday STEM Boot Camp
   - Weekly hands-on STEM sessions for K-12 students
   - Project-based learning in science, technology, engineering, and math
   - Mentorship and college/career readiness components

2. Rocketry & Aerospace Education
   - Model rocketry design and launch programs
   - NASA STEM curriculum alignment
   - Competitive rocketry teams preparing for regional and national competitions

3. Winter Internship Program
   - Paid internship opportunities for high school students in STEM fields
   - Industry partnerships for real-world work experience
   - Portfolio development and professional skills training

4. Parent & Educator Academy
   - Professional development workshops for teachers on STEM pedagogy
   - Family engagement programs to extend learning at home
   - Training parents as advocates for STEM education

5. STAAR Prep & Academic Support
   - Targeted math and science intervention for standardized testing
   - After-school tutoring and enrichment programs
   - Data-driven instruction aligned to state standards

POPULATION SERVED:
- Underrepresented minorities (Black, Hispanic, low-income youth)
- K-12 students in Title I schools
- Houston, TX metro area with potential for regional expansion

PAST PERFORMANCE:
- Multi-year Saturday STEM Boot Camp with documented participant outcomes
- Successful rocketry competitions at regional and state levels
- Educator professional development workshops serving Houston ISD teachers
- Community-based STEM enrichment programs with measurable student achievement gains

DIFFERENTIATORS:
- Deep community trust with underserved Houston populations
- Proven, replicable model for urban STEM engagement
- Strong alignment with NSF, NASA, DOE, and Title I funding priorities
- Culturally responsive curriculum that reflects students' lived experiences
- Track record of converting STEM exposure to college enrollment and STEM career interest
`;

// ── Profile router ────────────────────────────────────────────
function getPartnerProfile(entityFit) {
  const ef = (entityFit || '').toLowerCase();
  if (ef.includes('construction') || ef.includes('sdvosb') || ef.includes('walker') || ef.includes('veteran')) {
    return { profile: CONSTRUCTION_PROFILE, label: 'Construction Partner (SDVOSB)' };
  }
  if (ef.includes('stem education') || ef.includes('stem partner') || ef.includes('kiki') || ef.includes('stem edu')) {
    return { profile: STEM_EDUCATION_PROFILE, label: 'STEM Education Partner' };
  }
  if (ef.includes('edtech + stem') || ef.includes('it + stem') || ef.includes('all partners')) {
    return { profile: IT_EDTECH_PROFILE + '\n' + STEM_EDUCATION_PROFILE, label: 'IT/EdTech + STEM Education Partners' };
  }
  // Default: IT & EdTech Partner
  return { profile: IT_EDTECH_PROFILE, label: 'IT & EdTech Partner' };
}

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

// ── Rate limiter & cost guardrail ─────────────────────────────
// Prevents duplicate in-flight calls and runaway API spend.
const inFlight  = new Set();          // grant IDs currently generating
const DAILY_CAP = 10;                 // max proposals per calendar day (~$7.50 max)
let   dailyCount = 0;
let   dailyReset = new Date().toDateString();

function checkRateLimit(grantId) {
  const today = new Date().toDateString();
  if (today !== dailyReset) { dailyCount = 0; dailyReset = today; }
  if (inFlight.has(grantId)) return 'already_generating';
  if (dailyCount >= DAILY_CAP)  return 'daily_cap_reached';
  return null;
}

// ── CORS helper ───────────────────────────────────────────────
function setCORSHeaders(req, res) {
  const origin = req.headers.origin || 'null';
  const allowed = ALLOWED_ORIGINS.some(o => origin.startsWith(o));
  res.setHeader('Access-Control-Allow-Origin', allowed ? origin : ALLOWED_ORIGINS[0]);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');
}

// ── Core proposal generation ──────────────────────────────────
async function generateProposal(grantId) {
  log(`Fetching grant: ${grantId}`);
  const { data: grant, error } = await supabase
    .from('grants')
    .select('*')
    .eq('id', grantId)
    .single();

  if (error || !grant) {
    throw new Error(`Grant not found: ${error?.message || 'no data returned'}`);
  }
  log(`Found grant: "${grant.title}"`);

  const { profile, label } = getPartnerProfile(grant.entity_fit);
  log(`Drafting proposal for ${label}...`);

  const prompt = `You are a professional grant writer drafting a winning application narrative for a grant applicant.

APPLICANT PROFILE:
${profile}

GRANT OPPORTUNITY:
Title: ${grant.title}
Funder: ${grant.funder}
Amount: ${grant.amount_max ? `Up to $${Number(grant.amount_max).toLocaleString()}` : 'TBD'}
Deadline: ${grant.deadline || 'TBD'}
Description: ${grant.description || 'Not provided'}
Eligibility: ${grant.eligibility || 'Not specified'}
Apply URL: ${grant.apply_url || 'See funder website'}

INSTRUCTIONS:
Write a complete grant application narrative. Structure with these sections:

1. EXECUTIVE SUMMARY (2-3 paragraphs)
   - Who this organization is and what we do
   - Why this grant is a perfect fit
   - What we will accomplish with the funding

2. ORGANIZATIONAL CAPACITY (2-3 paragraphs)
   - Relevant experience and past performance
   - Key capabilities that align with grant requirements
   - Why this organization is uniquely positioned to deliver

3. PROJECT DESCRIPTION / SCOPE OF WORK (3-4 paragraphs)
   - Specific activities and deliverables we will execute
   - How the work aligns with the funder's stated goals
   - Timeline and milestones (general)

4. BUDGET JUSTIFICATION (1-2 paragraphs)
   - How funds will be used
   - Cost-effectiveness and value proposition

5. EXPECTED OUTCOMES & IMPACT (1-2 paragraphs)
   - Measurable results the funder can expect
   - Long-term sustainability or continuation of work

Write in a professional, confident, and specific tone.
Reference the funder's goals directly where possible.
Do not use placeholder text — write complete, submission-ready content.
Total length: 800-1,200 words.`;

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4000,
    messages: [{ role: 'user', content: prompt }],
  });

  const usage = message.usage || {};
  log(`Tokens — input: ${usage.input_tokens}, output: ${usage.output_tokens}`);

  const draft = message.content[0].text;
  log(`Draft generated: ${draft.length} chars`);

  // Save draft to Supabase (proposal_draft column — must exist in schema)
  const { error: saveErr } = await supabase
    .from('grants')
    .update({ proposal_draft: draft, status: 'applied' })
    .eq('id', grantId);

  if (saveErr) throw new Error(`Supabase save error: ${saveErr.message}`);
  log('Draft saved to Supabase');

  // Log to grant_alerts if table exists (silently skip if not)
  await supabase.from('grant_alerts').insert({
    grant_id: grantId,
    alert_type: 'proposal_ready',
  }).then(() => {}).catch(() => {});

  // Email via SendGrid
  const entityLabel = grant.entity_fit || label;
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#06080F;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:700px;margin:0 auto;padding:24px 16px;">
    <div style="background:#0B0F1A;border:1px solid rgba(52,211,153,.25);border-radius:12px;padding:20px 24px;margin-bottom:20px;">
      <div style="font-size:10px;color:#34D399;font-weight:700;letter-spacing:.12em;text-transform:uppercase;margin-bottom:6px;">GRANT PRIME · Proposal Draft · ${entityLabel}</div>
      <div style="font-size:20px;font-weight:800;color:#EDF0F7;">${grant.title}</div>
      <div style="font-size:13px;color:#8B95AB;margin-top:4px;">${grant.funder || 'Unknown Funder'} · Score: ${grant.score}</div>
      ${grant.deadline ? `<div style="font-size:12px;color:#F59E0B;margin-top:4px;font-weight:600;">Deadline: ${grant.deadline}</div>` : ''}
    </div>
    <div style="background:#0F1424;border:1px solid rgba(255,255,255,.06);border-radius:8px;padding:20px 24px;">
      <div style="font-size:11px;color:#4D5669;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin-bottom:14px;">Application Narrative Draft</div>
      <div style="font-size:13px;color:#EDF0F7;line-height:1.8;white-space:pre-wrap;">${draft}</div>
    </div>
    ${grant.apply_url ? `<div style="text-align:center;margin-top:16px;"><a href="${grant.apply_url}" style="background:#34D399;color:#06080F;font-weight:700;font-size:12px;padding:10px 24px;border-radius:6px;text-decoration:none;display:inline-block;">OPEN APPLICATION PORTAL →</a></div>` : ''}
    <div style="margin-top:14px;padding:12px;background:#0B0F1A;border-radius:8px;font-size:10px;color:#4D5669;text-align:center;">
      GRANT PRIME · ${label} · Proposal draft generated by Claude Sonnet · Review before submitting
    </div>
  </div>
</body>
</html>`;

  await sgMail.send({
    to: ALERT_EMAIL,
    from: FROM_EMAIL,
    subject: `GRANT PRIME: Proposal Draft — ${grant.title}`,
    html,
  });
  log(`Draft emailed to ${ALERT_EMAIL}`);

  return { title: grant.title, chars: draft.length, label };
}

// ── HTTP Server ───────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  setCORSHeaders(req, res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  // GET /health
  if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      server: 'GRANT PRIME API',
      port: PORT,
      proposalsToday: dailyCount,
      dailyCap: DAILY_CAP,
      inFlight: inFlight.size,
    }));
    return;
  }

  // POST /generate-proposal
  if (req.method === 'POST' && url.pathname === '/generate-proposal') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { grantId } = JSON.parse(body);
        if (!grantId) throw new Error('grantId is required');

        const limit = checkRateLimit(grantId);
        if (limit === 'already_generating') {
          res.writeHead(429, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Already generating for this grant — please wait.' }));
          return;
        }
        if (limit === 'daily_cap_reached') {
          res.writeHead(429, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: `Daily proposal cap of ${DAILY_CAP} reached. Resets at midnight.` }));
          return;
        }

        inFlight.add(grantId);
        dailyCount++;
        log(`POST /generate-proposal — grantId: ${grantId} (${dailyCount}/${DAILY_CAP} today)`);
        const result = await generateProposal(grantId);

        inFlight.delete(grantId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: `Draft saved and emailed for "${result.title}" (${result.chars} chars) — ${result.label}`,
        }));
      } catch (err) {
        try { const { grantId } = JSON.parse(body); inFlight.delete(grantId); } catch {}
        log(`ERROR: ${err.message}`);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    log(`Port ${PORT} is already in use — server is likely already running.`);
    log(`To check: netstat -ano | findstr :${PORT}`);
    log(`To kill:  taskkill /PID <pid> /F`);
    process.exit(0);
  } else {
    log(`Server error: ${err.message}`);
    process.exit(1);
  }
});

server.listen(PORT, () => {
  log(`GRANT PRIME API server running on http://localhost:${PORT}`);
  log(`  GET  /health`);
  log(`  POST /generate-proposal   body: { grantId: "uuid" }`);
  log(`  Partners: IT & EdTech · STEM Education · Construction (SDVOSB)`);
});
