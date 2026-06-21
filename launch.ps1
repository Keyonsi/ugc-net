# =============================================================
#  UGC Net -- Launch Script
#  Starts local server + Cloudflare Quick Tunnel for remote access
#  Run: powershell -ExecutionPolicy Bypass -File launch.ps1
# =============================================================

$PORT     = 3000
$ROOT     = $PSScriptRoot
$CFD_PATH = Join-Path $ROOT "cloudflared.exe"
$CFD_URL  = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
$LOG_DIR  = Join-Path $ROOT ".logs"
$CF_LOG   = Join-Path $LOG_DIR "cloudflared.log"

function Write-Step([string]$msg) {
    Write-Host "[...] $msg" -ForegroundColor Yellow
}
function Write-Ok([string]$msg) {
    Write-Host " [OK] $msg" -ForegroundColor Green
}
function Write-Fail([string]$msg) {
    Write-Host "[ERR] $msg" -ForegroundColor Red
}

# Create log dir
if (-not (Test-Path $LOG_DIR)) { New-Item -ItemType Directory -Path $LOG_DIR | Out-Null }

Clear-Host
Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "        UGC Net -- Local + Remote Launcher      " -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# Step 1 - Check Python
Write-Step "Checking Python..."
try {
    $pyVer = & python --version 2>&1
    if ($LASTEXITCODE -ne 0) { throw "Not found" }
    Write-Ok "Found: $pyVer"
} catch {
    Write-Fail "Python not found. Install from https://python.org then retry."
    Read-Host "Press Enter to exit"
    exit 1
}

# Step 2 - Download cloudflared if missing
if (-not (Test-Path $CFD_PATH)) {
    Write-Step "Downloading cloudflared (one-time, ~30 MB)..."
    try {
        $ProgressPreference = 'SilentlyContinue'
        Invoke-WebRequest -Uri $CFD_URL -OutFile $CFD_PATH -UseBasicParsing
        Write-Ok "cloudflared downloaded."
    } catch {
        Write-Fail "Download failed: $_"
        Write-Host "     Will continue with local server only." -ForegroundColor DarkYellow
        $CFD_PATH = $null
    }
} else {
    Write-Ok "cloudflared found."
}

# Step 3 - Start Python HTTP server as background job
Write-Step "Starting local server on http://localhost:$PORT ..."
$pyJob = Start-Job -ScriptBlock {
    param($root, $port)
    Set-Location $root
    & python -m http.server $port --bind 127.0.0.1 2>&1
} -ArgumentList $ROOT, $PORT

Start-Sleep -Seconds 2

try {
    $null = Invoke-WebRequest "http://localhost:$PORT" -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
    Write-Ok "Local server is running."
} catch {
    Write-Host "     Server may still be starting, opening browser anyway..." -ForegroundColor DarkYellow
}

# Step 4 - Start Cloudflare Quick Tunnel
$tunnelUrl = $null
$cfProc = $null

if ($CFD_PATH -and (Test-Path $CFD_PATH)) {
    # Remove old log so we parse fresh
    if (Test-Path $CF_LOG) { Remove-Item $CF_LOG -Force }

    Write-Step "Starting Cloudflare Quick Tunnel..."

    $cfProc = Start-Process `
        -FilePath $CFD_PATH `
        -ArgumentList "tunnel", "--url", "http://localhost:$PORT", "--no-autoupdate", "--logfile", $CF_LOG `
        -PassThru -WindowStyle Hidden

    # Poll log for tunnel URL (up to 25 seconds)
    $waited = 0
    while ($waited -lt 25) {
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
        Write-Ok "Tunnel created!"
    } else {
        Write-Host "     Tunnel URL not detected yet. Check .logs\cloudflared.log" -ForegroundColor DarkYellow
    }
}

# Step 5 - Display access links
Write-Host ""
Write-Host "================================================" -ForegroundColor Green
Write-Host "                 ACCESS LINKS                  " -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Local  -->  http://localhost:$PORT" -ForegroundColor White

if ($tunnelUrl) {
    Write-Host "  Remote -->  $tunnelUrl" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  Share the Remote link with anyone on any device!" -ForegroundColor Magenta
    # Copy to clipboard
    try { $tunnelUrl | Set-Clipboard; Write-Host "  (Remote URL copied to clipboard)" -ForegroundColor DarkCyan } catch {}
} else {
    Write-Host ""
    Write-Host "  No tunnel URL yet. If cloudflared is running, check:" -ForegroundColor DarkYellow
    Write-Host "  $CF_LOG" -ForegroundColor DarkYellow
}

Write-Host ""
Write-Host "  Press Ctrl+C to stop everything." -ForegroundColor Gray
Write-Host "================================================" -ForegroundColor Green
Write-Host ""

# Open browser
Start-Process "http://localhost:$PORT"

# Step 6 - Keep alive loop with watchdog
try {
    while ($true) {
        Start-Sleep -Seconds 5

        # Watchdog: restart Python server if it crashed
        $jobState = (Get-Job -Id $pyJob.Id -ErrorAction SilentlyContinue).State
        if ($jobState -and $jobState -ne 'Running') {
            Write-Host "[WATCHDOG] Server stopped - restarting..." -ForegroundColor Yellow
            Remove-Job -Id $pyJob.Id -Force -ErrorAction SilentlyContinue
            $pyJob = Start-Job -ScriptBlock {
                param($root, $port)
                Set-Location $root
                & python -m http.server $port --bind 127.0.0.1 2>&1
            } -ArgumentList $ROOT, $PORT
        }

        # Refresh tunnel URL from log if not yet found
        if (-not $tunnelUrl -and (Test-Path $CF_LOG)) {
            $content = Get-Content $CF_LOG -Raw -ErrorAction SilentlyContinue
            if ($content -match 'https://[a-zA-Z0-9\-]+\.trycloudflare\.com') {
                $tunnelUrl = $Matches[0]
                Write-Host ""
                Write-Host "  Remote URL:  $tunnelUrl" -ForegroundColor Cyan
                try { $tunnelUrl | Set-Clipboard } catch {}
            }
        }
    }
} finally {
    Write-Host ""
    Write-Host "Shutting down..." -ForegroundColor Yellow
    Remove-Job -Id $pyJob.Id -Force -ErrorAction SilentlyContinue
    if ($cfProc) {
        Stop-Process -Id $cfProc.Id -Force -ErrorAction SilentlyContinue
    }
    Write-Host "Done. Goodbye!" -ForegroundColor Green
}
