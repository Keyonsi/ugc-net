# =============================================================
#  UGC Net — Launch Script
#  Starts a local server + Cloudflare Quick Tunnel for remote access
#  Run: powershell -ExecutionPolicy Bypass -File launch.ps1
# =============================================================

$PORT       = 3000
$ROOT       = $PSScriptRoot
$CFD_PATH   = Join-Path $ROOT "cloudflared.exe"
$CFD_URL    = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
$LOG_DIR    = Join-Path $ROOT ".logs"
$CF_LOG     = Join-Path $LOG_DIR "cloudflared.log"

# ── Helpers ──────────────────────────────────────────────────
function Write-Banner {
    Clear-Host
    Write-Host ""
    Write-Host "  ╔══════════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "  ║           UGC Net — Launcher v1.0            ║" -ForegroundColor Cyan
    Write-Host "  ╚══════════════════════════════════════════════╝" -ForegroundColor Cyan
    Write-Host ""
}

function Write-Step([string]$msg) {
    Write-Host "  ● $msg" -ForegroundColor Yellow
}

function Write-Success([string]$msg) {
    Write-Host "  ✔ $msg" -ForegroundColor Green
}

function Write-Err([string]$msg) {
    Write-Host "  ✘ $msg" -ForegroundColor Red
}

# ── Create log dir ────────────────────────────────────────────
if (-not (Test-Path $LOG_DIR)) { New-Item -ItemType Directory -Path $LOG_DIR | Out-Null }

# ── Banner ────────────────────────────────────────────────────
Write-Banner

# ── Step 1: Check Python ─────────────────────────────────────
Write-Step "Checking Python..."
try {
    $pyVer = python --version 2>&1
    Write-Success "Found $pyVer"
} catch {
    Write-Err "Python not found. Please install Python 3 from https://python.org"
    Read-Host "Press Enter to exit"
    exit 1
}

# ── Step 2: Download cloudflared if missing ───────────────────
if (-not (Test-Path $CFD_PATH)) {
    Write-Step "Downloading cloudflared (one-time, ~30 MB)..."
    try {
        $ProgressPreference = 'SilentlyContinue'
        Invoke-WebRequest -Uri $CFD_URL -OutFile $CFD_PATH -UseBasicParsing
        Write-Success "cloudflared downloaded."
    } catch {
        Write-Err "Failed to download cloudflared: $_"
        Write-Host "  → Will continue with local server only." -ForegroundColor DarkYellow
        $CFD_PATH = $null
    }
} else {
    Write-Success "cloudflared already present."
}

# ── Step 3: Start Python HTTP server ─────────────────────────
Write-Step "Starting local server on http://localhost:$PORT ..."
$pyJob = Start-Job -ScriptBlock {
    param($root, $port)
    Set-Location $root
    python -m http.server $port --bind 127.0.0.1 2>&1
} -ArgumentList $ROOT, $PORT

Start-Sleep -Seconds 1

# Quick health check
try {
    $null = Invoke-WebRequest "http://localhost:$PORT" -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
    Write-Success "Local server is up."
} catch {
    Write-Err "Local server may not have started. Check Python."
}

# ── Step 4: Start Cloudflare Quick Tunnel ─────────────────────
$tunnelUrl = $null

if ($CFD_PATH -and (Test-Path $CFD_PATH)) {
    Write-Step "Starting Cloudflare Quick Tunnel..."

    $cfJob = Start-Process -FilePath $CFD_PATH `
        -ArgumentList "tunnel", "--url", "http://localhost:$PORT", "--no-autoupdate", "--logfile", $CF_LOG `
        -PassThru -WindowStyle Hidden

    # Poll log file for the public URL (up to 20 seconds)
    $waited = 0
    while ($waited -lt 20) {
        Start-Sleep -Seconds 1
        $waited++
        if (Test-Path $CF_LOG) {
            $content = Get-Content $CF_LOG -Raw -ErrorAction SilentlyContinue
            if ($content -match 'https://[a-zA-Z0-9\-]+\.trycloudflare\.com') {
                $tunnelUrl = $Matches[0]
                break
            }
        }
    }

    if ($tunnelUrl) {
        Write-Success "Cloudflare Tunnel created!"
    } else {
        Write-Err "Tunnel URL not detected yet — check .logs\cloudflared.log for the URL."
    }
}

# ── Step 5: Open browser ──────────────────────────────────────
Write-Host ""
Write-Host "  ╔══════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "  ║              ACCESS LINKS                    ║" -ForegroundColor Green
Write-Host "  ╠══════════════════════════════════════════════╣" -ForegroundColor Green
Write-Host "  ║  Local :  http://localhost:$PORT               ║" -ForegroundColor White
if ($tunnelUrl) {
    Write-Host "  ║  Remote:  $tunnelUrl" -ForegroundColor Cyan
    Write-Host "  ║           (share this with anyone!)          ║" -ForegroundColor DarkCyan
}
Write-Host "  ╚══════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "  Press Ctrl+C to stop everything." -ForegroundColor Gray
Write-Host ""

# Copy tunnel URL to clipboard if available
if ($tunnelUrl) {
    try {
        $tunnelUrl | Set-Clipboard
        Write-Host "  📋 Remote URL copied to clipboard!" -ForegroundColor Magenta
    } catch {}
}

# Open the app in browser
Start-Process "http://localhost:$PORT"

# ── Step 6: Keep alive & cleanup ─────────────────────────────
try {
    while ($true) {
        Start-Sleep -Seconds 5
        # Restart Python server if it died
        $jobState = (Get-Job -Id $pyJob.Id -ErrorAction SilentlyContinue).State
        if ($jobState -ne 'Running') {
            Write-Host "  ⚠ Server crashed — restarting..." -ForegroundColor Yellow
            $pyJob = Start-Job -ScriptBlock {
                param($root, $port)
                Set-Location $root
                python -m http.server $port --bind 127.0.0.1 2>&1
            } -ArgumentList $ROOT, $PORT
        }
    }
} finally {
    Write-Host ""
    Write-Host "  Shutting down..." -ForegroundColor Yellow
    Remove-Job -Id $pyJob.Id -Force -ErrorAction SilentlyContinue
    if ($cfJob) { Stop-Process -Id $cfJob.Id -Force -ErrorAction SilentlyContinue }
    Write-Host "  Goodbye!" -ForegroundColor Cyan
}
