# PREPARADO, NO EJECUTADO. Debe correrlo una persona autorizada en SRV-API, como Administrador, tras revisar este archivo.
# Instala el supervisor: copia el script y registra la tarea FpsApiWatchdog (SYSTEM, cada minuto, sin instancias paralelas).
# No toca FpsApi, PM2, SQL ni otras aplicaciones. Detiene todo (sin cambios) ante cualquier condicion previa no cumplida.
param(
  [string]$Origen = '.\fps-watchdog.ps1',
  [string]$HashEsperado = ''          # SHA-256 del fps-watchdog.ps1 revisado; obligatorio
)
$ErrorActionPreference = 'Stop'
$dest = 'C:\API WEB\scripts'; $logs = 'C:\API WEB\logs'; $name = 'FpsApiWatchdog'
function Stop-Intervencion($m) { Write-Host "DETENIDO: $m" -ForegroundColor Red; exit 1 }

# 1. Verificacion inicial (solo lectura)
if (-not $HashEsperado) { Stop-Intervencion 'Falta -HashEsperado (hash del script revisado).' }
if ((Get-FileHash $Origen -Algorithm SHA256).Hash -ne $HashEsperado.ToUpper()) { Stop-Intervencion 'El hash del script no coincide con el revisado.' }
$t = Get-ScheduledTask -TaskName FpsApi -ErrorAction SilentlyContinue
if (-not $t -or [string]$t.State -ne 'Running') { Stop-Intervencion 'La tarea FpsApi no esta Running.' }
$l = @(Get-NetTCPConnection -State Listen -LocalPort 3002 -ErrorAction SilentlyContinue)
if ($l.Count -ne 1) { Stop-Intervencion "Se esperaba 1 listener en 3002, hay $($l.Count)." }
$p = Get-CimInstance Win32_Process -Filter "ProcessId=$($l[0].OwningProcess)"
if ($p.CommandLine -notmatch 'src\\server\.js') { Stop-Intervencion "El 3002 lo atiende otro proceso: $($p.CommandLine)" }
if ((Invoke-WebRequest http://127.0.0.1:3002/api/health -UseBasicParsing -TimeoutSec 8).StatusCode -ne 200) { Stop-Intervencion 'fps-api no esta sana.' }
if (Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue) { Stop-Intervencion "La tarea $name ya existe." }
if (Test-Path "$dest\fps-watchdog.ps1") { Stop-Intervencion 'Ya existe C:\API WEB\scripts\fps-watchdog.ps1.' }

# 2. Instalar archivo con permisos restringidos (SYSTEM y Administradores)
New-Item -ItemType Directory -Path $dest -Force | Out-Null
icacls $dest /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' | Out-Null
Copy-Item $Origen "$dest\fps-watchdog.ps1"
if ((Get-FileHash "$dest\fps-watchdog.ps1").Hash -ne $HashEsperado.ToUpper()) { Stop-Intervencion 'La copia no coincide (revertir con rollback-fps-watchdog.ps1).' }
New-Item -ItemType Directory -Path $logs -Force | Out-Null

# 3. Registrar la tarea (cada minuto, sin paralelismo, limite 2 min, sin ExecutionPolicy Bypass)
$act = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -NonInteractive -File `"$dest\fps-watchdog.ps1`""
$trg = @((New-ScheduledTaskTrigger -AtStartup), (New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1)))
$set = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 2) -StartWhenAvailable -AllowStartIfOnBatteries
$pri = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount
Register-ScheduledTask -TaskName $name -Action $act -Trigger $trg -Settings $set -Principal $pri -Description 'Supervisor de fps-api (Fase 38). Solo inicia la tarea FpsApi si el servicio no esta sano.' | Out-Null
Write-Host "Instalado. Verificar en 2-3 min: Get-Content '$logs\fps-watchdog.log' -Tail 5 (debe mostrar el heartbeat)."
