# Fase 37 — Intervención PM2 vs. tarea FpsApi en SRV-API (11-11-2026)

Alcance autorizado: retirar solo `fps-api` de PM2 y dejar `FpsApi` bajo la tarea programada. Sin Windows, SQL, Mejora Continua, QCC/latest.json, commit/push.

## Conclusión
**FPS NO queda ESTABLE.** El conflicto de puertos se eliminó (un único proceso en 3002, de la tarea `FpsApi`, SYSTEM) y el endpoint funciona, pero la **recuperación automática falló**: al terminar el proceso a propósito, la tarea no lo relanzó en 120 s (estado `Ready`, `LastTaskResult 0xFFFFFFFF`). Tuve que volver a lanzarla a mano (nuevo PID 7676; ~2 min sin servicio durante la prueba). Si el proceso muere solo, FPS queda caído hasta intervención humana (antes, pm2 lo enmascaraba).

## Estado anterior
3002 → PID 12816 (pm2 `fps-api`, id 1, 129.181 reinicios, estable desde 10:19); 3000 → PID 6832 (pm2 `calidad-api`); tareas `FpsApi`/`CalidadApi` `Ready`; tarea: SYSTEM, BootTrigger, `node.exe src\server.js` en `C:\API WEB\api\fps-api`, reinicio 3×/1 min, `IgnoreNew`.

## Respaldos (`C:\API WEB\_backup_estabilizacion_20261111`, ACL solo SYSTEM + Administradores, 18 archivos)
`dump.pm2` 44F1265C…E4524 · `dump.pm2.bak` BA3ED56C…CA942 · `module_conf.json` · `pm2.log` · `FpsApi.xml` 5975A6C9…5E89 · `CalidadApi.xml` DF56E23D…2624D · `fps-api\src\**` + `package*.json` (sin `.env`, que no se toca). Hashes de dump originales = copia. Código fps-api sin cambios: routes `D360E68A…7B53`, service `3F507130…8CA9` (antes y después).

## Ejecución
`pm2 delete fps-api` (10:50:31; solo id 1, `calidad-api` siguió online) → 0 listeners → `Start-ScheduledTask FpsApi` → 3002 → PID 11888, padre svchost (tarea). **No se hizo `pm2 save`**: `dump.pm2` sigue con ambas apps.

## Verificación
- 3002: un único listener. Sin clave 401; con clave: `sesiones-documentos?np=22991` 200 (1 orden, 7 sesiones); `np=abc` 400; `laboratorio/registros` 200; `/api/health` 200.
- `calidad-api`: PID 6832 intacto, pm2 online, `/api/health` 200.
- Recuperación: FALLÓ (arriba). Servicio restaurado manualmente y revalidado (mismas pruebas OK).

## Rollback
Detener la tarea (`Stop-ScheduledTask FpsApi`; matar el PID de 3002 si queda) y, como Administrador con `PM2_HOME=C:\Users\administrador.AD\.pm2`, `pm2 start "C:\API WEB\api\fps-api\src\server.js" --name fps-api`. Dump/XML en la carpeta de respaldo.

## Pendiente (requiere autorización nueva)
1. Endurecer recuperación de `FpsApi` (la política de reinicio de la tarea no actuó con 0xFFFFFFFF): p. ej. watchdog/segunda tarea periódica que la inicie si 3002 no escucha, o reintentos 999 y corregir `listen` en `server.js` para salir con código ≠ 0 en error.
2. `pm2 save` (o `delete calidad-api` + tarea) para que PM2 no resucite `fps-api` desde el dump; tratar `calidad-api` (aún bajo PM2).
3. Prueba de arranque con reinicio de Windows (en ventana).
4. QCC 1.8.30: revisión visual humana, decisión de Calidad sobre fecha/ventana, autorización de publicación (`latest.json`).
