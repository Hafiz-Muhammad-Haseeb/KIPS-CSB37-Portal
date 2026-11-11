$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$frontend = Join-Path $root 'frontend'
Set-Location $frontend

if (Get-Command py -ErrorAction SilentlyContinue) {
    py -m http.server 5500
} elseif (Get-Command python -ErrorAction SilentlyContinue) {
    python -m http.server 5500
} else {
    throw 'Python 3 was not found. Install Python or run another static web server for the frontend folder.'
}
