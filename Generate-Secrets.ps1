$jwtBytes = New-Object byte[] 48
$fieldBytes = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try {
    $rng.GetBytes($jwtBytes)
    $rng.GetBytes($fieldBytes)
} finally {
    $rng.Dispose()
}
Write-Host 'Copy these two values into the root .env file. Do not share them.' -ForegroundColor Yellow
Write-Host "JWT_SECRET=$([Convert]::ToBase64String($jwtBytes))"
Write-Host "FIELD_ENCRYPTION_KEY=$([Convert]::ToBase64String($fieldBytes))"
