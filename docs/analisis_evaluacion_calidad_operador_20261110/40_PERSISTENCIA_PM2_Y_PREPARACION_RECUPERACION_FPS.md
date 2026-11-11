# Fase 40 — Persistencia PM2 y preparación de la prueba de recuperación de FPS (11-11-2026)

Autorizado: solo corregir la referencia obsoleta de `fps-api` en `dump.pm2`. Sin detener/reiniciar servicios, sin tocar `calidad-api`, Windows, SQL, Mejora Continua, QCC/`latest.json`, commit/push.

## 1. Preflight (solo lectura, 11:15)
FPS: 1 listener en 3002 (PID 7676, tarea `FpsApi`), health 200. `calidad-api`: PID 6832, health 200. Watchdog: ejecuciones cada minuto, resultado 0, 0 perdidas, bitácora solo con heartbeat. Daemon pm2 PID 5392 (06-11) + proceso `calidad-api` PID 6832. `dump.pm2` = respaldo Fase 37 (`44F1265C…E4524`), 17.326 bytes, sin BOM, ACL SYSTEM/Administradores/AD\Administrador. **Mecanismos de restauración de pm2:** ninguno — `module_conf.json` vacío (`{}`), sin tarea programada, servicio, clave Run ni carpeta Startup que invoque pm2; `pm2.bat`/`reiniciar-calidad.bat` no usan `resurrect`/`startup`/`fps`. El dump solo se lee si alguien ejecuta `pm2 resurrect` a mano.

## 2. Corrección de `dump.pm2`
| Paso | Resultado |
|---|---|
| Respaldo nuevo | `C:\API WEB\_backup_estabilizacion_20261111\dump.pm2.f40_pre`, SHA-256 = original `44F1265C9D1E6576E7AA0C215AF47A84AC963B5847E9151930DA9E6B8B1E4524` ✔ |
| Herramienta (`remove-pm2-app.js`, `25505D82…55B5`, copia en staging) sobre copia | exit 0; `calidad-api,fps-api` → `calidad-api`; 17.326 → 9.069 bytes; segmentos restantes idénticos byte a byte; resultado `451A88A4F37FB98468E383B068FF77E583FADF7CF821F26C1D85D0FE02840966` |
| Comparación | `calidad-api` idéntica (JSON); 0 referencias a `fps-api`; primer/último carácter iguales |
| Aplicación | guardas (hash de la copia y del original) OK → copiado sobre el original |
| Verificación | hash = `451A88A4…0966`; ACL idéntica y propietario sin cambio; JSON válido, solo `calidad-api`; `fps-api` ausente |
| Impacto | daemon 5392 y `calidad-api` 6832 con los mismos PID/hora de inicio (sin reinicios); FPS PID 7676 sin cambios; health 3002/3000 = 200; `sesiones-documentos` 200 con clave / 401 sin clave / 400 NP inválido; laboratorio 200; `server.js` y watchdog sin cambios (`38454385…`, `FD2994CE…`) |

**Residual:** `dump.pm2.bak` (mismo directorio de pm2, `BA3ED56C…CA942`) **todavía contiene `fps-api`**. pm2 lo usa solo si `dump.pm2` falta o está dañado durante un `resurrect`. No estaba autorizado y no se tocó; conviene decidir si se corrige igual (mismo procedimiento) o se deja como respaldo histórico.

## 3. Rollback de la persistencia
Copiar `…\_backup_estabilizacion_20261111\dump.pm2.f40_pre` (o `dump.pm2`, mismo hash `44F1265C…`) sobre `C:\Users\administrador.AD\.pm2\dump.pm2` y verificar el hash. No requiere tocar el daemon ni reiniciar nada.

## 4. Watchdog
Tarea Ready/habilitada, ejecuciones con resultado 0, sin recuperaciones, disyuntor cerrado, sin errores del Programador. Sin prueba de caída todavía.

## 5. Procedimiento de la prueba controlada de recuperación (NO ejecutado)
**Objetivo:** demostrar que, al terminar el proceso de fps-api, el watchdog lo reinicia solo.
- **Ventana:** fuera de horario de uso de QCC FARET (Evaluación de operadores/Trazabilidad/Laboratorio usan FPS); avisar a los usuarios. Duración máxima de indisponibilidad aceptada: **10 min**; esperada ≈3–5 min (3 fallos consecutivos a 1 min + ciclo + arranque ≈6 s).
- **Participantes:** quien autoriza + quien opera (Administrador) en SRV-API.
- **Pre-condiciones (todas):** FPS sano con 1 listener propio; watchdog con último resultado 0; `calidad-api` sana; `dump.pm2` ya corregido; disyuntor cerrado y `recoveries` vacío; nadie usando FPS.
- **Ejecución (T0):** anotar PID de 3002 y hora; `Stop-Process -Id <PID> -Force` (solo ese PID).
- **Monitoreo cada 30 s:** `Get-NetTCPConnection -State Listen -LocalPort 3002`, health, `Get-Content 'C:\API WEB\logs\fps-watchdog.log' -Tail 10`, estado de `FpsApi` y `calidad-api`.
- **Criterios de éxito:** en ≤10 min aparece un nuevo PID en 3002 bajo `FpsApi`; exactamente 1 listener; health 200 y `sesiones-documentos`/laboratorio 200; bitácora con `[WARN] Health fallido (1/3)…(2/3)` y **un solo** `[RECOVERY]` seguido de `Resultado: RECUPERADO`; sin duplicados; `calidad-api` intacta; luego `[INFO] Servicio sano de nuevo`; `state.json` con 1 recuperación y disyuntor cerrado.
- **Recuperación manual de contingencia (si no hay retorno en 10 min o antes):** `Start-ScheduledTask FpsApi`, verificar PID/health. Si 3002 lo ocupa un proceso ajeno: no matarlo, escalar.
- **Detener la prueba si:** algún listener inesperado en 3002; `calidad-api` cambia de PID o health ≠200; aparece `[ALERT]`/`[CRITICAL]`; más de un `[RECOVERY]`; alerta de Kaspersky; pasan 10 min sin recuperación.
- **Después:** documentar tiempos reales (T0, 1.er fallo, `[RECOVERY]`, 1.er health 200), y reiniciar el estado del watchdog solo si quedara abierto el disyuntor (no debería).
- **Opcional posterior (autorizaciones aparte):** prueba de arranque con reinicio de Windows; parche de `server.js`; supervisor para `calidad-api`.

## 6. Continuidad QCC
Endpoint `sesiones-documentos` operativo. Candidato 1.8.30 intacto (`C:\Installers\QualityControlCenter_Setup_v1.8.30.exe`, SHA-256 `8c47ff0e…7b86b`), sin publicar; `latest.json` sin tocar. Pendientes de QCC: revisión visual humana, decisión de Calidad sobre fechas/normalización y autorización de publicación.

## 7. Estado final
FPS sano (PID 7676, tarea `FpsApi`, watchdog activo) · `calidad-api` sana (PID 6832) · `dump.pm2` sin `fps-api` (hash `451A88A4…0966`) · pm2 sin reinicios · riesgo de duplicidad por pm2 eliminado salvo `dump.pm2.bak` (residual documentado).
