<#
 Supervisor de fps-api (Fase 38). NO ejecuta la API: solo pide a la tarea programada FpsApi (unico responsable de
 ejecucion) que la inicie/reinicie. Pensado para correr cada minuto como tarea SYSTEM "FpsApiWatchdog".
 Reglas: identidad (cuerpo de /api/health = "FPS API" + proceso con src\server.js), umbral de fallos consecutivos,
 enfriamiento entre recuperaciones, disyuntor (max N recuperaciones/hora), nunca mata procesos ajenos, bitacora.
#>
param(
  [string]$HealthUrl   = 'http://127.0.0.1:3002/api/health',
  [int]   $Port        = 3002,
  [string]$TaskName    = 'FpsApi',
  [string]$ProcMatch   = 'src\\server\.js',
  [string]$LogDir      = 'C:\API WEB\logs',
  [int]   $FailThreshold    = 3,    # fallos consecutivos antes de actuar (~3 min con ejecucion cada minuto)
  [int]   $CooldownSec      = 300,  # minimo entre dos recuperaciones
  [int]   $MaxRecoveriesHour = 3,   # disyuntor
  [int]   $StartGraceSec    = 120,  # tiempo que se espera a que una instancia recien iniciada empiece a escuchar
  [int]   $HeartbeatMin     = 60
)
$ErrorActionPreference = 'Stop'

function Write-Log([string]$level, [string]$msg) {
  $f = Join-Path $script:LogDir 'fps-watchdog.log'
  try {
    if (-not (Test-Path $script:LogDir)) { New-Item -ItemType Directory -Path $script:LogDir -Force | Out-Null }
    if ((Test-Path $f) -and (Get-Item $f).Length -gt 1MB) {
      foreach ($i in 2,1) { $s = "$f.$i"; if (Test-Path $s) { Move-Item $s "$f.$($i+1)" -Force } }
      Move-Item $f "$f.1" -Force
      Remove-Item "$f.4" -ErrorAction SilentlyContinue
    }
    Add-Content -Path $f -Value ("{0} [{1}] {2}" -f (Get-Date).ToString('yyyy-MM-dd HH:mm:ss'), $level, $msg)
  } catch { }
}

# --- Acciones con efecto (aisladas para poder simularlas en pruebas) ---
function Get-Listeners { Get-NetTCPConnection -State Listen -LocalPort $script:Port -ErrorAction SilentlyContinue | ForEach-Object { $_.OwningProcess } | Select-Object -Unique }
function Get-ProcInfo([int]$procId) { Get-CimInstance Win32_Process -Filter "ProcessId=$procId" -ErrorAction SilentlyContinue }
function Test-Health {
  try {
    $r = Invoke-WebRequest -Uri $script:HealthUrl -UseBasicParsing -TimeoutSec 8
    if ($r.StatusCode -ne 200) { return $false }
    return (($r.Content | ConvertFrom-Json).service -eq 'FPS API')
  } catch { return $false }
}
function Get-TaskStateName { [string](Get-ScheduledTask -TaskName $script:TaskName -ErrorAction Stop).State }
function Get-TaskLastStart { (Get-ScheduledTaskInfo -TaskName $script:TaskName).LastRunTime }
function Invoke-TaskStart { Start-ScheduledTask -TaskName $script:TaskName }
function Invoke-TaskStop  { Stop-ScheduledTask  -TaskName $script:TaskName }
function Get-Now { Get-Date }

function Read-State {
  $p = Join-Path $script:LogDir 'fps-watchdog.state.json'
  $s = [pscustomobject]@{ fails = 0; recoveries = @(); circuitOpen = $false; lastHeartbeat = $null; lastAlert = $null }
  if (Test-Path $p) { try { $j = Get-Content $p -Raw | ConvertFrom-Json; $s.fails = [int]$j.fails; $s.recoveries = @($j.recoveries); $s.circuitOpen = [bool]$j.circuitOpen; $s.lastHeartbeat = $j.lastHeartbeat; $s.lastAlert = $j.lastAlert } catch { } }
  $s
}
function Save-State($s) { try { $s | ConvertTo-Json -Depth 4 | Set-Content -Path (Join-Path $script:LogDir 'fps-watchdog.state.json') -Encoding UTF8 } catch { } }

function Invoke-Watchdog {
  $now = Get-Now
  $st = Read-State
  $st.recoveries = @($st.recoveries | Where-Object { $_ -and ([datetime]$_) -gt $now.AddHours(-1) })

  if (Test-Health) {
    if ($st.fails -gt 0 -or $st.circuitOpen) { Write-Log 'INFO' "Servicio sano de nuevo (fallos previos=$($st.fails), disyuntor=$($st.circuitOpen))." }
    $st.fails = 0; $st.circuitOpen = $false
    if (-not $st.lastHeartbeat -or ([datetime]$st.lastHeartbeat) -lt $now.AddMinutes(-$script:HeartbeatMin)) { Write-Log 'INFO' 'Heartbeat: fps-api sana.'; $st.lastHeartbeat = $now.ToString('o') }
    Save-State $st; return 'OK'
  }

  $st.fails++
  if ($st.fails -lt $script:FailThreshold) { Write-Log 'WARN' "Health fallido ($($st.fails)/$($script:FailThreshold))."; Save-State $st; return 'ESPERA' }

  $listeners = @(Get-Listeners)
  $task = Get-TaskStateName
  # Proceso ajeno en el puerto: no se toca nunca
  foreach ($lp in $listeners) {
    $pi = Get-ProcInfo $lp
    if (-not $pi -or $pi.CommandLine -notmatch $script:ProcMatch) {
      if (-not $st.lastAlert -or ([datetime]$st.lastAlert) -lt $now.AddMinutes(-15)) { Write-Log 'ALERT' "Puerto $($script:Port) ocupado por proceso AJENO (PID $lp, '$($pi.CommandLine)'). No se actua; requiere revision humana."; $st.lastAlert = $now.ToString('o') }
      Save-State $st; return 'AJENO'
    }
  }
  if ($st.circuitOpen -or $st.recoveries.Count -ge $script:MaxRecoveriesHour) {
    if (-not $st.circuitOpen) { Write-Log 'CRITICAL' "Disyuntor abierto: $($st.recoveries.Count) recuperaciones en la ultima hora. No se actuara hasta que el servicio vuelva a estar sano o se borre el estado."; }
    elseif (-not $st.lastAlert -or ([datetime]$st.lastAlert) -lt $now.AddMinutes(-15)) { Write-Log 'CRITICAL' 'Disyuntor abierto: servicio sigue caido; intervencion humana requerida.'; $st.lastAlert = $now.ToString('o') }
    $st.circuitOpen = $true; Save-State $st; return 'DISYUNTOR'
  }
  if ($st.recoveries.Count -gt 0 -and ([datetime]($st.recoveries | Sort-Object | Select-Object -Last 1)) -gt $now.AddSeconds(-$script:CooldownSec)) { Save-State $st; return 'ENFRIAMIENTO' }

  if ($task -eq 'Running') {
    $ls = Get-TaskLastStart
    if ($listeners.Count -eq 0 -and $ls -and ($now - $ls).TotalSeconds -lt $script:StartGraceSec) { Write-Log 'INFO' 'Instancia iniciada hace poco; se espera a que escuche.'; Save-State $st; return 'GRACIA' }
    Write-Log 'RECOVERY' "Instancia de '$($script:TaskName)' en ejecucion pero sin servicio sano (escuchando: $($listeners.Count -gt 0)). Deteniendo e iniciando la tarea."
    Invoke-TaskStop
  } else {
    Write-Log 'RECOVERY' "Tarea '$($script:TaskName)' en estado '$task' y servicio caido. Iniciando la tarea."
  }
  Invoke-TaskStart
  $st.recoveries = @($st.recoveries) + $now.ToString('o')
  $st.fails = 0
  Save-State $st; return 'RECUPERADO'
}

if ($MyInvocation.InvocationName -ne '.') {
  $mutex = New-Object System.Threading.Mutex($false, 'Global\FpsApiWatchdog')
  if (-not $mutex.WaitOne(0)) { Write-Log 'INFO' 'Otra ejecucion del supervisor en curso; se omite.'; exit 0 }
  try { $r = Invoke-Watchdog; if ($r -ne 'OK' -and $r -ne 'ESPERA') { Write-Log 'INFO' "Resultado: $r" } }
  catch { Write-Log 'ERROR' $_.Exception.Message; exit 1 }
  finally { $mutex.ReleaseMutex() | Out-Null }
}
