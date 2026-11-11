# Fase 38 — Recuperación automática de fps-api (11-11-2026)

Solo investigación, archivos y pruebas locales. **No se modificó nada en SRV-API** (solo lecturas). Archivos en `tools/fps_api_estabilizacion/`.

## 1. Auditoría inicial (solo lectura) — sin cambios desde la Fase 37
3002 → PID 7676 (tarea `FpsApi`, padre svchost/Schedule, `node src\server.js`); 3000 → PID 6832 (pm2 `calidad-api`); `FpsApi` Running (SYSTEM, BootTrigger, reinicio 3×/1 min, `IgnoreNew`); health de 3002 y 3000 = 200; endpoint nuevo 401/200/400 y laboratorio 200; código intacto (`D360E68A…`, `3F507130…`); daemon pm2 (PID 5392, 06-11) solo con `calidad-api` vivo; `dump.pm2` `44F1265C…` (mtime 10-06, **igual al respaldo de Fase 37**, 18 archivos íntegros); sin servicio/tarea/Run que autoarranque pm2 (solo `pm2.bat` manual). Windows Server 2016, PowerShell 5.1, Node 24, política `RemoteSigned`.

## 2. Causa raíz de la recuperación fallida
El registro del Programador de tareas (10:50–10:53) muestra, al terminar el proceso: evento **201 «completó correctamente»** y **102 «finalizó correctamente»**, sin eventos de fallo (202/203). Para el Programador, un proceso terminado desde fuera es una finalización normal: **`RestartOnFailure` solo actúa ante fallos de la acción**, así que nunca se activó (el `0xFFFFFFFF` es solo el código de salida). La tarea tampoco tiene disparador repetitivo (solo BootTrigger), de modo que nada la volvía a iniciar. A esto se suma un defecto de `server.js` (reproducido localmente con Express 5.2.1): ante `EADDRINUSE` el proceso imprime «corriendo» y **sale con código 0**, lo que explica el bucle de ~129 mil reinicios de pm2.

## 3. Arquitectura seleccionada
**Un único ejecutor + un supervisor mínimo.**
- Ejecutor: la tarea `FpsApi` (sin cambios).
- Supervisor: tarea `FpsApiWatchdog` (SYSTEM, cada minuto, `IgnoreNew`, límite 2 min) que corre `fps-watchdog.ps1`. **No ejecuta la API**: solo pide a `FpsApi` que inicie/reinicie, así no puede crear instancias paralelas (la política `IgnoreNew` de `FpsApi` lo impide además).
- Reglas: salud = HTTP 200 con cuerpo `service = "FPS API"` (identidad por contenido; si el puerto responde otra API cuenta como caído); 3 fallos consecutivos antes de actuar; no actúa si el puerto lo tiene un proceso **ajeno** (solo alerta; jamás lo mata); gracia de 120 s tras un inicio; enfriamiento de 5 min; **disyuntor** a 3 recuperaciones/hora (queda abierto hasta que el servicio vuelva a estar sano o se borre el estado; alerta CRITICAL); mutex global; bitácora `C:\API WEB\logs\fps-watchdog.log` (rotación 1 MB×3, niveles INFO/WARN/RECOVERY/ALERT/CRITICAL, heartbeat horario) y estado `fps-watchdog.state.json`.
- Alternativas descartadas: **A** (solo reintentos de la tarea): no cubre muertes externas ni cuelgues; **C** (solo arreglar `server.js`): no cubre kill/OOM/cuelgue. C se conserva como **mejora opcional** (`fps-api-server.listen-fix.patch`, 5 líneas, requiere desplegar `server.js`): la validación local demostró «sin parche exit=0 / con parche exit=1».

## 4. PM2 — persistencia
`dump.pm2` solo se lee en `pm2 resurrect`; el daemon actual ya no tiene `fps-api` en memoria. Se evita `pm2 save` (reescribiría `calidad-api` desde el entorno actual del daemon y podría cambiar sus variables). Se prepara `remove-pm2-app.js`: **cirugía de texto** que quita solo el objeto `fps-api`; el resto queda byte a byte idéntico (conserva claves duplicadas `username/USERNAME`), valida que el resultado sea JSON, que quede una app menos y que cada segmento restante sea idéntico; no modifica la entrada. Probado con dump sintético (2 apps, claves duplicadas, llaves/comillas en cadenas): resultado exacto = original sin `fps-api`; rechaza app inexistente (código 4) y archivo roto (sin escribir). No reinicia el daemon ni afecta `calidad-api`. En producción se aplicaría primero a una **copia** en la carpeta de respaldo, se verifica y solo entonces se copia sobre `dump.pm2`.

## 5. Pruebas locales (todas simuladas; ningún proceso productivo tocado)
- `test-fps-watchdog.ps1`: **23/23 PASS** — sano sin acciones; fallo aislado; proceso muerto → 1 inicio; gracia; colgado → stop+start; **proceso ajeno → nunca actúa**; enfriamiento; disyuntor (en 2 h caído: 3 inicios); cierre del disyuntor; 50 ciclos sanos = 0 acciones (sin duplicados); rotación de bitácora.
- `test-e2e-local.ps1`: **15/15 PASS** con procesos reales en el puerto 38002 — caída y recuperación sin intervención con 1 solo listener, bitácora de la recuperación, proceso colgado, cuerpo de otra API rechazado, puerto ocupado por proceso ajeno (sigue vivo, solo ALERT).
- Sintaxis PowerShell: 0 errores en los 5 scripts. Compatibilidad: PS 5.1 / Server 2016 (cmdlets estándar). Privilegios: SYSTEM (necesario para iniciar una tarea SYSTEM).
- **Limitación honesta:** la integración real con el Programador de tareas (`Start-/Stop-ScheduledTask`) no se probó localmente (no se creó ninguna tarea); se valida en el paso 4 de la instalación. Un error latente que apareció en las pruebas (una barra invertida perdida en la expresión de identidad `src\\server\.js`) se corrigió antes de cerrar.

## 6. Secuencia de intervención propuesta (requiere autorización)
1. Verificación inicial (el script la hace: hash del script, `FpsApi` Running, 1 listener, proceso `src\server.js`, health 200, tarea/archivo no preexistentes).
2. Respaldo: ya existe (Fase 37); añadir hash del `dump.pm2` actual.
3. `install-fps-watchdog.ps1 -HashEsperado FD2994CE7E73DD181467B843D2B2B0AE72B669F3F475159B43525DE1324CF12F` (revisado por una persona; sin `-ExecutionPolicy Bypass`).
4. A los 2–3 min: heartbeat en bitácora, 1 listener, health 200, `calidad-api` PID 6832 y health 200.
5. (Autorización separada) Quitar `fps-api` de `dump.pm2` con la herramienta, primero sobre copia y luego sobre el original, verificando hashes.
6. (Autorización separada, opcional) Prueba de recuperación terminando el PID de fps-api **en ventana acordada**: debe volver en ≈3–4 min.
- **Detener si:** hash distinto, ≠1 listener, 3002 de otro proceso, health ≠200, la tarea ya existe, o `calidad-api` cambia de PID/health.

## 7. Reversión
- Supervisor: `rollback-fps-watchdog.ps1` (desregistra la tarea y borra el script; `FpsApi` sigue corriendo).
- `dump.pm2`: copiar `C:\API WEB\_backup_estabilizacion_20261111\dump.pm2` (`44F1265C…E4524`) sobre el original y verificar el hash. No requiere tocar el daemon.
- `server.js` (si se aplicara el parche): restaurar `fps-api\src\server.js` desde el respaldo (`38454385…E756`) y `Stop/Start-ScheduledTask FpsApi`.

## 8. Riesgos residuales
Recuperación en ≈3–4 min (umbral de 3 fallos); el disyuntor abierto exige intervención humana; el supervisor corre como SYSTEM y su script puede ser blanco del antivirus (Kaspersky ya marcó antes PowerShell + Claude): instalarlo supervisado y con el script revisado; sin prueba real con el Programador hasta instalarlo; `calidad-api` sigue sin supervisor equivalente (la mantiene pm2); el reinicio de Windows sigue sin probarse.

## 9. Autorizaciones necesarias
(a) Instalar `FpsApiWatchdog` con `install-fps-watchdog.ps1` (crea 1 tarea y la carpeta `C:\API WEB\scripts`); (b) editar `dump.pm2` con `remove-pm2-app.js`; (c) opcional: prueba de caída controlada en ventana; (d) opcional, aparte: desplegar el parche de `server.js`.

## 10. Estado al finalizar
FPS: sano (3002 PID 7676, tarea `FpsApi`, 1 listener, endpoint nuevo OK; 354 PNC conciliadas sin cambios: 84/78/182/5/5). `calidad-api`: sana (PID 6832, pm2). QCC 1.8.30 candidato intacto (`8c47ff0e…7b86b`, no publicado). Sin commit/push ni cambios en producción.
