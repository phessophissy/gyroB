# Manual Vercel production deploy
# Requires: npx vercel login  OR  $env:VERCEL_TOKEN set

$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

Write-Host "Building frontend..."
npm run build

if ($env:VERCEL_TOKEN) {
  Write-Host "Deploying with VERCEL_TOKEN..."
  npx vercel deploy --prod --yes --token $env:VERCEL_TOKEN
} else {
  Write-Host "Deploying (requires vercel login)..."
  npx vercel deploy --prod --yes
}

Write-Host "Done. Check https://gyrob.vercel.app"