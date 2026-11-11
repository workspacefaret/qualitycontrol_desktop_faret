# Fase 39 — Instalación del watchdog FpsApiWatchdog en SRV-API (11-11-2026)

Autorizado: solo instalar `FpsApiWatchdog`. No se tocó `dump.pm2`, `pm2 save`, `server.js`, FPS (sin detener/reiniciar), `calidad-api`, Windows, SQL, Mejora Continua, QCC/`latest.json`. Sin commit/push.

## Verificaciones previas
- Hashes (repo = Fase 38 = staging en servidor): `fps-watchdog.ps1` `FD2994CE7E73DD181467B843D2B2B0AE72B669F3F475159B43525DE1324CF12F`; `install-fps-watchdog.ps1` `0B3F572A37C7E8BBB47870DF295830896240FA3C1BBB20CFBFAFA0BFCABC5D79`; `rollback-fps-watchdog.ps1` `F7348D80D92BC8E71D8B500E2F171C75EF8EDC32C6E981A7A2962B88516611E4`. Sin cambios respecto a la Fase 38 (archivos del repo sin modificar desde su creación).
- Contenido: sin `Bypass`, `Invoke-Expression`, `EncodedCommand`, descargas ni recursos administrativos (única coincidencia: un comentario). El script solo consulta salud/procesos y llama `Start-/Stop-ScheduledTask FpsApi`; nunca mata procesos ajenos.
- Estado previo: 1 listener en 3002 (PID 7676, `node src\server.js`, tarea `FpsApi` Running), health 3002 y 3000 = 200 (cuerpo "FPS API"), `calidad-api` PID 6832, `dump.pm2` `44F1265C…`, `server.js` `38454385…`, tarea y script del watchdog inexistentes, sesión de Administrador. Kaspersky Endpoint Security presente (AVP/KES 14.1): sin bloqueos ni alertas durante la instalación.
- Duplicados: el watchdog nunca ejecuta la API; solo pide iniciar a `FpsApi` (política `IgnoreNew`), y su propia tarea es `IgnoreNew` con mutex global.

## Instalación (11:07–11:09)
Staging en `C:\API WEB\_backup_estabilizacion_20261111\staging_watchdog\`; `install-fps-watchdog.ps1 -Origen … -HashEsperado FD2994CE…` (exit 0). Copia instalada `C:\API WEB\scripts\fps-watchdog.ps1`, hash = `FD2994CE…` (ACL solo SYSTEM + Administradores).

## Configuración de la tarea `FpsApiWatchdog`
Habilitada · SYSTEM (ServiceAccount) · acción `powershell.exe -NoProfile -NonInteractive -File "C:\API WEB\scripts\fps-watchdog.ps1"` · disparadores: arranque del sistema + repetición cada 1 min (sin fin) · `IgnoreNew` · límite 2 min · bitácora `C:\API WEB\logs\fps-watchdog.log`, estado `fps-watchdog.state.json`.

## Resultados
- Ejecuciones 11:09:09 y 11:10:10: resultado 0, sin ejecuciones perdidas, ningún proceso del watchdog queda activo entre ciclos.
- Bitácora: `[INFO] Heartbeat: fps-api sana.` (solo registra cambios/heartbeat horario); estado `fails=0`, sin recuperaciones, disyuntor cerrado.
- FPS: PID 7676 sin cambios, 1 listener, health 200, tarea `Running`. `calidad-api`: PID 6832, health 200. `dump.pm2`/`server.js` sin cambios.

## Reversión
`rollback-fps-watchdog.ps1` (copia en el staging del servidor): desregistra `FpsApiWatchdog` y borra el script; FPS sigue corriendo. Carpeta de scripts y bitácoras se conservan.

## Pendiente
1. **Prueba real de recuperación** (terminar el PID de fps-api en ventana acordada; se espera retorno en ≈3–4 min y entrada `[RECOVERY]` en bitácora): sigue sin hacerse; es lo que valida la integración con el Programador de tareas.
2. Quitar `fps-api` de `dump.pm2` con `remove-pm2-app.js` (autorización aparte).
3. Parche opcional de `server.js`; prueba de arranque con reinicio de Windows.
4. `calidad-api` sigue sin supervisor equivalente.

## Verificación final (11:13)
Endpoints con autenticación real: sesiones-documentos 200 (1 orden, 7 sesiones), sin clave 401, np inválido 400, laboratorio 200. Watchdog: 4+ ejecuciones con resultado 0, sin errores del Programador; FpsApi sin cambios (XML de igual tamaño, PID 7676, un listener). Kaspersky: la consulta de eventos del servidor no fue concluyente (error de proveedor de registro); no hubo bloqueos durante la instalación ni alertas reportadas. **Conclusión: INSTALADO Y VERIFICADO** (la recuperación automática NO se da por validada hasta una prueba controlada y autorizada).
