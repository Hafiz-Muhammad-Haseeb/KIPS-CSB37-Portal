$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$envFile = Join-Path $root '.env'

if (-not (Test-Path $envFile)) {
    throw "`.env file not found. Copy .env.example to .env, fill in your private credentials, then run this script again."
}

Get-Content $envFile | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith('#')) { return }
    if ($line -match '^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
        $key = $Matches[1]
        $value = $Matches[2].Trim()
        if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
            $value = $value.Substring(1, $value.Length - 2)
        }
        [Environment]::SetEnvironmentVariable($key, $value, 'Process')
    }
}

# Support the variable names used by the existing Docker Compose .env as well.
if (-not $env:DB_PASSWORD -and $env:POSTGRES_PASSWORD) { $env:DB_PASSWORD = $env:POSTGRES_PASSWORD }
if (-not $env:DB_USERNAME -and $env:POSTGRES_USER) { $env:DB_USERNAME = $env:POSTGRES_USER }
if (-not $env:DB_URL) { $env:DB_URL = 'jdbc:postgresql://localhost:5433/KIPS_CSB37' }

if (-not $env:JWT_SECRET -or $env:JWT_SECRET -like 'REPLACE_*' -or $env:JWT_SECRET.Length -lt 32) {
    throw 'JWT_SECRET missing/placeholder. Generate a random secret and place it in the root .env file.'
}
if (-not $env:FIELD_ENCRYPTION_KEY -or $env:FIELD_ENCRYPTION_KEY -like 'REPLACE_*') {
    throw 'FIELD_ENCRYPTION_KEY missing/placeholder. Generate a Base64 32-byte key and place it in root .env. Keep it safe and stable.'
}
if (-not $env:DB_PASSWORD) { throw 'DB_PASSWORD (or POSTGRES_PASSWORD) is not configured in .env.' }
if (-not $env:BOOTSTRAP_ADMIN_USERNAME -or -not $env:BOOTSTRAP_ADMIN_PASSWORD -or $env:BOOTSTRAP_ADMIN_PASSWORD -like 'REPLACE_*') {
    throw 'Set BOOTSTRAP_ADMIN_USERNAME and a unique BOOTSTRAP_ADMIN_PASSWORD (minimum 12 characters) in .env.'
}

$backend = Join-Path $root 'backend\kips-csb37-backend'
Push-Location $backend
try {
    mvn spring-boot:run
} finally {
    Pop-Location
}
