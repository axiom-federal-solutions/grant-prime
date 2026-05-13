# GRANT PRIME — System Documentation
**Noble Erne, LLC | Axiom Federal Solutions**
*Last updated: May 2026*

> **Scope:** This document covers GRANT PRIME only — the automated grant discovery and pipeline management system. This is SEPARATE from PRIME IQE (the government contracting acquisition system in `prime-iqe-afs`). Do not conflate the two.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Architecture](#2-architecture)
3. [Database Schema (Supabase)](#3-database-schema-supabase)
4. [Agents](#4-agents)
5. [GitHub Actions Workflows](#5-github-actions-workflows)
6. [Dashboard (index.html)](#6-dashboard-indexhtml)
7. [Environment & Secrets](#7-environment--secrets)
8. [Pending Operations (Run in Supabase)](#8-pending-operations-run-in-supabase)
9. [Gap Analysis History](#9-gap-analysis-history)
10. [Operational Runbook](#10-operational-runbook)
11. [Cost Model](#11-cost-model)
12. [Distinction: GRANT PRIME vs PRIME IQE](#12-distinction-grant-prime-vs-prime-iqe)

---

## 1. System Overview

GRANT PRIME is a fully automated grant intelligence pipeline that:

- **Discovers** grant opportunities daily from federal, state, and foundation sources
- **Scores** each grant 0–100 using Claude Haiku AI against two company profiles
- **Alerts** on high-scoring opportunities and approaching deadlines via email
- **Monitors** system health and surfaces a daily operational briefing
- **Tracks** everything in a Supabase PostgreSQL database
- **Displays** all data in a local HTML command center dashboard (no hosting required)

**Entities served:**
- Noble Erne, LLC — IT consulting, SAP/ERP, Instructional Design, EdTech, STEM
- Walker Contractors LLC — SDVOSB-certified construction/facilities (veteran set-asides)

---

## 2. Architecture

```
GitHub Actions (cron)
│
├── 6:00 AM CT  → grant-discovery-agent.js  →  Supabase (grants table)
│                  grant-scoring-agent.js   →  Supabase (updates score/status)
│
├── 7:30 AM CT  → grant-alert-agent.js      →  SendGrid (daily opportunity email)
│
├── 8:00 AM CT  → grant-deadline-monitor.js →  SendGrid (deadline warning email)
│
└── 8:30 AM CT  → grant-health-monitor.js   →  SendGrid (system health report)

User
└── Opens index.html in browser
       ↓
    Supabase JS Client (reads grants, alerts, system_log)
       ↓
    Live dashboard — no server, no hosting, no login required
```

**Tech stack:**
- Node.js 18 (ES Modules — `"type": "module"` in package.json)
- Supabase (PostgreSQL + REST API)
- Anthropic Claude Haiku (scoring)
- SendGrid (email delivery)
- Vanilla HTML/CSS/JS (dashboard)
- GitHub Actions (orchestration/scheduling)

---

## 3. Database Schema (Supabase)

### `grants` table

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key, auto-generated |
| grant_id | text | UNIQUE — source-prefixed ID (e.g., `gov_12345`, `pnd_abc`) |
| title | text | Grant opportunity title |
| agency | text | Funding agency or foundation |
| deadline | date | Application deadline |
| amount_min | integer | Minimum award amount |
| amount_max | integer | Maximum award amount |
| description | text | Full opportunity description |
| source_url | text | Direct link to opportunity |
| source | text | Discovery source tag |
| category | text | AI-assigned: 'EdTech', 'STEM', 'Construction', 'Federal', 'Foundation', etc. |
| score | integer | AI relevance score 0–100 |
| status | text | 'new' → 'scored' → 'alerted' → 'applied' |
| entity_fit | text | '[Noble Erne]', '[Walker Contractors]', or '[Both]' |
| notes | text | AI reasoning from scoring agent — READ ONLY in dashboard |
| user_notes | text | User-editable notes field in dashboard |
| first_seen_year | integer | Year grant was first discovered (renewal tracking) |
| created_at | timestamptz | Auto-set on insert |

**Key constraint:** `UNIQUE(grant_id)` — prevents duplicate discovery inserts

### `grant_alerts` table

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| grant_id | text | References grants.grant_id |
| alert_type | text | 'high_score', 'deadline_close' |
| sent_at | timestamptz | When alert email was sent |
| score | integer | Score at time of alert |

**Key constraint:** `UNIQUE(grant_id, alert_type)` — prevents duplicate alert emails

### `funder_contacts` table

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| funder_name | text | Foundation or agency name |
| contact_name | text | Program officer name |
| email | text | Contact email |
| phone | text | Contact phone |
| notes | text | Relationship notes |
| created_at | timestamptz | Auto-set on insert |

> ⚠️ **This table may not exist yet.** Run migration 004 in Supabase SQL Editor if "funder_contacts" errors appear in dashboard.

### `system_log` table

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| agent | text | Which agent ran ('discovery', 'scoring', 'alerts', etc.) |
| status | text | 'success' or 'error' |
| details | jsonb | Structured metrics (total_scored, high_score_count, batches, etc.) |
| created_at | timestamptz | Auto-set on insert |

---

## 4. Agents

### 4.1 grant-discovery-agent.js

**Schedule:** 6:00 AM CT daily (`0 11 * * *` UTC)
**Purpose:** Discovers new grant opportunities from multiple sources and upserts to Supabase.

**Sources:**
1. Grants.gov search2 API — keyword search (federal workforce/training terms)
2. Grants.gov search2 — agency-specific (DOL, DOE, HUD, SBA, NSF)
3. Grants.gov search2 — funding categories (state/workforce)
4. Philanthropy News Digest RFPs RSS (foundation — free, reliable)
5. Lumina Foundation RSS
6. Ford Foundation RSS
7. Annie E. Casey Foundation RSS
8. SBIR.gov — Small Business Innovation Research
9. NIH Grants — National Institutes of Health
10. DOL ETA — Employment and Training Administration

**Key behaviors:**
- `fetchWithRetry()` — 3 retries with exponential backoff, 15s timeout per request
- `upsertGrants()` — `onConflict: 'grant_id', ignoreDuplicates: true` prevents duplicates
- `grant_id` is source-prefixed (e.g., `gov_`, `pnd_`, `sbir_`, `nih_`) to prevent collisions across sources
- Stamps `first_seen_year` on new inserts only

### 4.2 grant-scoring-agent.js

**Schedule:** Immediately after discovery in same workflow (`grant-discovery.yml`)
**Purpose:** AI-scores all `status = 'new'` grants using Claude Haiku.

**Process:**
- Pulls all unscored grants from Supabase
- Sends in batches of 20 to Claude Haiku
- Haiku evaluates against two company profiles (Noble Erne LLC + Walker Contractors LLC)
- Returns: `score` (0–100), `entity_fit` ('[Noble Erne]', '[Walker Contractors]', '[Both]'), `category`, `notes` (reasoning)
- Updates grant record: score, entity_fit, category, notes, status → 'scored'
- Logs to `system_log`: `{ total_scored, high_score_count, batches }`

**Company profiles in agent:**
- Noble Erne — NAICS: 541511, 541512, 541519, 541611, 541618, 611430, 611420, 611699, 611710 + STEM overlap codes
- Walker Contractors — NAICS: 236220, 238210, 238220, 238290, 236210, 561210, 541330 (SDVOSB)

**Cost:** ~$0.30/month at 200 grants/day scored via Haiku

### 4.3 grant-alert-agent.js

**Schedule:** 7:30 AM CT daily (`30 12 * * *` UTC)
**Purpose:** Emails high-scoring grants (score ≥ 80) not yet alerted.

**Process:**
- Pulls scored grants with score ≥ 80 where grant_id NOT IN already-alerted grant_ids
- Groups by entity: Noble Erne section, Walker Contractors section, Both section
- Sends formatted HTML email via SendGrid
- Inserts record into `grant_alerts` with `alert_type = 'high_score'`

### 4.4 grant-deadline-monitor.js

**Schedule:** 8:00 AM CT daily (`0 13 * * *` UTC)
**Purpose:** Warns about grants with deadlines approaching within 14 days.

**Process:**
- Queries grants where deadline BETWEEN today AND today+14
- Filters to score ≥ 60 (don't spam low-relevance deadlines)
- Checks `grant_alerts` for existing `deadline_close` alerts (no duplicates)
- Sends deadline warning email via SendGrid
- Inserts `grant_alerts` record with `alert_type = 'deadline_close'`

### 4.5 grant-health-monitor.js

**Schedule:** 8:30 AM CT daily (`30 13 * * *` UTC)
**Purpose:** Checks system health and sends daily status report.

**Checks performed:**
- Did discovery run today? (system_log check)
- Did scoring run today?
- Did alerts run today?
- How many grants discovered vs scored today?
- Any agents with error status?
- Grant pipeline totals by status
- High-score grant count

**Output:** Sends health report email; logs status to system_log.

### 4.6 grant-proposal-agent.js

**Schedule:** On-demand (no cron)
**Purpose:** Generates grant proposal drafts using Claude for a specific grant.

**Key features:**
- Token cap to prevent runaway API costs
- Cost logging after each generation
- Reads grant details from Supabase by grant_id
- Outputs structured proposal draft

---

## 5. GitHub Actions Workflows

All workflows are in `.github/workflows/`. All use `timeout-minutes` to prevent infinite hangs. All have SendGrid failure notification steps.

### grant-discovery.yml
```yaml
schedule: '0 11 * * *'   # 6:00 AM CT
timeout-minutes: 20
steps: install → grant-discovery-agent.js → grant-scoring-agent.js
secrets: SUPABASE_URL, SUPABASE_KEY, ANTHROPIC_API_KEY, SENDGRID_*
```

### grant-alerts.yml
```yaml
schedule: '30 12 * * *'  # 7:30 AM CT
timeout-minutes: 10
steps: install → grant-alert-agent.js
secrets: SUPABASE_URL, SUPABASE_KEY, SENDGRID_*
```

### grant-deadlines.yml
```yaml
schedule: '0 13 * * *'   # 8:00 AM CT
timeout-minutes: 10
steps: install → grant-deadline-monitor.js
secrets: SUPABASE_URL, SUPABASE_KEY, SENDGRID_*
```

### grant-health.yml
```yaml
schedule: '30 13 * * *'  # 8:30 AM CT
timeout-minutes: 10
steps: install → grant-health-monitor.js
secrets: SUPABASE_URL, SUPABASE_KEY, SENDGRID_*
```

**All workflows:** Include a `Notify on failure` step that sends a SendGrid email if any step fails. This means pipeline breakdowns surface immediately to the ALERT_EMAIL inbox.

**GitHub Secrets required (set in repo → Settings → Secrets → Actions):**
- `SUPABASE_URL`
- `SUPABASE_KEY`
- `ANTHROPIC_API_KEY`
- `SENDGRID_API_KEY`
- `SENDGRID_FROM_EMAIL` (currently: treagent1@gmail.com)
- `ALERT_EMAIL` (currently: treagent1@gmail.com)

---

## 6. Dashboard (index.html)

**Location:** `C:\Users\renke\Code\grant-prime\index.html`
**Access:** Open directly in browser — file:// protocol, no server needed
**Auth:** PIN screen removed — opens directly to dashboard

### Panels

**Sidebar (left):**
- Navigation icons: Home, Grants, Action Queue, Pipeline, Funder Contacts
- System status indicators

**Home / Command Center:**
- Daily briefing card (reads latest system_log entry)
- Search bar with dropdown results (real-time Supabase query)
- Breakdown by source / entity stats

**Grants Panel:**
- Entity tabs: Noble Erne | Walker Contractors | Both | All
- Sub-tabs: EdTech | STEM | Construction | Federal | Foundation | State/Local
- SDVOSB badge on Walker Contractors tab
- Quick filters: High Score (≥80), Active (non-expired), New This Week
- Budget range filter
- Card grid with grant details, score badge, deadline, entity tag
- Click → Detail modal with full description, user notes textarea, CSV export

**Action Queue:**
- Grants needing attention (scored ≥ 60, not yet applied)
- Budget range filter
- Sorted by score descending

**Pipeline:**
- Kanban-style view: New → Scored → Alerted → Applied
- Drag status not implemented; status updates via detail modal

**Funder Contacts:**
- Table view of `funder_contacts` table
- Add/edit contacts

### CSV Export (13 columns)
`title, agency, deadline, score, entity_fit, category, amount_min, amount_max, status, source, source_url, user_notes, grant_id`

### Technical notes
- Supabase JS client loaded from CDN (no build step)
- `createClient` wrapped in try-catch with null check
- Global `window.onerror` handler displays JS errors visually (debugging aid)
- `loadData()` loads up to 500 grants: `.select('*').limit(500)`
- Auto-refresh: `setInterval(() => loadData(), 300000)` — every 5 minutes
- `saveNotes()` writes to `user_notes` column (not `notes` — that's AI-only)
- All `openGrantDetail()` calls use `g.grant_id || g.id` for null safety
- CSS custom properties: `--bg2: #0B0F1A`, `--bg3: #0F1424` (required — missing caused transparent backgrounds)

---

## 7. Environment & Secrets

### .env (local — never commit)
```
SUPABASE_URL=https://pbkzjfzeazkfqxnjnari.supabase.co
SUPABASE_KEY=<anon key from Supabase dashboard>
ANTHROPIC_API_KEY=<from console.anthropic.com>
SENDGRID_API_KEY=<from sendgrid.com>
SENDGRID_FROM_EMAIL=treagent1@gmail.com
ALERT_EMAIL=treagent1@gmail.com
GRANTS_GOV_API_KEY=<optional — Grants.gov API>
SAM_GOV_API_KEY=<optional — SAM.gov API>
```

### Dashboard credentials (index.html)
The dashboard reads `SUPABASE_URL` and `SUPABASE_KEY` embedded directly in the HTML (anon/public key only — safe for client-side). These are hardcoded in the `createClient()` call at the top of the script block.

> The anon key is designed to be public. Row-level security (RLS) in Supabase controls what it can access.

---

## 8. Pending Operations (Run in Supabase)

Open Supabase → SQL Editor → run each migration that hasn't been applied yet.

### Migration 003 — entity_fit column
```sql
ALTER TABLE grants ADD COLUMN IF NOT EXISTS entity_fit TEXT;
ALTER TABLE grants ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE grants ADD COLUMN IF NOT EXISTS amount_min INTEGER;
ALTER TABLE grants ADD COLUMN IF NOT EXISTS amount_max INTEGER;
ALTER TABLE grants ADD COLUMN IF NOT EXISTS first_seen_year INTEGER;
```

### Migration 004 — funder_contacts table
```sql
CREATE TABLE IF NOT EXISTS funder_contacts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  funder_name TEXT NOT NULL,
  contact_name TEXT,
  email TEXT,
  phone TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Migration 005 — user_notes column
```sql
ALTER TABLE grants ADD COLUMN IF NOT EXISTS user_notes TEXT;
-- Verify:
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'grants' AND column_name IN ('notes', 'user_notes');
```

### grant_alerts unique constraint
```sql
ALTER TABLE grant_alerts ADD CONSTRAINT grant_alerts_unique
UNIQUE (grant_id, alert_type);
```

---

## 9. Gap Analysis History

Bugs discovered and fixed during development:

| Gap | Issue | Fix |
|---|---|---|
| Gap A | `--bg2`/`--bg3` CSS variables undefined → transparent dark backgrounds | Added to `:root` block in index.html |
| Gap B | `saveNotes()` writing to `notes` (AI column) instead of `user_notes` | Changed to `{user_notes: val}`, textarea reads `g.user_notes` |
| Gap C | `totalHighScore` counter not accumulated across scoring batches — always 0 | Added `let totalHighScore = 0` before loop, accumulated after each batch |
| Gap D | `openGrantDetail(${g.grant_id})` — null grant_id crash | Changed to `g.grant_id || g.id` via replace_all |
| Gap 1 | Health monitor missing 3 checks (alerts, deadlines, proposal agent) | Added to health monitor |
| Gap 2 | Search dropdown didn't close on outside click | Added `document.addEventListener('click')` dismiss handler |
| Gap 4 | Briefing card errored when system_log empty (first run) | Added empty state onboarding message |
| Gap 5 | `first_seen_year` not tracked — renewal detection impossible | Added column + stamp logic in discovery agent |
| Gap 6 | Action Queue had no budget filter | Added budget range filter |
| Gap 8 | Duplicate rows in grant_alerts — same grant alerted multiple times | Added UNIQUE constraint on (grant_id, alert_type) |
| Syntax | `renderAction()` ternary false branch used single quotes containing inner `${}` — JS parser crashed entire script | Changed false branch delimiter from `'...'` to backtick template literal |

---

## 10. Operational Runbook

### Daily automated pipeline
Everything runs automatically via GitHub Actions. No manual steps required once secrets are configured.

### If the dashboard shows blank main panel
1. Press `Ctrl+Shift+R` (Windows/Linux) or `Cmd+Shift+R` (Mac) to hard-refresh
2. Check browser DevTools Console (F12) for JS errors
3. Look for: "Supabase not loaded" → CDN blocked; "loadData is not defined" → syntax error in script block
4. If syntax error — check `renderAction()` function for mismatched quote/backtick delimiters

### If no emails are arriving
1. Check GitHub Actions → confirm workflows are running (green checkmarks)
2. Check SendGrid Activity Feed for delivery/bounce issues
3. Verify GitHub Secrets are all set correctly (no trailing spaces)
4. Run workflow manually: GitHub Actions → workflow → "Run workflow" button

### If grants stop being discovered
1. GitHub Actions → grant-discovery.yml → check last run logs
2. Common causes: Grants.gov API down, RSS feed URL changed, timeout
3. Agent has 3-retry logic with exponential backoff — transient failures recover automatically

### If scoring stops (all grants stuck as 'new')
1. Check ANTHROPIC_API_KEY secret is set and valid
2. Check Anthropic console for rate limits or billing issues
3. Scoring agent processes only `status = 'new'` — previously scored grants are skipped

### Adding a new grant source
1. Open `agents/grant-discovery-agent.js`
2. Add fetch/parse function following the existing pattern
3. Call `upsertGrants(newGrants)` with source-prefixed `grant_id` values
4. Commit and push — runs automatically next morning

### Manually triggering any agent
GitHub Actions → select workflow → "Run workflow" button → "Run workflow" (main branch)

### Git workflow
```bash
cd C:\Users\renke\Code\grant-prime
git add -A
git commit -m "description of changes"
git push origin main
```

---

## 11. Cost Model

| Service | Usage | Cost |
|---|---|---|
| Supabase | Free tier | $0/month |
| GitHub Actions | ~40 min/day of runner time | $0/month (within free tier) |
| Anthropic Claude Haiku | ~200 grants/day × 3K tokens/batch | ~$0.30/month |
| SendGrid | ~4 emails/day = ~120/month | $0/month (free tier = 100/day) |
| **Total** | | **~$0.30/month** |

---

## 12. Distinction: GRANT PRIME vs PRIME IQE

| Dimension | GRANT PRIME | PRIME IQE |
|---|---|---|
| **Purpose** | Find and track grant funding opportunities | Pursue government contracts (acquisitions) |
| **Repo** | `C:\Users\renke\Code\grant-prime` | `C:\Users\renke\Code\prime-iqe-afs` |
| **Database** | Supabase (grants, alerts, contacts, system_log) | Supabase (separate project/tables) |
| **Inputs** | Grants.gov, RSS feeds, SBIR, NIH, foundations | SAM.gov, USASpending, agency forecasts |
| **Output** | Email alerts + local dashboard | Opportunity pipeline + proposal tools |
| **AI** | Claude Haiku (scoring) | Claude (opportunity analysis, proposal drafting) |
| **Automation** | GitHub Actions (4 daily agents) | GitHub Actions (scout, scorer, proposal agents) |
| **Entities** | Noble Erne LLC + Walker Contractors LLC | Noble Erne LLC + Walker Contractors LLC |
| **Funding type** | Grants (non-competitive awards, program grants) | Contracts (competitive bids, RFPs, RFQs) |

These are complementary systems, not duplicates. GRANT PRIME catches non-competitive funding (grants, cooperative agreements, foundation awards). PRIME IQE catches competitive procurement (contracts). Together they cover both revenue tracks.

---

*Document generated from active development session — May 2026*
*Noble Erne, LLC | renkemp2@gmail.com*
