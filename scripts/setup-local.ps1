$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$psql = 'C:\Program Files\PostgreSQL\16\bin\psql.exe'
if (!(Test-Path -LiteralPath $psql)) { throw 'No se encuentra PostgreSQL 16.' }
$secret = Read-Host 'Contraseña de postgres (no se mostrará)' -AsSecureString
if ($secret.Length -eq 0) {
    throw 'No escribiste ninguna clave. Ejecuta el comando completo de nuevo y escribe la clave de postgres antes de pulsar Enter. No se muestran caracteres mientras escribes.'
}
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
$previousPassword = $env:PGPASSWORD
try {
    $env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    if ([string]::IsNullOrEmpty($env:PGPASSWORD)) { throw 'No se pudo leer la clave; no se intento conectar.' }
    & $psql -X -w -h 127.0.0.1 -U postgres -d postgres -v ON_ERROR_STOP=1 -c 'SELECT 1' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'No fue posible autenticar con PostgreSQL.' }
    $existing = & $psql -X -w -h 127.0.0.1 -U postgres -d postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname='sentia' UNION ALL SELECT 1 FROM pg_database WHERE datname='sentia'"
    if ($LASTEXITCODE -ne 0) { throw 'No fue posible consultar PostgreSQL.' }
    if ($existing) { throw 'Ya existe el usuario o la base sentia. Se detuvo para conservar tus datos; pide continuar con la configuración existente.' }
    $databasePassword = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
    $adminPassword = [guid]::NewGuid().ToString('N')
    $jwtSecret = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
    $sql = "CREATE USER sentia WITH PASSWORD '$databasePassword';"
    $sql | & $psql -X -w -h 127.0.0.1 -U postgres -d postgres -v ON_ERROR_STOP=1
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo crear el usuario.' }
    & $psql -X -w -h 127.0.0.1 -U postgres -d postgres -v ON_ERROR_STOP=1 -c 'CREATE DATABASE sentia OWNER sentia'
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo crear la base.' }
    $envFile = 'server/.env'
    $content = if (Test-Path -LiteralPath $envFile) { [IO.File]::ReadAllText((Join-Path $PWD $envFile)) } else { [IO.File]::ReadAllText((Join-Path $PWD 'server/.env.example')) }
    $values = @{
        DATABASE_URL = "postgresql://sentia:${databasePassword}@localhost:5432/sentia?schema=public"
        JWT_SECRET = $jwtSecret
        ADMIN_NAME = 'Administrador Brigada 105'
        ADMIN_EMAIL = 'admin@sentia.local'
        ADMIN_PASSWORD = $adminPassword
    }
    foreach ($key in $values.Keys) {
        if ($content -match "(?m)^${key}=") { $content = [regex]::Replace($content, "(?m)^${key}=.*$", "$key=$($values[$key])") }
        else { $content += "`n$key=$($values[$key])" }
    }
    [IO.File]::WriteAllText((Join-Path $PWD $envFile), $content, (New-Object Text.UTF8Encoding $false))
} finally {
    $env:PGPASSWORD = $previousPassword
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
}
foreach ($task in @('db:generate', 'db:migrate', 'db:admin')) {
    & npm.cmd run $task
    if ($LASTEXITCODE -ne 0) { throw "Falló $task. La configuración está guardada en server/.env; no repitas este inicializador, continúa desde ese comando." }
}
Write-Host 'SENTIA configurado. Correo: admin@sentia.local'
Write-Host 'Tu contraseña de acceso está en ADMIN_PASSWORD de server/.env. No la compartas.'
Write-Host 'Arranca en dos terminales: npm.cmd run dev:server y npm.cmd run dev:client'
