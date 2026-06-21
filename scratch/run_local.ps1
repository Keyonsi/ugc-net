# run_local.ps1 - Simple local server for UGC NET Hindi Master PWA
# Usage: powershell -ExecutionPolicy Bypass -File run_local.ps1

# Configuration
$Port = 8000
# Resolve the project root (parent of the script's directory)
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$Root = Resolve-Path (Join-Path $ScriptDir '..')

Write-Host "Serving $Root on http://localhost:$Port"

# Check if Python is available
$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) {
    Write-Error "Python is not installed or not in PATH. Install Python or use another static server."
    exit 1
}

# Start the server
python -m http.server $Port --directory $Root
