# One-shot pipeline: fetch data + generate report + start dashboards
# Usage: powershell -ExecutionPolicy Bypass -File .\.claude\skills\bug-analysis\scripts\run_full_pipeline.ps1 [-NoWeb] [-Full]

param(
    [switch]$NoWeb,
    [switch]$Full
)

$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$ErrorActionPreference = "Continue"
$ProjectRoot = "c:\Users\tsdl\bug_analysis_project"
Set-Location $ProjectRoot

$Py = Join-Path $ProjectRoot "venv\Scripts\python.exe"
if (-not (Test-Path $Py)) {
    Write-Host "ERROR: venv not created. Run setup_env.ps1 first." -ForegroundColor Red
    exit 1
}

$fullArg = if ($Full) { "--full" } else { $null }

Write-Host "=== Bug Analysis - Full Pipeline ===" -ForegroundColor Cyan

Write-Host ""
Write-Host "[1/7] Fetch Feishu ..." -ForegroundColor Yellow
if ($fullArg) { & $Py fetch_feishu.py $fullArg } else { & $Py fetch_feishu.py }

Write-Host ""
Write-Host "[2/7] Fetch Jira efficiency events ..." -ForegroundColor Yellow
if ($fullArg) { & $Py fetch_jira.py $fullArg } else { & $Py fetch_jira.py }

Write-Host ""
Write-Host "[3/7] Fetch Jira full bug snapshot ..." -ForegroundColor Yellow
& $Py fetch_jira_overview.py

Write-Host ""
Write-Host "[4/7] Fetch customer-side bugs ..." -ForegroundColor Yellow
& $Py fetch_customer_bugs.py

Write-Host ""
Write-Host "[5/7] Generate Excel report ..." -ForegroundColor Yellow
& $Py run_analysis.py

Write-Host ""
Write-Host "[6/7] Generate Bug overview dashboard ..." -ForegroundColor Yellow
& $Py dashboard_overview.py

Write-Host ""
Write-Host "[7/7] Generate customer-side dashboard ..." -ForegroundColor Yellow
& $Py dashboard_customer.py

if ($NoWeb) {
    Write-Host ""
    Write-Host "DONE: report generated (web server skipped)." -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "Starting web dashboard at http://localhost:8888 ..." -ForegroundColor Yellow
    & $Py web_server.py
}
