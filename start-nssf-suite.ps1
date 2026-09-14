# NSSF PDF Tools -- unified local launcher
# Run from the repository root: powershell -ExecutionPolicy Bypass -File start-nssf-suite.ps1
#
# - Scans ports 3000/8000 for stale processes from a previous run and stops them
# - Verifies local prerequisites (LibreOffice, Tesseract, Ghostscript, Python venv, node_modules)
# - Launches the FastAPI backend and Next.js frontend, both bound to 127.0.0.1 only
# - On Ctrl+C (or any startup failure), stops both servers together

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

function Write-Section($text) {
    Write-Host ""
    Write-Host "=== $text ===" -ForegroundColor Cyan
}

function Stop-StalePort($port, $label) {
    $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if (-not $conns) {
        Write-Host "Port $port ($label): free"
        return
    }
    foreach ($conn in $conns) {
        $procId = $conn.OwningProcess
        $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$procId" -ErrorAction SilentlyContinue
        $name = if ($proc) { $proc.Name } else { "unknown" }
        Write-Host "Port $port ($label): stopping stale process $name (PID $procId)" -ForegroundColor Yellow
        Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Milliseconds 500
}

# winget-installed engines are frequently missing from PATH for a fresh process --
# mirrors the same fallback locations app/core/engines.py checks on the backend side,
# so this check agrees with what the backend will actually detect at runtime.
$WindowsFallbacks = @{
    soffice   = @("C:\Program Files\LibreOffice\program\soffice.exe", "C:\Program Files (x86)\LibreOffice\program\soffice.exe")
    tesseract = @("C:\Program Files\Tesseract-OCR\tesseract.exe")
    gswin64c  = @("C:\Program Files\gs\gs*\bin\gswin64c.exe")
}

function Test-EngineAvailable($exeNames, $label, [ref]$problems) {
    foreach ($exe in $exeNames) {
        if (Get-Command $exe -ErrorAction SilentlyContinue) { Write-Host "$label`: found ($exe on PATH)"; return }
        foreach ($pattern in $WindowsFallbacks[$exe]) {
            $match = Get-ChildItem -Path $pattern -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($match) { Write-Host "$label`: found ($($match.FullName))"; return }
        }
    }
    $problems.Value += "$label was not found. Run backend\scripts\install-deps.ps1, or set the matching NSSF_*_PATH env var."
    Write-Host "$label`: NOT FOUND" -ForegroundColor Yellow
}

Write-Section "Checking for stale processes"
Stop-StalePort 8000 "backend"
Stop-StalePort 3000 "frontend"

Write-Section "Checking prerequisites"
$problems = @()

Test-EngineAvailable @("soffice") "LibreOffice" ([ref]$problems)
Test-EngineAvailable @("tesseract") "Tesseract OCR" ([ref]$problems)
Test-EngineAvailable @("gswin64c", "gs") "Ghostscript" ([ref]$problems)

$venvPython = Join-Path $root "backend\venv\Scripts\python.exe"
if (Test-Path $venvPython) {
    Write-Host "Python venv: found"
} else {
    $problems += "backend\venv not found. Run backend\scripts\install-deps.ps1 first."
    Write-Host "Python venv: NOT FOUND" -ForegroundColor Yellow
}

$nodeModules = Join-Path $root "node_modules"
if (Test-Path $nodeModules) {
    Write-Host "Node dependencies: found"
} else {
    $problems += "node_modules not found. Run 'npm install' first."
    Write-Host "Node dependencies: NOT FOUND" -ForegroundColor Yellow
}

if ($problems.Count -gt 0) {
    Write-Host ""
    Write-Host "Some prerequisites are missing:" -ForegroundColor Yellow
    $problems | ForEach-Object { Write-Host "  - $_" -ForegroundColor Yellow }
    Write-Host "Continuing anyway -- affected tools will return a clear error until these are fixed." -ForegroundColor Yellow
}

$backendProc = $null
$frontendProc = $null

try {
    Write-Section "Starting servers"

    $backendLog = Join-Path $root "backend\suite-backend.log"
    $frontendLog = Join-Path $root "suite-frontend.log"

    $backendProc = Start-Process -FilePath $venvPython `
        -ArgumentList "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000" `
        -WorkingDirectory (Join-Path $root "backend") `
        -RedirectStandardOutput $backendLog -RedirectStandardError "$backendLog.err" `
        -PassThru -WindowStyle Hidden

    # npm is npm.cmd on Windows, not a native Win32 exe -- Start-Process needs cmd.exe
    # as the actual executable, with npm passed as an argument to it.
    $frontendProc = Start-Process -FilePath "cmd.exe" `
        -ArgumentList "/c", "npm", "run", "dev" `
        -WorkingDirectory $root `
        -RedirectStandardOutput $frontendLog -RedirectStandardError "$frontendLog.err" `
        -PassThru -WindowStyle Hidden

    Write-Host "Backend starting (PID $($backendProc.Id)), log: $backendLog"
    Write-Host "Frontend starting (PID $($frontendProc.Id)), log: $frontendLog"

    Start-Sleep -Seconds 3
    Write-Host ""
    Write-Host "NSSF PDF Tools is starting up:" -ForegroundColor Green
    Write-Host "  Frontend: http://127.0.0.1:3000"
    Write-Host "  Backend:  http://127.0.0.1:8000"
    Write-Host ""
    Write-Host "Press Ctrl+C to stop both servers." -ForegroundColor Cyan

    while ($true) {
        Start-Sleep -Seconds 2
        if ($backendProc.HasExited) {
            Write-Host "Backend process exited unexpectedly -- see $backendLog.err" -ForegroundColor Red
            break
        }
        if ($frontendProc.HasExited) {
            Write-Host "Frontend process exited unexpectedly -- see $frontendLog.err" -ForegroundColor Red
            break
        }
    }
}
finally {
    Write-Section "Shutting down"
    foreach ($proc in @($backendProc, $frontendProc)) {
        if ($proc -and -not $proc.HasExited) {
            Write-Host "Stopping PID $($proc.Id)..."
            Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
        }
    }
    # next dev / uvicorn --reload can spawn a detached child worker process that
    # survives the parent being killed -- sweep the ports once more to be sure.
    Stop-StalePort 8000 "backend"
    Stop-StalePort 3000 "frontend"
    Write-Host "Stopped." -ForegroundColor Green
}
