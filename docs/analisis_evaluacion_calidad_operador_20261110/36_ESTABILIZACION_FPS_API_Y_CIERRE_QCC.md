# Fase 36 — Estabilización de fps-api y cierre de integración QCC (11-11-2026)

Estado: **investigación y preparación completas; ningún cambio productivo ejecutado**. Sin detener procesos, sin tocar pm2, sin deshabilitar tareas, sin SQL, sin publicar QCC ni `latest.json`, sin commit/push. La auditoría fue de solo lectura (WinRM + Kerberos, comandos de una línea; no se leyó `.env` ni variables de entorno).

## 1. Diagnóstico (evidencia)

### 1.1 Qué corre hoy y quién

| Puerto | Proceso | Cuenta | Origen | Desde |
|---|---|---|---|---|
| 3002 (fps-api) | PID 12816 `node …\pm2\lib\ProcessContainerFork.js` | `Administrador` | **pm2** (padre = daemon PID 5392) | 11-11 10:19:26 |
| 3000 (calidad) | PID 6832 igual | `Administrador` | **pm2** | **09-11 14:56:49** |
| — | Daemon pm2 PID 5392 (`Daemon.js`) | `Administrador` | lanzado manualmente (su proceso padre ya no existe) | 06-11 14:44:12 |
| tareas `FpsApi` / `CalidadApi` | **ninguna instancia corriendo** (`Ready`) | SYSTEM, `HighestAvailable`, solo BootTrigger | Programador de tareas | — |

El resto del servidor no se ve afectado: 24 pools IIS `Started`, 8 `w3wp`, 89,8 GB libres, health `qualitycontrol`/`fps`/`calidad` = 200. Agente Zabbix presente (`zabbix_agentd`, 10050).

### 1.2 Historia reconstruida (pm2.log, Programador de tareas, eventos del sistema)

1. **Jun 2026:** pm2 fue el gestor original (daemon desde 08-06; `dump.pm2` guardado el 10-06 con `calidad-api` y `fps-api`, cwd `C:\API WEB\api\calidad` y `…\fps-api`, `fork_mode`, `autorestart=true`, `watch=false`). Después se migró a tareas programadas (`CalidadApi`, `FpsApi`) pero **pm2 nunca se desinstaló ni se vació el dump**.
2. **Último reinicio de Windows: 03-11 13:11.** El daemon pm2 **no sobrevivió** a ese reinicio (no existe servicio, tarea ni entrada de arranque para pm2): hasta el 06-11 solo corrían las tareas.
3. **06-11 14:44:** alguien (cuenta `Administrador`) volvió a levantar un daemon pm2 que **resucitó el `dump.pm2` con las dos apps**. Como las tareas ya ocupaban 3000 y 3002, cada app de pm2 **intentaba escuchar, fallaba y salía** → bucle de ~3 s: `calidad-api` 10.375+26.863+26.867+16.667 arranques y `fps-api` 10.377+26.862+26.868+26.732+26.792+11.551 ≈ **129.000** en 4,8 días (log de 45 MB).
4. **Por qué el bucle terminaba con código 0:** `fps-api` usa Express 5, donde `app.listen(port, cb)` entrega el error `EADDRINUSE` al callback; el código imprime "FPS API corriendo…" aunque falló y el proceso termina limpio (sin handles). Es un defecto de `server.js` que **enmascara fallos de arranque** (y hace que pm2 y el Programador vean "éxito").
5. **09-11 14:56:49:** terminó el proceso de la tarea `CalidadApi` (eventos 102/201 del Programador) y en el mismo segundo pm2 tomó el puerto 3000. Es el mismo mecanismo que ocurrió el 11-11 10:19 con `FpsApi` al reiniciarla: **cualquier reinicio de una API gestionada por tarea le regala el puerto a la instancia de pm2 en bucle**. `calidad` (la API de escritura de la app móvil) lleva **2 días sirviéndose desde pm2 sin que nadie lo decidiera**.
6. **`TypeError` del 11-11 10:19:13:** *explicado*. `produccion.routes.js` tiene hora de escritura **10:19:13.360** en el servidor, la hora exacta del error. `Copy-Item -Force` trunca el archivo antes de escribirlo; la instancia de pm2 que reiniciaba cada 3 s lo cargó vacío (`module.exports = {}`) y falló en `server.js:19` (`app.use('/api/produccion', apiKeyAuth, {})`). Fue una carrera creada por el bucle; inocuo, pero confirma que copiar sobre archivos recargados cada 3 s es frágil.

### 1.3 Configuración de las tareas

| | FpsApi | CalidadApi |
|---|---|---|
| Acción | `node.exe src\server.js` en `C:\API WEB\api\fps-api` | `node.exe server.js` en `C:\API WEB\api\calidad` |
| Cuenta | SYSTEM, `HighestAvailable` | SYSTEM, `HighestAvailable` |
| Disparador | **Solo BootTrigger** | **Solo BootTrigger** |
| Instancias múltiples | `IgnoreNew` | `IgnoreNew` |
| Reintento ante fallo | **3 veces / 1 min** | 999 veces / 1 min |
| Límite de ejecución | ilimitado (`PT0S`) | ilimitado |
| Registro (stdout/stderr) | **ninguno** (la tarea no redirige salida) | ninguno |
| Dependencias | ninguna | ninguna |

### 1.4 pm2

- Versión 7.0.1 instalado en el perfil de `Administrador` (`AppData\Roaming\npm`), Node 24.16.
- **No hay arranque automático**: ni servicio, ni tarea, ni clave `Run`, ni carpeta Startup (solo VMware Tools). Tras un reinicio de Windows, pm2 desaparece hasta que alguien lo invoque.
- `dump.pm2` contiene el **entorno completo de la sesión** que lo guardó (sin variables con nombre KEY/PASS/SECRET/TOKEN, pero es un archivo en el perfil de una cuenta personal con credenciales de entorno).
- Sin `restart_delay`, `max_restarts` ni `min_uptime` configurados: ante un fallo real reinicia sin límite y sin espera.

### 1.5 Riesgo tras reiniciar Windows

- **Hoy (pm2 sirve ambos puertos, tareas `Ready`):** al reiniciar, arrancan las dos tareas (BootTrigger) y pm2 **no** vuelve → queda la arquitectura "correcta" por accidente. Riesgo bajo, pero **inestable**: basta cualquier invocación de pm2 por `Administrador` para resucitar el dump y reiniciar el bucle (ocurrió el 06-11 y también el 07-07).
- **Mientras pm2 sirva los puertos:** cualquier despliegue que reinicie una tarea (procedimiento documentado de `FpsApi`/`CalidadApi`) **no tendrá efecto**: el puerto seguirá en pm2. Es decir, *el procedimiento de despliegue vigente está roto sin que nadie lo sepa* (los archivos nuevos se cargaron solo porque pm2 reinició cada 3 s).

## 2. Comparación de arquitecturas

| Criterio | A. Tarea programada (único gestor) | B. pm2 (único gestor) | C. Servicio Windows (NSSM/WinSW) |
|---|---|---|---|
| Arranque al boot | **Sí** (BootTrigger SYSTEM, ya probado en el reinicio del 03-11) | **No** hoy; requeriría `pm2-windows-startup`/servicio de terceros (pm2 no soporta startup nativo en Windows) | Sí |
| Cuenta de ejecución | SYSTEM (sin credencial personal) | **Cuenta personal `Administrador`**; si cambia su clave/perfil, cae | Configurable (cuenta de servicio) |
| Recuperación ante fallos | Reintento del Programador (3x o 999x/1 min); **solo ante código ≠ 0** | Reinicio inmediato, sin límite ni espera (genera bucles) | Política de recuperación nativa (SCM) |
| Logs / monitoreo | **Sin logs** hoy (mejorable) | Logs propios, pero crecen sin control (36 MB / 45 MB) | Logs del wrapper |
| Seguridad | Sin proceso residente extra; sin entorno volcado a disco | Daemon residente + `dump.pm2` con entorno completo en perfil personal | Depende del wrapper |
| Nuevos componentes | **Ninguno** (ya existe, ya documentado en runbooks) | Mantener pm2 + startup | **Instalar NSSM/WinSW** (software nuevo, sin firma/aprobación; Kaspersky/Seguridad TI) |
| Mantenimiento | Mecanismo ya usado por `CalidadApi`, `FpsApi`; despliegue = copiar + `Stop/Start-ScheduledTask` | Dos mecanismos coexistiendo (origen del incidente) | Mecanismo nuevo para un solo servidor |
| Riesgo de conflicto | Ninguno si pm2 queda vacío | Ninguno si las tareas se deshabilitan | Ninguno si se retiran los otros |

**Recomendación: A — Programador de tareas como único gestor**, y dejar pm2 **vacío y detenido** (no desinstalado). Evidencia: ya es el mecanismo vigente de 2 de las apps, es el único que **arrancó solo y correctamente tras el último reinicio** (03-11), corre como SYSTEM (sin depender de una cuenta personal), no añade software y se despliega con los procedimientos ya documentados. pm2 aporta logs pero su costo real fue un incidente de duplicidad, una cuenta personal como punto único de fallo y un volcado de entorno en disco. C es técnicamente válida pero exige instalar software nuevo para un problema que A resuelve sin él; se puede reevaluar si Seguridad TI aprueba un wrapper.

**Endurecimientos de A (separados, opcionales, cada uno con su aprobación):**
1. `FpsApi`: reintento 3x → 999x/1 min (igual a `CalidadApi`).
2. Corregir en `server.js` el manejo de `listen` (Express 5): `app.listen(port, err => { if (err) { console.error(err); process.exit(1); } console.log(…) })`, para que un fallo de arranque sea visible y active el reintento. Aplica a `fps-api` y, por el mismo patrón, conviene revisar `calidad`.
3. Registro: envolver la acción en `cmd /c node src\server.js >> logs\fps-api.log 2>&1` (o equivalente) con rotación; hoy no hay logs.
4. `server.js`/`auth.middleware.js` es **fail-open**: sin `API_KEY` en el entorno, `apiKeyAuth` deja pasar todo (`if (!expectedApiKey) return next()`). Considerar fail-closed.
5. Monitoreo con el Zabbix existente (puerto 3002/3000 + `/api/health`).

## 3. Procedimiento de transición (preparado, NO ejecutado)

Orden recomendado: **FPS primero** (solo afecta a QCC) y **calidad después, en ventana** (es la API de escritura de la app móvil). Todo con comandos de una línea ejecutados/supervisados por una persona; sin `ExecutionPolicy Bypass`, sin `c$`, sin exclusiones de antivirus.

**Pre-condiciones (solo lectura, repetir justo antes):** listeners 3000/3002 y dueños; `Get-ScheduledTask FpsApi,CalidadApi` = `Ready`; `calidad`/`fps` health 200; baseline de pools IIS (hoy 24 `Started`, 8 `w3wp`).

**T0. Respaldo de configuraciones (con hash):** carpeta `C:\API WEB\_backup_estabilizacion_<fecha>\` con: copia de `dump.pm2`, `dump.pm2.bak`, `module_conf.json`; `Export-ScheduledTask` de `FpsApi` y `CalidadApi` (XML); salida de `Get-NetTCPConnection`/`Get-CimInstance Win32_Process` de node; carpeta restringida a Administradores (el dump contiene entorno).

**T1. FPS:** como `Administrador` (o con `PM2_HOME` apuntando a su perfil, si los permisos lo permiten): `pm2 delete fps-api` → inmediatamente `Start-ScheduledTask -TaskName FpsApi`. Corte esperado: segundos (~20 s de 502 en QCC).
- Verificar: el listener de 3002 es un `node.exe` **de la tarea** (cuenta SYSTEM, sin padre pm2); `Get-ScheduledTask FpsApi` = `Running`; `health` 200; `sesiones-documentos` sin clave 401, con clave 200 (NP 22991, 7 sesiones) y `np=abc` 400; `laboratorio/registros` 200.

**T2. Calidad (ventana acordada):** `pm2 delete calidad-api` → `Start-ScheduledTask CalidadApi`; verificar listener 3000 de la tarea, `calidad/api/health` 200 y una lectura real de la app móvil (la persona que opera la app valida).

**T3. Dejar pm2 inerte:** `pm2 save` (dump vacío) y `pm2 kill` (apaga el daemon; el paquete queda instalado). Verificar: ya no existe `Daemon.js` ni `ProcessContainerFork`, y los puertos siguen en SYSTEM.

**T4. Endurecimientos opcionales** (aprobación aparte, cada uno con XML/archivo respaldado y reversión).

**Pruebas de arranque y recuperación (después de T1–T3):**
1. Recuperación ante caída: terminar **solo** el PID de `FpsApi` (`Stop-Process -Id <pid>`) → el Programador debe relanzarlo en ≤ ~70 s (código de salida ≠ 0); verificar nuevo PID, `health` 200. Hacer primero en FPS (bajo impacto).
2. Reinicio de Windows (ventana de mantenimiento, no urgente): tras el arranque, ambas tareas `Running`, listeners de 3000/3002 con dueño SYSTEM, **sin** proceso pm2, health 200.
3. Despliegue de prueba: copiar un archivo inocuo y reiniciar con `Stop/Start-ScheduledTask`; verificar que el PID/StartTime cambian (**esto prueba que el procedimiento de despliegue vuelve a funcionar**).

**Otras APIs no afectadas:** el procedimiento solo toca procesos `node` de los puertos 3000/3002 y el estado de pm2; comparar antes/después pools IIS (24 `Started`), cantidad de `w3wp`, health de `qualitycontrol`/`fps`/`calidad`/`mejora-continua`.

**Reversión:**
- Si tras `pm2 delete` la tarea no arranca (antes de T3): `pm2 resurrect` como `Administrador` (el dump aún contiene las apps) → vuelve el estado actual en segundos.
- Si ya se hizo `pm2 save`: restaurar `dump.pm2` desde `C:\API WEB\_backup_estabilizacion_<fecha>\` y `pm2 resurrect`.
- Para devolver también la tarea a su configuración previa: `Register-ScheduledTask -Xml` con el XML respaldado.
- Código de la Fase 35 (rollback separado): restaurar los 2 archivos de `_backup_20261111_sesiones-documentos` y reiniciar la instancia que escuche en 3002 (con A, `Stop/Start-ScheduledTask FpsApi`).

## 4. Cambios exactos que requieren tu autorización

| # | Cambio | Impacto | Reversible |
|---|---|---|---|
| 1 | T0 respaldos (copias/exportaciones, solo lectura sobre producción, escritura de archivos nuevos en una carpeta nueva) | ninguno | sí |
| 2 | T1: `pm2 delete fps-api` + `Start-ScheduledTask FpsApi` | ~20 s sin QCC | sí (`pm2 resurrect`) |
| 3 | T2: `pm2 delete calidad-api` + `Start-ScheduledTask CalidadApi` | segundos sin la API de la app móvil (en ventana) | sí |
| 4 | T3: `pm2 save` + `pm2 kill` | ninguno si 2 y 3 salieron bien | sí (restaurar dump) |
| 5 | Prueba de recuperación (terminar el PID de FpsApi) | segundos sin QCC | n/a |
| 6 | Opcional: reintento de `FpsApi` a 999x; corrección de `listen`; logs; fail-closed | según el caso | sí (XML/archivos respaldados) |
| 7 | Reinicio de Windows para la prueba de arranque | indisponibilidad total del servidor | n/a |

## 5. Resultados de QCC (Data real completa, 354 PNC, endpoint FPS vivo)

Conciliación con Data completa (no el resumen reutilizado) y el motor real. No se forzó ninguna atribución.

**Estados:** confirmada técnica 84 · ambigua 78 · discrepancia 182 · probable 5 · sin atribución 5 (suma 354). 35 personas involucradas, 28 con confirmadas, 651 puntos provisionales. Responsabilidad humana siempre "pendiente de Calidad".

**Operador declarado en Data vs. FPS:** sin FPS 212 · coincide 112 · sin dato 18 · externo 6 · no coincide 4 · no comparable 2. Entre las 84 confirmadas: coincide 80, no coincide 4 (sin palabras en común → revisar a mano). Las 80 coincidencias son respaldo independiente de la atribución técnica.

**Significado de la fecha de Data (272 PNC con documento y máquina resueltos):**
| Campo | Dentro de una sesión | Observación |
|---|---|---|
| Fecha de fabricación | 109 (±1 día: 116; ±7: 143) | la mejor alineada, pero rara vez es el día de sesión |
| Fecha de ingreso | 21 | la sesión más cercana suele ser anterior (236) |
| Fecha de salida | 23 | la sesión más cercana suele ser anterior (209) |
Orden en Data: ingreso < fabricación solo en 12/346; salida > fabricación en 281. Conclusión: la fecha de Data parece ser de **registro/gestión**, no del día de producción; las sesiones suelen ser anteriores. De las 158 PNC "fuera de fecha": 82 son XL-3/XL-2, 65 tienen **una sola persona** en esa máquina dentro del documento, 109 a 8–30 días. **Decisión de Calidad** (no tomada): si aceptan ventana de fecha amplia, ~65 PNC pasarían a confirmadas; hoy siguen como discrepancia.

**Normalización de máquinas:** exacta 209 · equivalente 63 · no es máquina 53 (sectores: Taller, Despacho, Comercial, Calidad, etc.) · no está en el documento 24 · sin dato 5. Propuestas (no aplicadas): (1) regla de prefijo "CD 102" → "CD 102-4" en FPS (8 PNC); (2) SM 74 (6), XL-2 (3), TI 36/4 y otros sin sesión en esa orden: revisar si son otra etapa; (3) 30 sesiones FPS con máquina sin nombre en `ZZZListaMaquina` (dato maestro de FPS); (4) el campo "máquina" de Data mezcla sectores: validar con lista cerrada en el formulario.

**Revisión del candidato con Data real (sesión ADMIN_TI/FARET, por DOM; no hay capturas posibles):** carga correcta, sin `undefined`/`NaN`/`[object`; listas 84/83/187 = esperado; 35 personas; filtros con opciones reales (4 años, 42 máquinas, 18 áreas, 35 personas); filtro turno B → 51 y año 2026 → 289 (81 confirmadas); detalle de persona con 10 sesiones y aviso de responsabilidad; evidencia desplegable; sin desborde horizontal. Pendiente: lectura visual humana.

**Checklist visual para una persona:** (1) KPIs legibles y alineados; (2) pestañas con conteos 84/83/187; (3) con sesión VER aparecen `OP-xxxxxx`, nunca nombres; (4) tablas sin recortes a 1280 px; (5) estados con colores distinguibles; (6) leyenda de "pendiente de Calidad" visible; (7) tiempo de carga razonable con 354 PNC.
