# One-shot venv + dependency setup for bug-analysis Skill
# Usage: powershell -ExecutionPolicy Bypass -File .\.claude\skills\bug-analysis\scripts\setup_env.ps1

$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$ErrorActionPreference = "Stop"
$ProjectRoot = "c:\Users\tsdl\bug_analysis_project"
Set-Location $ProjectRoot

Write-Host "=== Bug Analysis Skill - Setup ===" -ForegroundColor Cyan
Write-Host ("Project root: " + $ProjectRoot)
Write-Host ""

if (-not (Test-Path "$ProjectRoot\venv")) {
    Write-Host "[1/3] Creating venv ..." -ForegroundColor Yellow
    py -m venv venv
} else {
    Write-Host "[1/3] venv already exists, skipping" -ForegroundColor Green
}

$venvPy = "$ProjectRoot\venv\Scripts\python.exe"

Write-Host ""
Write-Host "[2/3] Upgrading pip ..." -ForegroundColor Yellow
& $venvPy -m pip install --upgrade pip -i https://pypi.tuna.tsinghua.edu.cn/simple

Write-Host ""
Write-Host "[3/3] Installing dependencies ..." -ForegroundColor Yellow
& $venvPy -m pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple

Write-Host ""
Write-Host "DONE. Next steps:" -ForegroundColor Green
Write-Host "  1. Copy config.json.example to config.json and fill in credentials"
Write-Host "  2. Run .\run.bat to generate the Excel report"
Write-Host "  3. Run .\web.bat to launch the dashboards"
