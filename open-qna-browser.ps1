param([string]$Url = 'http://localhost:8765')

$browser = @(
  'C:\Program Files\Google\Chrome\Application\chrome.exe',
  'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $browser) { throw 'Chrome or Edge was not found.' }

$drive = Split-Path -Path $PSScriptRoot -Qualifier
$profile = Join-Path $drive 'QNA-Naura-Browser'
$temp = Join-Path $profile 'temp'
New-Item -ItemType Directory -Force -Path $temp | Out-Null
$env:TEMP = $temp
$env:TMP = $temp
Start-Process -FilePath $browser -ArgumentList @("--user-data-dir=$profile", '--no-first-run', $Url)
