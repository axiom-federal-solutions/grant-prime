// ============================================================
// setup.js
// Noble Erne, LLC — GRANT PRIME First-Run Setup
//
// Run ONCE after cloning or resetting the project:
//   node setup.js
//
// What it does:
//   1. Copies .env.example → .env if .env doesn't exist
//   2. Validates all required env vars are set
//   3. Tests Supabase connectivity
//   4. Prints a startup checklist
// ============================================================

import 'dotenv/config';
import { existsSync, copyFileSync, readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));

function log(msg, color = '') {
  const colors = { green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m', cyan: '\x1b[36m', reset: '\x1b[0m' };
  const c = colors[color] || '';
  console.log(`${c}${msg}${colors.reset}`);
}

async function main() {
  log('\n════════════════════════════════════════════', 'cyan');
  log('  GRANT PRIME — Setup & Health Check', 'cyan');
  log('════════════════════════════════════════════\n', 'cyan');

  // ── Step 1: Ensure .env exists ────────────────────────────
  const envPath     = join(__dir, '.env');
  const examplePath = join(__dir, '.env.example');

  if (!existsSync(envPath)) {
    if (existsSync(examplePath)) {
      copyFileSync(examplePath, envPath);
      log('✅ Created .env from .env.example', 'green');
      log('⚠️  Fill in your real API keys in .env before proceeding.\n', 'yellow');
    } else {
      log('❌ No .env or .env.example found — create .env manually.', 'red');
    }
  } else {
    log('✅ .env file exists', 'green');
  }

  // ── Step 2: Validate required env vars ───────────────────
  const REQUIRED = [
    { key: 'SUPABASE_URL',       label: 'Supabase URL'       },
    { key: 'SUPABASE_KEY',       label: 'Supabase Anon Key'  },
    { key: 'ANTHROPIC_API_KEY',  label: 'Anthropic API Key'  },
    { key: 'SENDGRID_API_KEY',   label: 'SendGrid API Key'   },
    { key: 'SENDGRID_FROM_EMAIL',label: 'SendGrid From Email' },
    { key: 'ALERT_EMAIL',        label: 'Alert Email'        },
  ];

  let missing = 0;
  for (const { key, label } of REQUIRED) {
    const val = process.env[key];
    const isPlaceholder = !val || val.includes('your_') || val === 'changeme';
    if (isPlaceholder) {
      log(`❌ ${label} (${key}) — not set`, 'red');
      missing++;
    } else {
      log(`✅ ${label}`, 'green');
    }
  }

  if (missing > 0) {
    log(`\n⚠️  ${missing} env var(s) missing. Open .env and fill in the values.`, 'yellow');
    log('   Then re-run: node setup.js\n');
    return;
  }

  // ── Step 3: Test Supabase connectivity ───────────────────
  log('\nTesting Supabase connection...', 'cyan');
  try {
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
    const { data, error } = await sb.from('grants').select('id').limit(1);
    if (error) throw new Error(error.message);
    log(`✅ Supabase connected — grants table reachable`, 'green');
  } catch (err) {
    log(`❌ Supabase error: ${err.message}`, 'red');
    log('   Check SUPABASE_URL and SUPABASE_KEY in your .env', 'yellow');
  }

  // ── Step 4: Startup checklist ─────────────────────────────
  log('\n════════════════════════════════════════════', 'cyan');
  log('  Quick Start', 'cyan');
  log('════════════════════════════════════════════', 'cyan');
  log('  1.  npm run discovery      → fetch + score grants (first run)', 'green');
  log('  2.  npm run server         → start proposal API (keep open)', 'green');
  log('  3.  Open index.html        → view dashboard', 'green');
  log('');
  log('  Automate everything (run once, as Admin):');
  log('  .\\setup-scheduler.ps1     → daily Task Scheduler jobs', 'yellow');
  log('\n  Cost estimates:');
  log('  Discovery + scoring: ~$0.01/day');
  log('  Proposal draft:      ~$0.75 each (capped at 10/day)');
  log('');
}

main().catch(err => {
  log(`\nSetup error: ${err.message}`, 'red');
  process.exit(1);
});
