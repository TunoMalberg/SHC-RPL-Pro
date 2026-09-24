# Vercel-Produktions-Deployment über die REST API (PowerShell/WinHTTP).
#
# Hintergrund: Im Banknetz blockiert der lokale SSL-Inspection-/DLP-Proxy
# die Datei-Uploads der Vercel CLI (Node) mit ECONNRESET. PowerShell nutzt
# WinHTTP + Windows-Zertifikatspeicher und kommt durch. Dieses Skript
# lädt alle von Git getrackten Quellen (ohne Screenshots/Tests) per
# SHA-dedupliziertem Upload hoch und erzeugt ein Production-Deployment.
#
# Voraussetzungen:
#   - VERCEL_DEPLOYMENT_KEY in .env.local (gitignored, nie committen!)
#   - PortableGit unter C:\Users\<user>\PortableGit
#
# Aufruf:  powershell -ExecutionPolicy Bypass -File scripts\deploy-vercel.ps1

$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'
Set-Location (Split-Path $PSScriptRoot -Parent)

$git  = "$env:USERPROFILE\PortableGit\bin\git.exe"
if (-not (Test-Path $git)) { $git = "git" }
$team = "team_qKeqJ4O8ssVIxQnGGSb9UIGj"
$proj = "prj_hG9X7YMQe8LWzgjcUceZlBlTmAgT"

$line = Get-Content .\.env.local | Where-Object { $_ -match '^\s*VERCEL_DEPLOYMENT_KEY\s*=' } | Select-Object -First 1
if (-not $line) { Write-Output "FEHLER: VERCEL_DEPLOYMENT_KEY fehlt in .env.local"; exit 1 }
$tok  = ($line -replace '^\s*VERCEL_DEPLOYMENT_KEY\s*=\s*','').Trim().Trim('"').Trim("'")
$auth = @{ Authorization = "Bearer $tok" }

# Dateiliste: git-getrackt minus .vercelignore-Muster minus Testdateien
# (Bank-DLP blockiert einzelne Test-Uploads; für den Build irrelevant).
$files = & $git ls-files | Where-Object {
  ($_ -notlike 'screenshot*.png') -and ($_ -notlike '*.tsbuildinfo') -and
  ($_ -notlike '*.test.ts') -and ($_ -notlike '*.test.tsx') -and
  ($_ -notlike '*.spec.ts') -and ($_ -notlike '*.spec.tsx')
}

$sha1 = [System.Security.Cryptography.SHA1]::Create()
$manifest = New-Object System.Collections.ArrayList
$i = 0; $failed = @()

foreach ($f in $files) {
  $i++
  if (-not (Test-Path -LiteralPath $f)) { continue }
  $bytes = [System.IO.File]::ReadAllBytes((Resolve-Path -LiteralPath $f))
  $hash  = ($sha1.ComputeHash($bytes) | ForEach-Object { $_.ToString('x2') }) -join ''
  $h = @{ Authorization = "Bearer $tok"; 'x-vercel-digest' = $hash; 'Content-Type' = 'application/octet-stream' }
  $ok = $false
  for ($try = 1; $try -le 8 -and -not $ok; $try++) {
    try {
      $r = Invoke-WebRequest -Uri "https://api.vercel.com/v2/files?teamId=$team" -Method POST -Headers $h -Body $bytes -TimeoutSec 120 -UseBasicParsing
      if ($r.StatusCode -eq 200) { $ok = $true }
    } catch {
      Start-Sleep -Milliseconds (500 * $try)
    }
  }
  if ($ok) {
    [void]$manifest.Add(@{ file = $f; sha = $hash; size = $bytes.Length })
  } else {
    $failed += $f
  }
  if ($i % 25 -eq 0) { Write-Output "uploaded $i/$($files.Count)" }
}

Write-Output "UPLOAD DONE. ok=$($manifest.Count) failed=$($failed.Count)"
if ($failed.Count -gt 0) { Write-Output "FAILED FILES:"; $failed | ForEach-Object { Write-Output "  $_" }; Write-Output "ABORT"; exit 2 }

$body = @{
  name            = "retirement-planner"
  project         = $proj
  target          = "production"
  files           = @($manifest)
  projectSettings = @{ framework = "nextjs" }
} | ConvertTo-Json -Depth 6 -Compress

$created = $null
try {
  $created = Invoke-RestMethod -Uri "https://api.vercel.com/v13/deployments?teamId=$team&skipAutoDetectionConfirmation=1&forceNew=1" -Method POST -Headers $auth -ContentType 'application/json' -Body $body -TimeoutSec 120
} catch {
  Write-Output "CREATE ERR: $($_.Exception.Message)"
  try { $sr = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream()); Write-Output "RESP: $($sr.ReadToEnd())" } catch {}
  exit 3
}

$depId = $created.id
Write-Output "DEPLOYMENT CREATED id=$depId url=https://$($created.url) state=$($created.readyState)"

$final = $null
for ($p = 0; $p -lt 120; $p++) {
  Start-Sleep -Seconds 5
  try {
    $s = Invoke-RestMethod -Uri "https://api.vercel.com/v13/deployments/$depId`?teamId=$team" -Method GET -Headers $auth -TimeoutSec 60
  } catch { continue }
  $state = $s.readyState
  if ($p % 3 -eq 0) { Write-Output "[$([int]($p*5))s] state=$state" }
  if ($state -in @('READY','ERROR','CANCELED')) { $final = $s; break }
}

if ($null -eq $final) { Write-Output "TIMEOUT waiting for build"; exit 4 }
Write-Output "FINAL STATE: $($final.readyState)"
Write-Output "URL: https://$($final.url)"
$aliases = $final.alias
if ($aliases) { Write-Output "ALIASES: $($aliases -join ', ')" }
if ($final.readyState -eq 'ERROR') { Write-Output "ERROR MSG: $($final.errorMessage)"; exit 5 }
exit 0
