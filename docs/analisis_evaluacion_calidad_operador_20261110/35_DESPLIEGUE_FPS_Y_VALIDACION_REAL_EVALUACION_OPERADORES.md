# Fase 35 — Despliegue del endpoint de FPS y validación real (11-11-2026)

Autorizado exclusivamente: desplegar el endpoint de solo lectura de fps-api y reiniciar solo la tarea `FpsApi`. No se tocó SQL, Mejora Continua, `latest.json` ni se publicó QCC. Sin commit/push.

## 1. Conclusión

- Endpoint **desplegado y funcionando** con autenticación real. Con él, la conciliación de las 354 PNC pasa de **35 a 84 confirmadas técnicamente** y de 20 a **35 personas de FPS** (5.900 sesiones, 16 categorías de proceso, incluido Offset).
- **Hallazgo operativo que requiere tu decisión:** al reiniciar la tarea, el puerto 3002 pasó a ser servido por una instancia de **pm2** (otra cuenta) en vez del proceso de la tarea `FpsApi` (ver §3). El servicio funciona y sirve el código nuevo, pero el hosting cambió respecto a lo documentado.
- El módulo **no se declara terminado**: falta (a) tu decisión sobre pm2/tarea, (b) revisión visual, (c) comparar operador declarado vs FPS con Data completa (el resumen reutilizado no traía ese campo), (d) decisiones de Calidad sobre la fecha de Data.

## 2. Despliegue (preflight → respaldo → copia → reinicio)

| Paso | Resultado |
|---|---|
| Estado previo | Tarea `FpsApi` Running (SYSTEM), PID 4248 en 3002 desde 03-11; `node_modules`, `src` y 6 carpetas `_backup_*` previas |
| Hashes del servidor = originales de la Fase 34 | `produccion.routes.js` `ACCB85A3…8DCA`, `produccion.service.js` `D3EEABCD…B7AA` ✔ |
| Contenido del paquete | Solo lo revisado: routes +37/−1 líneas, service +69/−1 (la línea "eliminada" es una coma final). Paquete = repo (cmp) |
| Respaldo (en el servidor) | `C:\API WEB\api\fps-api\_backup_20261111_sesiones-documentos\src\{routes,services}\…`, hashes verificados = originales |
| Copia (`Copy-Item -ToSession`) | Solo los 2 archivos; hashes destino = paquete: routes `D360E68A…7B53`, service `3F507130…8CA9` ✔ |
| Reinicio | `Stop-ScheduledTask` + `Start-ScheduledTask` de `FpsApi` únicamente |

## 3. Hallazgo: pm2 en bucle de reinicio (previo a esta fase) y cambio de quien sirve 3002

- En el servidor hay un daemon **pm2** de la cuenta `Administrador` (activo desde el 06-11) con apps `fps-api` y `calidad-api`. Su `pm2.log` muestra la app **`fps-api:1` reiniciándose cada ~3 s**: **129.233 arranques desde junio (~1.119 por hora)**. Mientras el proceso de la tarea `FpsApi` ocupaba el puerto 3002, esa instancia no podía quedarse; el bucle estaba **enmascarado**.
- Al detener la tarea (10:19), el puerto se liberó y **una instancia de pm2 (PID 12816, 10:19:26) tomó el 3002**; el bucle terminó ahí. La tarea quedó `Ready` (su proceso ya no corre). Un único error de arranque (`TypeError: argument handler must be a function`, `server.js:19`) apareció a las 10:19:13 dentro del bucle; no se reprodujo y el endpoint responde con normalidad: **no está explicado**.
- Estado verificado a las ~10:35: puerto 3002 → PID 12816 (pm2), `health` 200, `sesiones-documentos` sin clave 401 y con clave 200; el bucle no continúa.
- **Efectos / riesgos:** (1) el servicio depende ahora de pm2 (cuenta personal `Administrador`) y no del `SYSTEM`/BootTrigger; (2) en un reinicio del servidor la tarea (boot) y pm2 competirán por el puerto y quien pierda entrará en bucle; (3) **el rollback de la Fase 34 ya no basta**: detener la tarea no libera el puerto.
- **No se tocó pm2** (fuera de la autorización). Opciones para ti: **(a)** restaurar la arquitectura de la tarea: como `Administrador`, `pm2 delete fps-api` (y `pm2 save`), luego `Start-ScheduledTask FpsApi`; **(b)** mantener pm2 como gestor oficial: deshabilitar la tarea `FpsApi`, documentar y `pm2 save`. En ambos casos conviene revisar `calidad-api` (mismo patrón).
- **Rollback actualizado** (solo con tu autorización): copiar los 2 archivos del respaldo sobre `C:\API WEB\api\fps-api\src\…` y **terminar solo el PID que escucha en 3002** (pm2 lo respawnea con el código restaurado); verificar hashes originales y que `sesiones-documentos` responda 404.

## 4. Verificación del endpoint (autenticación real, código real de la app)

| Prueba | Resultado |
|---|---|
| `GET …/sesiones-documentos?np=22991` sin `x-api-key` | **401** |
| …con clave, NP 22991 | **200**: 1 orden, 7 sesiones (laboratorio daba 4: el nuevo trae más categorías) |
| …`np=abc` / sin `np` | **400** con mensaje claro (sin consultar la BD) |
| `laboratorio/registros?np=22991` (regresión) | 200, 2 procesos, 4 registros |
| `health` | 200 |
| Lote real de 229 NP (5 llamadas de ≤50) vía `FpsSesionesApiService` | OK: 229 órdenes, 5.900 sesiones, sin errores |

## 5. Conciliación real de las 354 PNC (endpoint nuevo)

Las PNC (id, NP/NV, nivel, máquina, área, fecha) salieron del resumen real generado en la Fase 34 desde Data; el motor y el servicio son los reales. Ese resumen no traía el operador escrito en Data, así que **la comparación declarado-vs-FPS no se repitió** (pendiente).

**Cobertura de FPS (sesiones por categoría):** Pegado 2.348 · Troquel 1.138 · **Offset 905** · Desgaje 396 · Dimensionado 389 · Terminaciones 141 · Folia 126 · Emplacado 101 · Folletos 96 · Revisión digital 95 · Serigrafía 61 · Laminado 42 · Corrugado 24 · CTP 20 · Micas 15 · Termoformado 3. Antes (laboratorio): 5 categorías / 3.614 sesiones. 30 sesiones tienen máquina sin nombre en `ZZZListaMaquina`.

| Etapa | PNC |
|---|---|
| Total Data | 354 |
| NP/NV numérica y documento en FPS | 349 (323 NP Faret · 26 NV Innpack); 5 no numéricas |
| Máquina | exacta 209 · equivalente 63 · valor que no es máquina 53 · sin dato 5 · **no está en el documento 24** |
| Fecha | dentro 111 · **fuera 158** · sin fecha 85 |

| Estado | Antes (parcial) | **Ahora** |
|---|---|---|
| Confirmada técnicamente | 35 | **84** (todas con 1 persona; 28 personas distintas) |
| Probable | 2 | 5 |
| Ambigua | 50 | 78 (51 sin máquina identificable + 27 con 2–3 personas; 22 cruzan turnos, 0 simultáneas) |
| Discrepancia | 247 | **182** (158 fecha + 24 máquina) |
| Sin atribución | 20 | 5 |

651 puntos provisionales; 35 personas involucradas. Checks: suma de estados = 354 ✔; con VER no aparece ningún nombre FPS ✔; puntos solo en confirmadas de una persona ✔.

## 6. Discrepancias investigadas

- **Máquina de Data que no está en el documento (24):** CD 102 (8), SM 74 (6), XL-2 (3), 106-2/106-4, TERMOFORMADORA, COA, DIANA 5, DIANA PRO 3, TI 36/4. Equipos sin sesión en esa orden (otra etapa, otro documento o equipo que FPS no registra); candidatos a revisión de Calidad.
- **Fecha (158):** la sesión más cercana de la máquina ocurre **después** de la fecha de Data en 113 casos y antes en 45; a 8–30 días en 109, >30 en 18, 2–7 en 24, ±1 en 7. **82 de las 158 son prensas offset XL-3/XL-2**, luego 106-2 (14), EXPERFOLD (13), PRO-2 (8). En 65 de estas PNC la máquina tiene **una sola persona** en todo el documento (16 a ≤7 días, 44 a 8–30, 5 a >30): se podrían atribuir sin depender de la fecha **si Calidad acepta que la fecha de Data no es el día de producción**. Hoy no se fuerza: se muestran como discrepancia.
- **Sin máquina identificable (51 ambiguas):** valores de Data que son sectores (Despacho, Comercial, Taller, Desarrollo…). Se evalúan por proceso y quedan ambiguas sin atribuir.
- **Cobertura de áreas:** ya hay sesiones para Offset, Desgaje, Dimensionado, Folia, Folletos, Serigrafía, Laminado, Micas, CTP y Terminaciones. Siguen sin sesiones de FPS las PNC de áreas no productivas de Data (Logística, Comercial, Adquisiciones, Calidad, SGI, Cotización…).

## 7. Pruebas y regresión

- Pruebas unitarias del módulo: **194/194** (motor, resumen, privacidad, permisos, dashboard, regresión INNPACK). INNPACK sin cambios.
- Compilación Release correcta, sin errores.
- Endpoints existentes de fps-api (laboratorio, health) responden.

## 8. Candidato QCC 1.8.30 (reconstruido, **no publicado**, `latest.json` intacto)

- Fuente: código actual (DLL de las 10:11, posterior al último cambio del motor a las 10:06), publicado con `dotnet publish QualityControlCenter.csproj` y empaquetado con `ISCC.exe`.
- `C:\Installers\QualityControlCenter_Setup_v1.8.30.exe` — 58.900.479 bytes — **SHA-256 `8c47ff0ed29d651e9510999ce10fee8abe84b3cc99676a416b6710dfcff7b86b`**. Reemplaza al `32162ed3…` (obsoleto, en `C:\Installers\_old_f34\`).
- `QCC.Updater.exe` (publish existente, single-file, 67.527.732 bytes) sin cambios de código.
- Sin firma digital (condición heredada, pendiente de Seguridad TI).

## 9. Pendientes

1. **Decisión sobre pm2 vs tarea `FpsApi` (§3)** y revisión de `calidad-api`.
2. Revisión visual de la pantalla con el endpoint real (abrir el candidato con sesión ADMIN_TI; sin capturas posibles en esta ventana).
3. Repetir la conciliación con Data completa (operador declarado) cuando haya sesión abierta.
4. Calidad: significado de la fecha de Data; sector vs. máquina; ponderaciones provisionales; turnos.
5. Autorizaciones separadas para Mejora Continua y para publicar Photino/`latest.json` (Fase 33).
