# Pruebas locales del supervisor (simulaciones; no toca servidores ni tareas reales).
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
. "$here\fps-watchdog.ps1"
$script:pass = 0; $script:fail = 0
function Check([string]$name, $cond) { if ($cond) { $script:pass++; Write-Host "  PASS $name" } else { $script:fail++; Write-Host "  FAIL $name" -ForegroundColor Red } }
$tmp = Join-Path ([IO.Path]::GetTempPath()) ('fpswd_' + [guid]::NewGuid().ToString('N')); New-Item -ItemType Directory $tmp | Out-Null
$script:LogDir = $tmp
$script:Calls = New-Object System.Collections.ArrayList
$script:Sim = @{}
function Get-Listeners { $script:Sim.listeners }
function Get-ProcInfo([int]$procId) { $c = $script:Sim.procs[$procId]; if ($c) { [pscustomobject]@{ ProcessId = $procId; CommandLine = $c } } }
function Test-Health { $script:Sim.health }
function Get-TaskStateName { $script:Sim.task }
function Get-TaskLastStart { $script:Sim.lastStart }
function Invoke-TaskStart { [void]$script:Calls.Add('start'); $script:Sim.task = 'Running'; $script:Sim.lastStart = $script:Sim.now }
function Invoke-TaskStop  { [void]$script:Calls.Add('stop');  $script:Sim.task = 'Ready' }
function Get-Now { $script:Sim.now }
function Reset([hashtable]$o) {
  Remove-Item "$tmp\*" -Force -ErrorAction SilentlyContinue; $script:Calls.Clear()
  $script:Sim = @{ health = $true; listeners = @(); task = 'Running'; lastStart = (Get-Date).AddHours(-5); procs = @{}; now = (Get-Date) }
  foreach ($k in $o.Keys) { $script:Sim[$k] = $o[$k] }
}
function Tick([int]$mins = 1) { $script:Sim.now = $script:Sim.now.AddMinutes($mins); Invoke-Watchdog }
$mine = 'node.exe src\server.js'; $foreign = 'node ...pm2\lib\ProcessContainerFork.js'

Write-Host '1. Servicio sano: sin acciones'
Reset @{ health = $true; listeners = @(100); procs = @{ 100 = $mine } }
Check 'devuelve OK' ((Tick) -eq 'OK'); Check 'sin start/stop' ($script:Calls.Count -eq 0)

Write-Host '2. Fallo aislado (< umbral): no actua'
Reset @{ health = $false; listeners = @(100); procs = @{ 100 = $mine } }
Check 'espera 1' ((Tick) -eq 'ESPERA'); Check 'espera 2' ((Tick) -eq 'ESPERA'); Check 'sin acciones' ($script:Calls.Count -eq 0)
$script:Sim.health = $true; [void](Tick); Check 'recuperacion espontanea resetea contador' ((Read-State).fails -eq 0)

Write-Host '3. Proceso muerto + tarea Ready: inicia la tarea UNA vez'
Reset @{ health = $false; listeners = @(); task = 'Ready' }
[void](Tick); [void](Tick); $r = Tick
Check 'RECUPERADO al 3er fallo' ($r -eq 'RECUPERADO'); Check 'solo start (sin stop)' (($script:Calls -join ',') -eq 'start')
$script:Sim.health = $true; $script:Sim.listeners = @(100); $script:Sim.procs = @{ 100 = $mine }
Check 'tras recuperar queda OK' ((Tick) -eq 'OK')
Check 'bitacora registra RECOVERY' ((Get-Content "$tmp\fps-watchdog.log" -Raw) -match '\[RECOVERY\]')

Write-Host '4. Instancia recien iniciada sin escuchar: periodo de gracia'
Reset @{ health = $false; listeners = @(); task = 'Running' }
$script:Sim.lastStart = $script:Sim.now.AddSeconds(150)
[void](Tick); [void](Tick); $r = Tick
Check 'GRACIA, sin acciones' ($r -eq 'GRACIA' -and $script:Calls.Count -eq 0)

Write-Host '5. Proceso propio colgado (escucha pero health falla): stop + start'
Reset @{ health = $false; listeners = @(100); procs = @{ 100 = $mine }; task = 'Running' }
[void](Tick); [void](Tick); $r = Tick
Check 'RECUPERADO' ($r -eq 'RECUPERADO'); Check 'stop luego start' (($script:Calls -join ',') -eq 'stop,start')

Write-Host '6. Puerto ocupado por proceso AJENO: nunca actua'
Reset @{ health = $false; listeners = @(200); procs = @{ 200 = $foreign }; task = 'Ready' }
[void](Tick); [void](Tick); $r = Tick
Check 'AJENO' ($r -eq 'AJENO'); Check 'sin start/stop' ($script:Calls.Count -eq 0); Check 'bitacora ALERT' ((Get-Content "$tmp\fps-watchdog.log" -Raw) -match '\[ALERT\]')
Check 'sigue sin actuar en ticks siguientes' (((Tick) -eq 'AJENO') -and ($script:Calls.Count -eq 0))

Write-Host '7. Enfriamiento entre recuperaciones'
Reset @{ health = $false; listeners = @(); task = 'Ready' }
[void](Tick); [void](Tick); [void](Tick)
$script:Sim.task = 'Ready'; $script:Calls.Clear()
[void](Tick); [void](Tick); $r = Tick
Check 'ENFRIAMIENTO sin acciones' (($r -eq 'ENFRIAMIENTO') -and ($script:Calls.Count -eq 0))

Write-Host '8. Disyuntor: maximo 3 recuperaciones/hora'
Reset @{ health = $false; listeners = @(); task = 'Ready' }
for ($i = 0; $i -lt 60; $i++) { $script:Sim.task = 'Ready'; [void](Tick 2) }   # 120 minutos con el servicio siempre caido
$total = @($script:Calls | Where-Object { $_ -eq 'start' }).Count
Check "en 2 h caido: inicios <= 6 (=$total)" ($total -le 6)
Check 'bitacora CRITICAL (disyuntor)' ((Get-Content "$tmp\fps-watchdog.log" -Raw) -match '\[CRITICAL\]')
$script:Sim.health = $true; $script:Sim.listeners = @(100); $script:Sim.procs = @{ 100 = $mine }
[void](Tick); Check 'al volver a estar sano se cierra el disyuntor' (-not (Read-State).circuitOpen)

Write-Host '9. Sin duplicados: servicio sano y propio jamas dispara start'
Reset @{ health = $true; listeners = @(100); procs = @{ 100 = $mine }; task = 'Running' }
for ($i = 0; $i -lt 50; $i++) { [void](Tick) }
Check '50 ticks sanos = 0 acciones' ($script:Calls.Count -eq 0)

Write-Host '10. Rotacion de bitacora'
Reset @{}
Add-Content "$tmp\fps-watchdog.log" ('x' * (1MB + 10)); Write-Log 'INFO' 'tras rotar'
Check 'se genero .1 y el log nuevo es pequeno' ((Test-Path "$tmp\fps-watchdog.log.1") -and ((Get-Item "$tmp\fps-watchdog.log").Length -lt 1000))

Remove-Item $tmp -Recurse -Force
Write-Host ''
Write-Host "RESULTADO: $script:pass PASS, $script:fail FAIL"
if ($script:fail -eq 0) { exit 0 } else { exit 1 }
