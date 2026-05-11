// ============================================================
// grant-proposal-agent.js
// Noble Erne, LLC — GRANT PRIME System
//
// What this does:
//   Manually triggered ONLY — never runs automatically.
//   Takes a grant ID as a command-line argument.
//   Pulls full grant details from Supabase.
//   Uses Claude Sonnet to draft a full application narrative.
//   Saves the draft back to Supabase (proposal_draft field).
//   Emails the draft to treagent1@gmail.com via SendGrid.
//
// Usage:
//   node agents/grant-proposal-agent.js <grant_id>
//
// Example:
//   node agents/grant-proposal-agent.js abc123-uuid-here
// ============================================================

import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import sgMail from '@sendgrid/mail';

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
const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || 'treagent1@gmail.com';

// ── Company Profiles for Proposals ───────────────────────────
// Sonnet selects the correct entity based on the grant's entity_fit field.
// Update profiles when capabilities, certifications, or contacts change.

const NOBLE_ERNE_PROFILE = `
COMPANY: Noble Erne, LLC
OWNER: Mr. Kemp (Principal Consultant)
ENTITY TYPE: LLC, Small Business
CONTACT EMAIL: treagent1@gmail.com
NAICS: 541511, 541512, 541519, 541611, 541618, 611430

CORE CAPABILITIES:
1. SAP Implementation & Upgrades
   - Full lifecycle SAP project delivery
   - S/4HANA migrations and system upgrades
   - End-user training program development for SAP systems
   - Cross-industry SAP deployments (Oil & Gas, Finance, Manufacturing, Retail)

2. Instructional Design
   - Curriculum development for technical and enterprise software training
   - eLearning module creation (SCORM, xAPI)
   - Blended learning program design
   - Performance support tools and job aids

3. Software Administration & Training
   - LMS administration and configuration
   - Training program management and delivery
   - Post-go-live support and optimization

INDUSTRIES: Technology, Oil & Gas, Retail, Government/Military, Finance & Banking, Manufacturing, EdTech, Workforce Development

PAST PERFORMANCE:
- SAP training programs for Fortune 500 clients in oil, gas, and manufacturing
- Instructional content for national retail rollouts
- Federal and state government SAP implementations
- Workforce training curricula for industrial organizations

DIFFERENTIATORS:
- Deep SAP domain expertise + instructional design mastery
- Proven track record in private sector and government
- Agile delivery model suited for small business set-asides
- Cost-effective delivery at enterprise-grade quality
`;

const WALKER_PROFILE = `
COMPANY: Walker Contractors LLC (DBA: Axiom Federal Solutions)
OWNER: Joseph Walker IV
ENTITY TYPE: SDVOSB (Service-Disabled Veteran-Owned Small Business), VOSB, Small Business
CONTACT EMAIL: treagent1@gmail.com
CERTIFICATIONS: SDVOSB certified, VOSB eligible, SAM.gov registered
NAICS: 236220 (primary), 238210, 237990, 236116, 561730, 424710, 424130, 424490, 424120, 424410
GEOGRAPHY: HQ Dallas, TX — serves TX, OK, LA, AR, NM, CO, KS, MO and nationwide federal contracts

CORE CAPABILITIES:
1. Construction & Renovation
   - Commercial and institutional building construction (NAICS 236220)
   - Electrical contracting and wiring installation (NAICS 238210)
   - Heavy and civil engineering construction (NAICS 237990)
   - Multifamily housing construction and renovation (NAICS 236116)

2. Facilities & Grounds
   - Grounds maintenance and landscaping (NAICS 561730)
   - Facility maintenance and operations support

3. Supply Chain & Logistics
   - Petroleum/fuel supply (NAICS 424710)
   - Janitorial and paper supply (NAICS 424130)
   - PPE and safety supply (NAICS 424490)
   - Office supply distribution (NAICS 424120)

VETERAN STATUS:
- Service-Disabled Veteran-Owned Small Business — eligible for all SDVOSB/VOSB set-aside programs
- VA SDVOSB verified — priority access to VA construction and renovation contracts
- Qualifies for SBA sole-source awards up to $4M (construction) under veteran set-aside authority

PAST PERFORMANCE:
- Federal renovation and construction projects across the South-Central region
- Supply chain delivery to government facilities
- SDVOSB set-aside contract performance

DIFFERENTIATORS:
- SDVOSB/VOSB status gives competitive edge on all veteran set-aside programs
- Strong regional presence in TX/LA/OK corridor with national federal reach
- Versatile — construction, supply, and facilities under one entity
`;

// Select profile based on entity_fit assigned during scoring
function getCompanyProfile(entityFit) {
  if (entityFit && entityFit.toLowerCase().includes('walker')) return WALKER_PROFILE;
  return NOBLE_ERNE_PROFILE; // default to Noble Erne
}

// ── Helpers ──────────────────────────────────────────────────
function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

// ── Draft Proposal via Claude Sonnet ─────────────────────────
// Max tokens for Sonnet proposal — cost guardrail (~$0.75 max per draft)
const PROPOSAL_MAX_TOKENS = 4000;

async function draftProposal(grant) {
  const profile = getCompanyProfile(grant.entity_fit);
  const companyName = (grant.entity_fit || '').toLowerCase().includes('walker')
    ? 'Walker Contractors LLC'
    : 'Noble Erne, LLC';

  log(`Drafting proposal for ${companyName} with Claude Sonnet (max ${PROPOSAL_MAX_TOKENS} tokens)...`);

  const prompt = `You are a professional grant writer drafting a winning application narrative for ${companyName}.

COMPANY PROFILE:
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
Write a complete grant application narrative for Noble Erne, LLC applying for this opportunity.
Structure the narrative with these sections:

1. EXECUTIVE SUMMARY (2-3 paragraphs)
   - Who Noble Erne is and what we do
   - Why this grant is a perfect fit
   - What we will accomplish with the funding

2. ORGANIZATIONAL CAPACITY (2-3 paragraphs)
   - Relevant experience and past performance
   - Key capabilities that align with grant requirements
   - Why Noble Erne is uniquely positioned to deliver

3. PROJECT DESCRIPTION / SCOPE OF WORK (3-4 paragraphs)
   - Specific activities and deliverables Noble Erne will execute
   - How the work aligns with the funder's stated goals
   - Timeline and milestones (general)

4. BUDGET JUSTIFICATION (1-2 paragraphs)
   - How funds will be used (professional services, tools, training delivery)
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
    max_tokens: PROPOSAL_MAX_TOKENS,
    messages: [{ role: 'user', content: prompt }],
  });

  // Log token usage so costs stay visible
  const usage = message.usage || {};
  const inputTokens = usage.input_tokens || 0;
  const outputTokens = usage.output_tokens || 0;
  const estimatedCost = ((inputTokens / 1000) * 0.003) + ((outputTokens / 1000) * 0.015);
  log(`Token usage — input: ${inputTokens}, output: ${outputTokens}, est. cost: $${estimatedCost.toFixed(4)}`);

  return message.content[0].text;
}

// ── Save draft to Supabase ────────────────────────────────────
async function saveDraft(grantId, draft) {
  const { error } = await supabase
    .from('grants')
    .update({
      proposal_draft: draft,
      status: 'applied', // mark as applied once we have a draft
    })
    .eq('id', grantId);

  if (error) throw new Error(`Supabase save error: ${error.message}`);
  log('Draft saved to Supabase');

  // Log the alert
  await supabase.from('grant_alerts').insert({
    grant_id: grantId,
    alert_type: 'proposal_ready',
  });
}

// ── Email the draft ───────────────────────────────────────────
async function emailDraft(grant, draft) {
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#06080F;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:700px;margin:0 auto;padding:24px 16px;">
    <div style="background:#0B0F1A;border:1px solid rgba(52,211,153,.25);border-radius:12px;padding:20px 24px;margin-bottom:20px;">
      <div style="font-size:10px;color:#34D399;font-weight:700;letter-spacing:.12em;text-transform:uppercase;margin-bottom:6px;">GRANT PRIME · Proposal Draft · ${grant.entity_fit || 'Noble Erne'}</div>
      <div style="font-size:20px;font-weight:800;color:#EDF0F7;">${grant.title}</div>
      <div style="font-size:13px;color:#8B95AB;margin-top:4px;">${grant.funder || 'Unknown Funder'} · Score: ${grant.score}</div>
      ${grant.deadline ? `<div style="font-size:12px;color:#F59E0B;margin-top:4px;font-weight:600;">Deadline: ${grant.deadline}</div>` : ''}
    </div>

    <div style="background:#0F1424;border:1px solid rgba(255,255,255,.06);border-radius:8px;padding:20px 24px;">
      <div style="font-size:11px;color:#4D5669;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin-bottom:14px;">Application Narrative Draft</div>
      <div style="font-size:13px;color:#EDF0F7;line-height:1.8;white-space:pre-wrap;">${draft}</div>
    </div>

    ${grant.apply_url ? `
    <div style="text-align:center;margin-top:16px;">
      <a href="${grant.apply_url}" style="background:#34D399;color:#06080F;font-weight:700;font-size:12px;padding:10px 24px;border-radius:6px;text-decoration:none;display:inline-block;">OPEN APPLICATION PORTAL →</a>
    </div>` : ''}

    <div style="margin-top:14px;padding:12px;background:#0B0F1A;border-radius:8px;font-size:10px;color:#4D5669;text-align:center;">
      GRANT PRIME · Noble Erne, LLC · Proposal draft generated by Claude Sonnet · Review before submitting
    </div>
  </div>
</body>
</html>`;

  const msg = {
    to: ALERT_EMAIL,
    from: FROM_EMAIL,
    subject: `GRANT PRIME: Proposal Draft — ${grant.title}`,
    html,
  };

  await sgMail.send(msg);
  log(`Draft emailed to ${ALERT_EMAIL}`);
}

// ── Main ─────────────────────────────────────────────────────
async function main() {
  log('=== GRANT PRIME Proposal Agent Starting ===');

  // Require a grant ID as the first command-line argument
  const grantId = process.argv[2];
  if (!grantId) {
    log('ERROR: No grant ID provided');
    log('Usage: node agents/grant-proposal-agent.js <grant_id>');
    process.exit(1);
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY ||
      !process.env.ANTHROPIC_API_KEY || !process.env.SENDGRID_API_KEY) {
    log('ERROR: Missing required environment variables');
    process.exit(1);
  }

  // Fetch the full grant record
  log(`Fetching grant: ${grantId}`);
  const { data: grant, error } = await supabase
    .from('grants')
    .select('*')
    .eq('id', grantId)
    .single();

  if (error || !grant) {
    log(`ERROR: Grant not found — ${error?.message || 'no data returned'}`);
    process.exit(1);
  }

  log(`Found grant: "${grant.title}"`);

  // Draft the proposal
  const draft = await draftProposal(grant);
  log(`Draft generated: ${draft.length} characters`);

  // Save to Supabase and email
  await saveDraft(grant.id, draft);
  await emailDraft(grant, draft);

  log(`=== Proposal Agent Complete: Draft saved and emailed for "${grant.title}" ===`);
}

main().catch(err => {
  log(`FATAL: ${err.message}`);
  process.exit(1);
});
