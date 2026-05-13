# ============================================================
# setup-scheduler.ps1
# Noble Erne, LLC -- GRANT PRIME Automation Setup
#
# Run ONCE as Administrator to register daily scheduled tasks.
# After this, grant discovery + scoring runs automatically at
# 7:00 AM every morning without you touching a terminal.
#
# Usage:
#   Right-click PowerShell -> "Run as Administrator"
#   cd C:\Users\renke\Code\grant-prime
#   .\setup-scheduler.ps1
# ============================================================

$ProjectDir = "C:\Users\renke\Code\grant-prime"
$NodePath   = (Get-Command node).Source

$settings = New-ScheduledTaskSettingsSet `
  -ExecutionTimeLimit (New-TimeSpan -Hours 2) `
  -RestartCount 1 `
  -RestartInterval (New-TimeSpan -Minutes 10) `
  -StartWhenAvailable `
  -RunOnlyIfNetworkAvailable

# ── Task 1: Daily Discovery + Scoring (auto-chains) ──────────
$discoveryAction = New-ScheduledTaskAction `
  -Execute $NodePath `
  -Argument "agents/grant-discovery-agent.js" `
  -WorkingDirectory $ProjectDir

$dailyTrigger = New-ScheduledTaskTrigger -Daily -At "7:00AM"

Register-ScheduledTask `
  -TaskName   "GRANT PRIME - Daily Discovery" `
  -TaskPath   "\Noble Erne\" `
  -Action     $discoveryAction `
  -Trigger    $dailyTrigger `
  -Settings   $settings `
  -RunLevel   Highest `
  -Force

Write-Host "Task registered: GRANT PRIME - Daily Discovery (7:00 AM daily)" -ForegroundColor Green

# ── Task 2: Weekly deadline alert email ──────────────────────
$alertAction = New-ScheduledTaskAction `
  -Execute $NodePath `
  -Argument "agents/grant-alert-agent.js" `
  -WorkingDirectory $ProjectDir

$mondayTrigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At "7:30AM"

Register-ScheduledTask `
  -TaskName   "GRANT PRIME - Weekly Alert Email" `
  -TaskPath   "\Noble Erne\" `
  -Action     $alertAction `
  -Trigger    $mondayTrigger `
  -Settings   $settings `
  -RunLevel   Highest `
  -Force

Write-Host "Task registered: GRANT PRIME - Weekly Alert Email (Monday 7:30 AM)" -ForegroundColor Green

# ── Task 3: API server auto-start on login ───────────────────
$serverAction = New-ScheduledTaskAction `
  -Execute $NodePath `
  -Argument "server.js" `
  -WorkingDirectory $ProjectDir

$loginTrigger = New-ScheduledTaskTrigger -AtLogOn

Register-ScheduledTask `
  -TaskName   "GRANT PRIME - API Server" `
  -TaskPath   "\Noble Erne\" `
  -Action     $serverAction `
  -Trigger    $loginTrigger `
  -Settings   $settings `
  -RunLevel   Highest `
  -Force

Write-Host "Task registered: GRANT PRIME - API Server (starts on login)" -ForegroundColor Green

# ── Summary ──────────────────────────────────────────────────
Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  GRANT PRIME Automation -- ACTIVE" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  7:00 AM daily   -> Discovery + Scoring"
Write-Host "  7:30 AM Monday  -> Alert email digest"
Write-Host "  On login        -> API server (proposal button)"
Write-Host ""
Write-Host "View tasks: Task Scheduler -> Task Scheduler Library -> Noble Erne"
Write-Host "Disable a task:"
Write-Host "  Unregister-ScheduledTask -TaskPath '\Noble Erne\' -TaskName 'GRANT PRIME - Daily Discovery'"
Write-Host ""
Write-Host "Run manually anytime:" -ForegroundColor Yellow
Write-Host "  npm run discovery   -> fetch + score new grants"
Write-Host "  npm run server      -> start proposal API server"
Write-Host ""
