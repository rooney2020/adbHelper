# Environment check for bug-analysis Skill
# Usage: powershell -ExecutionPolicy Bypass -File .\.claude\skills\bug-analysis\scripts\check_env.ps1

$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$ErrorActionPreference = "Continue"
$ProjectRoot = "c:\Users\tsdl\bug_analysis_project"
Set-Location $ProjectRoot

Write-Host "=== Bug Analysis Skill - Environment Check ===" -ForegroundColor Cyan
Write-Host ("Project root: " + $ProjectRoot)
Write-Host ""

$ok = $true

# Python
try {
    $pyver = (py --version 2>&1) | Out-String
    Write-Host ("[OK]   Python: " + $pyver.Trim()) -ForegroundColor Green
} catch {
    Write-Host "[ERR]  Python not installed" -ForegroundColor Red
    $ok = $false
}

# Node.js
try {
    $nodever = (node --version 2>&1) | Out-String
    Write-Host ("[OK]   Node.js: " + $nodever.Trim()) -ForegroundColor Green
} catch {
    Write-Host "[WARN] Node.js not found (Feishu UAT will fall back to API refresh)" -ForegroundColor Yellow
}

# venv
$venvPy = Join-Path $ProjectRoot "venv\Scripts\python.exe"
if (Test-Path $venvPy) {
    Write-Host "[OK]   venv exists" -ForegroundColor Green
    $deps = & $venvPy -c "import pandas, openpyxl, requests, flask, numpy, plotly; print('all-ok')" 2>&1 | Out-String
    if ($deps -match 'all-ok') {
        Write-Host "[OK]   Dependencies present (pandas/openpyxl/requests/flask/numpy/plotly)" -ForegroundColor Green
    } else {
        Write-Host ("[ERR]  Dependency missing: " + $deps.Trim()) -ForegroundColor Red
        Write-Host "       Run: .\venv\Scripts\python.exe -m pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple"
        $ok = $false
    }
} else {
    Write-Host "[ERR]  venv not created" -ForegroundColor Red
    Write-Host "       Run: py -m venv venv"
    $ok = $false
}

# config.json
$cfgPath = Join-Path $ProjectRoot "config.json"
if (Test-Path $cfgPath) {
    Write-Host "[OK]   config.json present" -ForegroundColor Green
    try {
        $cfg = Get-Content $cfgPath -Raw -Encoding UTF8 | ConvertFrom-Json
        $required = @('project','jira','feishu','output')
        foreach ($k in $required) {
            if (-not $cfg.$k) {
                Write-Host ("[ERR]  config.json missing section: " + $k) -ForegroundColor Red
                $ok = $false
            }
        }
        if ($cfg.output.dir) {
            if (Test-Path $cfg.output.dir) {
                Write-Host ("[OK]   output.dir exists: " + $cfg.output.dir) -ForegroundColor Green
            } else {
                Write-Host ("[WARN] output.dir does not exist: " + $cfg.output.dir + " (will be auto-created)") -ForegroundColor Yellow
            }
        }
    } catch {
        Write-Host ("[ERR]  config.json parse failed: " + $_.Exception.Message) -ForegroundColor Red
        $ok = $false
    }
} else {
    Write-Host "[ERR]  config.json not found" -ForegroundColor Red
    Write-Host "       Run: Copy-Item config.json.example config.json"
    $ok = $false
}

# Data files
$dataFiles = [ordered]@{
    'data_page1.json'         = 'Feishu data'
    'jira_resolved.json'      = 'Jira efficiency events'
    'bugs_data.json'          = 'Jira full bug snapshot'
    'customer_bugs_data.json' = 'Customer-side bugs'
}
Write-Host ""
Write-Host "--- Data files ---"
foreach ($f in $dataFiles.Keys) {
    $fp = Join-Path $ProjectRoot $f
    if (Test-Path $fp) {
        $age = (Get-Date) - (Get-Item $fp).LastWriteTime
        $line = "[OK]   {0,-28} {1} (updated {2:N1} h ago)" -f $f, $dataFiles[$f], $age.TotalHours
        Write-Host $line -ForegroundColor Green
    } else {
        $line = "[--]   {0,-28} {1} (missing - run corresponding fetch_*.py)" -f $f, $dataFiles[$f]
        Write-Host $line -ForegroundColor Yellow
    }
}

Write-Host ""
if ($ok) {
    Write-Host "PASS: environment OK" -ForegroundColor Green
    exit 0
} else {
    Write-Host "FAIL: please fix the above issues" -ForegroundColor Red
    exit 1
}
