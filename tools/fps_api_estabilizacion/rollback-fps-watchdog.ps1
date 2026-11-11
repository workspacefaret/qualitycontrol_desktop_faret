# PREPARADO, NO EJECUTADO. Revierte la instalacion del supervisor. No toca FpsApi (sigue corriendo), PM2 ni otras apps.
$ErrorActionPreference = 'Stop'
if (Get-ScheduledTask -TaskName FpsApiWatchdog -ErrorAction SilentlyContinue) {
  Stop-ScheduledTask -TaskName FpsApiWatchdog -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName FpsApiWatchdog -Confirm:$false
}
Remove-Item 'C:\API WEB\scripts\fps-watchdog.ps1' -ErrorAction SilentlyContinue
# La carpeta de scripts y las bitacoras se conservan para auditoria (borrar a mano si se desea).
Get-ScheduledTask -TaskName FpsApiWatchdog -ErrorAction SilentlyContinue | Out-Null
"FpsApi: " + (Get-ScheduledTask FpsApi).State + " | listeners 3002: " + @(Get-NetTCPConnection -State Listen -LocalPort 3002 -ErrorAction SilentlyContinue).Count
