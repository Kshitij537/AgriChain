param(
  [string]$DbUser = "postgres",
  [string]$DbHost = "localhost",
  [int]$DbPort = 5432
)

# AgriChain PostgreSQL setup (Windows / PowerShell)
# Creates the database and tables using the SQL files in database/schemas.

$ErrorActionPreference = 'Stop'

Write-Host "🚀 AgriChain Setup (Windows)" -ForegroundColor Yellow

function Assert-Command($name) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
    throw "❌ '$name' not found. Install PostgreSQL and ensure 'psql' is on PATH."
  }
}

Assert-Command "psql"

$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$DbName = "agrichain_db"

Write-Host "\nStep 1: Creating database '$DbName' (if needed)..." -ForegroundColor Yellow

# Create DB if missing (works on PostgreSQL 9.6+)
$createDbSql = @"
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_database WHERE datname = '$DbName') THEN
    CREATE DATABASE $DbName;
  END IF;
END
$$;
"@

& psql -h $DbHost -p $DbPort -U $DbUser -d postgres -v ON_ERROR_STOP=1 -c $createDbSql | Out-Null
Write-Host "✅ Database ready" -ForegroundColor Green

Write-Host "\nStep 2: Creating tables..." -ForegroundColor Yellow

$schemaDir = Join-Path $RepoRoot "database\schemas"
$schemaFiles = @(
  "users.sql",
  "farms.sql",
  "ndvi.sql",
  "ndvi_history.sql",
  "disease.sql",
  "spoilage.sql"
)

foreach ($file in $schemaFiles) {
  $path = Join-Path $schemaDir $file
  if (-not (Test-Path $path)) {
    throw "❌ Missing schema file: $path"
  }
  & psql -h $DbHost -p $DbPort -U $DbUser -d $DbName -v ON_ERROR_STOP=1 -f $path | Out-Null
  Write-Host "✅ Applied $file" -ForegroundColor Green
}

Write-Host "\nStep 3: Verifying tables..." -ForegroundColor Yellow
& psql -h $DbHost -p $DbPort -U $DbUser -d $DbName -v ON_ERROR_STOP=1 -c "\\dt"

$seedPath = Join-Path $RepoRoot "database\seed\sample_data.sql"
if (Test-Path $seedPath) {
  $seedContent = Get-Content $seedPath -Raw
  if ($seedContent.Trim().Length -gt 0) {
    Write-Host "\nOptional: Loading seed data..." -ForegroundColor Yellow
    & psql -h $DbHost -p $DbPort -U $DbUser -d $DbName -v ON_ERROR_STOP=1 -f $seedPath | Out-Null
    Write-Host "✅ Seed data loaded" -ForegroundColor Green
  }
}

Write-Host "\n✅ Setup complete!" -ForegroundColor Green
Write-Host "Next: copy backend/.env.example to backend/.env and start backend + satellite-service." -ForegroundColor Yellow
