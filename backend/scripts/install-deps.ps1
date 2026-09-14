# NSSF PDF Tools - backend dependency installer
# Run from the backend/ directory: powershell -ExecutionPolicy Bypass -File scripts\install-deps.ps1

$ErrorActionPreference = "Stop"

function Install-WingetPkg($id) {
    Write-Host "--- Installing $id ---"
    winget install --id $id -e --silent --accept-package-agreements --accept-source-agreements --disable-interactivity
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "$id did not report success (exit $LASTEXITCODE). It may already be installed, or may need a manual retry."
    }
}

Write-Host "=== Installing system engines (LibreOffice, Tesseract OCR) ==="
Install-WingetPkg "TheDocumentFoundation.LibreOffice"
Install-WingetPkg "UB-Mannheim.TesseractOCR"

Write-Host ""
Write-Host "=== Ghostscript ==="
Write-Host "Ghostscript is NOT on winget under a working package ID as of this writing."
Write-Host "Downloading the official installer directly from the ArtifexSoftware/ghostpdl-downloads GitHub release instead."
$ghostscriptInstalled = Get-ChildItem "C:\Program Files\gs" -ErrorAction SilentlyContinue
if ($ghostscriptInstalled) {
    Write-Host "Ghostscript already appears to be installed at C:\Program Files\gs -- skipping."
} else {
    $releaseInfo = Invoke-RestMethod -Uri "https://api.github.com/repos/ArtifexSoftware/ghostpdl-downloads/releases/latest"
    $asset = $releaseInfo.assets | Where-Object { $_.name -match "w64\.exe$" } | Select-Object -First 1
    if (-not $asset) {
        Write-Warning "Could not find a Windows 64-bit Ghostscript installer in the latest release. Install manually from https://ghostscript.com/releases/gsdnld.html"
    } else {
        $installerPath = Join-Path $env:TEMP $asset.name
        Write-Host "Downloading $($asset.browser_download_url) ..."
        Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $installerPath
        Write-Host "Installing Ghostscript silently ..."
        Start-Process -FilePath $installerPath -ArgumentList "/VERYSILENT /SUPPRESSMSGBOXES /NORESTART /SP-" -Wait
    }
}

Write-Host ""
Write-Host "=== OCR language packs (Kiswahili, French, English, orientation-detection) ==="
Write-Host "Winget's Tesseract package only bundles English -- fetching the rest into a"
Write-Host "project-local tessdata directory (no admin rights needed to write there)."
$tessdataDir = Join-Path $PSScriptRoot "..\tessdata"
New-Item -ItemType Directory -Force -Path $tessdataDir | Out-Null
$languagePacks = @("eng", "osd", "swa", "fra")
foreach ($lang in $languagePacks) {
    $dest = Join-Path $tessdataDir "$lang.traineddata"
    if (Test-Path $dest) {
        Write-Host "$lang.traineddata: already present, skipping"
        continue
    }
    $url = "https://github.com/tesseract-ocr/tessdata_fast/raw/main/$lang.traineddata"
    try {
        Write-Host "Downloading $lang.traineddata ..."
        Invoke-WebRequest -Uri $url -OutFile $dest
    } catch {
        Write-Warning "Could not download $lang.traineddata ($_). OCR in that language will fail until it's placed at $dest."
    }
}

# Tesseract also needs its configs/tessconfigs subfolders and pdf.ttf (used to embed the
# invisible searchable-text layer) alongside the language files -- a tessdata directory
# with only .traineddata files fails with "Error occurred while parsing a Tesseract
# configuration file". Copy them from the system install onto our project-local copy.
$systemTessdata = "C:\Program Files\Tesseract-OCR\tessdata"
foreach ($item in @("configs", "tessconfigs", "pdf.ttf")) {
    $src = Join-Path $systemTessdata $item
    $dest = Join-Path $tessdataDir $item
    if ((Test-Path $src) -and -not (Test-Path $dest)) {
        Copy-Item -Path $src -Destination $dest -Recurse
    }
}

Write-Host ""
Write-Host "=== Python virtual environment + packages ==="
if (-not (Test-Path ".\venv")) {
    python -m venv venv
}
.\venv\Scripts\python.exe -m pip install --upgrade pip
.\venv\Scripts\python.exe -m pip install -r requirements.txt
.\venv\Scripts\python.exe -m playwright install chromium

Write-Host ""
Write-Host "=== Done ==="
Write-Host "Restart your terminal (or this script's shell) so PATH changes from the installers are picked up,"
Write-Host "then start the backend with: .\venv\Scripts\python.exe -m uvicorn app.main:app --reload"
