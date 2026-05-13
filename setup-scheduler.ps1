# ============================================================
# setup-scheduler.ps1
# Noble Erne, LLC -- GRANT PRIME Automation Setup
#
# Run ONCE as Administrator to register daily scheduled tasks.
# After this, the full agent pipeline runs automatically every
# morning at 7:00 AM without touching a terminal.
#
# Usage:
#   Right-click PowerShell -> "Run as Administrator"
#   cd C:\Users\renke\Code\grant-prime
#   .\setup-scheduler.ps1
#
# Full pipeline schedule:
#   7:00 AM  -- Discovery (finds new grants)
#   7:30 AM  -- Amount Enricher (fills in award amounts)
#   8:00 AM  -- Scoring (scores with Claude Haiku)
#   8:30 AM  -- Test Runner (validates data integrity)
#   8:45 AM  -- Alerts + Deadlines (email reminders)
#   9:00 AM  -- Health Monitor (system health check)
#   9:15 AM  -- Auto-Fix (retries any failures)
#   9:30 AM  -- Treagent CEO Briefing (daily email digest)
#   On login -- API Server (for proposal generation button)
# ============================================================

$ProjectDir = "C:\Users\renke\Code\grant-prime"
$NodePath   = (Get-Command node).Source

Write-Host "GRANT PRIME Scheduler Setup" -ForegroundColor Cyan
Write-Host "Project: $ProjectDir" -ForegroundColor Gray
Write-Host "Node: $NodePath" -ForegroundColor Gray
Write-Host ""

$settings = New-ScheduledTaskSettingsSet `
  -ExecutionTimeLimit (New-TimeSpan -Hours 2) `
  -RestartCount 2 `
  -RestartInterval (New-TimeSpan -Minutes 5) `
  -StartWhenAvailable `
  -RunOnlyIfNetworkAvailable

function Register-GrantTask {
  param($TaskName, $Script, $Time, $Description)
  $action  = New-ScheduledTaskAction -Execute $NodePath -Argument $Script -WorkingDirectory $ProjectDir
  $trigger = New-ScheduledTaskTrigger -Daily -At $Time
  Register-ScheduledTask `
    -TaskName  "GRANT PRIME - $TaskName" `
    -TaskPath  "\Noble Erne\" `
    -Action    $action `
    -Trigger   $trigger `
    -Settings  $settings `
    -RunLevel  Highest `
    -Force | Out-Null
  Write-Host "  Registered: $Time -> $Description" -ForegroundColor Green
}

# ── Daily pipeline tasks ──────────────────────────────────────
Register-GrantTask "1 Discovery"      "agents/grant-discovery-agent.js"    "7:00AM"  "Discovery Agent (finds new grants)"
Register-GrantTask "2 Enricher"       "agents/grant-amount-enricher.js"    "7:30AM"  "Amount Enricher (fills missing award $)"
Register-GrantTask "3 Scoring"        "agents/grant-scoring-agent.js"      "8:00AM"  "Scoring Agent (Claude Haiku)"
Register-GrantTask "4 Tests"          "agents/grant-test-runner.js"        "8:30AM"  "Test Runner (data integrity)"
Register-GrantTask "5 Alerts"         "agents/grant-alert-agent.js"        "8:45AM"  "Alert Agent (urgent deadline emails)"
Register-GrantTask "6 Deadlines"      "agents/grant-deadline-monitor.js"   "8:45AM"  "Deadline Monitor (7/14/30-day reminders)"
Register-GrantTask "7 Health"         "agents/grant-health-monitor.js"     "9:00AM"  "Health Monitor (system checks)"
Register-GrantTask "8 AutoFix"        "agents/grant-autofix-agent.js"      "9:15AM"  "Auto-Fix Agent (retries failures)"
Register-GrantTask "9 Treagent"       "agents/treagent.js"                 "9:30AM"  "Treagent CEO Briefing (daily digest email)"

# ── API server: starts automatically on Windows login ────────
$serverAction  = New-ScheduledTaskAction -Execute $NodePath -Argument "server.js" -WorkingDirectory $ProjectDir
$loginTrigger  = New-ScheduledTaskTrigger -AtLogOn
Register-ScheduledTask `
  -TaskName  "GRANT PRIME - API Server" `
  -TaskPath  "\Noble Erne\" `
  -Action    $serverAction `
  -Trigger   $loginTrigger `
  -Settings  $settings `
  -RunLevel  Highest `
  -Force | Out-Null
Write-Host "  Registered: On Login -> API Server (http://localhost:3001)" -ForegroundColor Green

# ── Summary ──────────────────────────────────────────────────
Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  GRANT PRIME Automation -- ACTIVE (9 tasks)" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  7:00 AM  -> Discovery"
Write-Host "  7:30 AM  -> Amount Enricher"
Write-Host "  8:00 AM  -> Scoring (Claude Haiku)"
Write-Host "  8:30 AM  -> Test Runner"
Write-Host "  8:45 AM  -> Alerts + Deadlines"
Write-Host "  9:00 AM  -> Health Monitor"
Write-Host "  9:15 AM  -> Auto-Fix"
Write-Host "  9:30 AM  -> Treagent CEO Briefing -> treagent1@gmail.com"
Write-Host "  Login    -> API Server (localhost:3001)"
Write-Host ""
Write-Host "View tasks: Task Scheduler -> Task Scheduler Library -> Noble Erne" -ForegroundColor Yellow
Write-Host "Dashboard: https://axiom-federal-solutions.github.io/grant-prime/" -ForegroundColor Yellow
Write-Host ""
Write-Host "Disable a task (example):" -ForegroundColor Gray
Write-Host "  Disable-ScheduledTask -TaskPath '\Noble Erne\' -TaskName 'GRANT PRIME - 1 Discovery'" -ForegroundColor Gray
Write-Host ""
Write-Host "Run full pipeline manually anytime:" -ForegroundColor Yellow
Write-Host "  npm run daily" -ForegroundColor White
Write-Host ""
