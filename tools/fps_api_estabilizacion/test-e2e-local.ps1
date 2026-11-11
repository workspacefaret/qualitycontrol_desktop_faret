# Prueba de extremo a extremo LOCAL con procesos reales simulados (puerto alto, nada productivo).
# Simula: caida del proceso, recuperacion sin intervencion, colgado, y puerto ocupado por un proceso ajeno.
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
. "$here\fps-watchdog.ps1"
$node = (Get-Command node).Source
$port = 38002
$script:Port = $port
$script:HealthUrl = "http://127.0.0.1:$port/api/health"
$script:ProcMatch = 'fake-fps\.js'
$script:FailThreshold = 2
$script:CooldownSec = 0
$tmp = Join-Path ([IO.Path]::GetTempPath()) ('fpswd_e2e_' + [guid]::NewGuid().ToString('N')); New-Item -ItemType Directory $tmp | Out-Null
$script:LogDir = $tmp
$script:pass = 0; $script:fail = 0
function Check([string]$name, $cond) { if ($cond) { $script:pass++; Write-Host "  PASS $name" } else { $script:fail++; Write-Host "  FAIL $name" -ForegroundColor Red } }
$script:svc = $null      # el "servicio" simulado (lo que haria la tarea programada)
$script:starts = 0
function Start-Fake([string]$mode = 'ok') {
  $script:svc = Start-Process -FilePath $node -ArgumentList "`"$here\fake-fps.js`" $port $mode" -PassThru -WindowStyle Hidden
  Start-Sleep -Milliseconds 900
}
function Stop-Fake { if ($script:svc -and -not $script:svc.HasExited) { Stop-Process -Id $script:svc.Id -Force }; Start-Sleep -Milliseconds 400 }
# Efectos simulados de la tarea: Start = arrancar el fake; Stop = matarlo; estado = si el proceso vive
function Invoke-TaskStart { $script:starts++; if (-not ($script:svc -and -not $script:svc.HasExited)) { Start-Fake 'ok' } }
function Invoke-TaskStop { Stop-Fake }
function Get-TaskStateName { if ($script:svc -and -not $script:svc.HasExited) { 'Running' } else { 'Ready' } }
function Get-TaskLastStart { (Get-Date).AddHours(-1) }
function Run([int]$n) { 1..$n | ForEach-Object { $null = Invoke-Watchdog } }

try {
  Write-Host '1. Servicio sano en puerto real: sin acciones'
  Start-Fake 'ok'
  Check 'health real OK' (Test-Health); Run 3
  Check 'ningun inicio' ($script:starts -eq 0)

  Write-Host '2. Caida (se mata el proceso): recuperacion automatica sin intervencion'
  Stop-Fake
  Check 'health falla' (-not (Test-Health))
  Run 3
  Check 'se inicio exactamente 1 vez' ($script:starts -eq 1)
  Check 'servicio sano de nuevo' (Test-Health)
  Check 'un solo listener en el puerto' (@(Get-Listeners).Count -eq 1)
  Check 'bitacora indica cuando se recupero' ((Get-Content "$tmp\fps-watchdog.log" -Raw) -match '\[RECOVERY\]')

  Write-Host '3. Servicio colgado (escucha pero no responde): stop + start'
  Stop-Fake; Start-Fake 'mudo'
  Check 'health falla estando el puerto abierto' (-not (Test-Health))
  $before = $script:starts; Run 3
  Check 'reiniciado' ($script:starts -eq $before + 1); Check 'sano tras reinicio' (Test-Health)
  Check 'sigue habiendo un solo listener' (@(Get-Listeners).Count -eq 1)

  Write-Host '4. Respuesta de otra API (identidad incorrecta en el cuerpo): no es FPS'
  Stop-Fake; Start-Fake 'otro'
  Check 'Test-Health rechaza un cuerpo ajeno' (-not (Test-Health))

  Write-Host '5. Puerto ocupado por proceso AJENO (no coincide con fake-fps.js): no se toca'
  Stop-Fake
  $ajeno = Start-Process -FilePath $node -ArgumentList "-e `"require('http').createServer((q,r)=>r.end('x')).listen($port,'127.0.0.1')`"" -PassThru -WindowStyle Hidden
  Start-Sleep -Milliseconds 900
  $before = $script:starts; Run 4
  Check 'no se inicio nada' ($script:starts -eq $before)
  Check 'el proceso ajeno sigue vivo' (-not $ajeno.HasExited)
  Check 'bitacora ALERT' ((Get-Content "$tmp\fps-watchdog.log" -Raw) -match '\[ALERT\]')
  Stop-Process -Id $ajeno.Id -Force
}
finally {
  Stop-Fake
  Get-Process node -ErrorAction SilentlyContinue | Where-Object { $_.Id -eq $script:svc.Id } | Stop-Process -Force -ErrorAction SilentlyContinue
  Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
Write-Host ''
Write-Host "RESULTADO E2E: $script:pass PASS, $script:fail FAIL"
if ($script:fail -eq 0) { exit 0 } else { exit 1 }
