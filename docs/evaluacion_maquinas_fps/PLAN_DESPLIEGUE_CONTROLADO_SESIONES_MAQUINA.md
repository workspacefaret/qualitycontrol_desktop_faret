# Plan de publicación controlada — `GET /api/produccion/sesiones-maquina` (fps-api)

Estado 13-11-2026: **preparado, NO ejecutado.** Requiere autorización explícita del responsable (DEPLOY_POLICY). Sin commit/push. Atribución de operadores en el módulo: apagada y fuera de alcance.
Decisión vigente: se mantiene la versión Q4/Q6 (`INNER LOOP JOIN`). Q7b se descartó (plan estimado idéntico: 98.855 filas leídas).

## 1. Inventario exacto

### fps-api (`C:\Users\dcarrasco\Desktop\Proyectos\fps-api\fps-api`, sin git) — lo único que se despliega
| Archivo | Acción | SHA-256 local (13-11-2026) |
|---|---|---|
| `src/services/sesionesMaquina.service.js` | NUEVO | `22b25abbb85a89a26cb4cbb7954feb9c65d74a3d0e02d8bebc4eead983cf3b4e` |
| `src/routes/sesionesMaquina.routes.js` | NUEVO | `f36143ed15e3e9e28c3f2845572a2d7efcec4c4899467acc8c195d1578432dc1` |
| `src/server.js` | MODIFICADO (+1 `require`, +1 `app.use`) | `69faa4ca95e340650e1da7f8110c9bc7d022fdac5ec300aebf5f5515388113be` (original local: `38454385f572a6196beeb386f1c50ee9882750ba83b2bbf96590620ac4c6e756`) |

No se despliegan: `package.json` (solo agrega el script `test`), `tests/sesionesMaquina.test.js`.
Sin cambios (verificados): `src/routes/produccion.routes.js` (`d360e68a…7b53`), `src/services/produccion.service.js` (`3f507130…8ca9`), `src/middlewares/auth.middleware.js` (`d602dc29…2798`), `src/config/db.js` (`1a9ba0a0…1cc5`).
Respaldos locales: scratchpad de la sesión (`backup_fps_api\server.js`, `package.json`, `sesionesMaquina.service.v1.js`).

### Desktop (NO se publica en esta etapa; sin instalador nuevo)
Modificados: `Program.cs`, `Services/FpsApi/FpsSesionesApiService.cs`, `Services/MessageRouter.cs`, `Services/PermisosService.cs`, `src/UI/www/index.html`.
Nuevos: `src/Backend/Modules/EvaluacionMaquinas/*` (Calculator, Parser, Handler, PalletMaquinaEquivalencias, PalletAtribucionFps), `src/UI/www/modules/faret-evaluacion-maquinas/`, `src/UI/www/shared/evaluacion-maquinas-base.js`, `tools/evaluacion_maquinas_tests/`, `tools/fps_historico/cobertura_pallet_fps.py`, `docs/evaluacion_maquinas_fps/`.
El endpoint se prueba sin el desktop (curl por una persona); la auditoría de cobertura queda apagada (config) y solo ADMIN_TI.

## 2. Pruebas realizadas (13-11-2026, datos sintéticos)
| Suite | Resultado |
|---|---|
| fps-api `npm test` (auth 401/503, validación y límites, SQL parametrizado, etapa interna solo con columnas del índice, `INNER LOOP JOIN`, cursor, timeout/cancelación, concurrencia, logs sin nombres ni clave, regresión de rutas existentes) | 8/8 |
| Evaluación por Máquina (calculador, parser, equivalencias, clasificador, servicio FPS, handler, permisos) | 144/144 |
| Evaluación por Operador (regresión) | 194/194 |
| `dotnet build` | 0 errores |
Planes estimados (SSMS, SAP_NEW/FPS_PRODUCCION, por el usuario): Q4 y Q6 con Index Seek `IX_WorkOrderRecords_ResourceKey_Online_ProdTime` + Nested Loops + Clustered Index Seek `PK_WorkOrderRecords`, sin scan completo; filas leídas 1.ª etapa: 8.685 (2 máquinas) / 98.853 (30 máquinas × 92 días).

## 3. Riesgos aceptados (conocidos)
- La 1.ª etapa lee todas las filas históricas de las máquinas pedidas (fecha como predicado residual): ~100.000 filas de un índice angosto en el caso máximo; crece con el historial. Tope por solicitud: 2 consultas simultáneas, 15 s, `LOCK_TIMEOUT` 5 s, `MAXDOP 1`.
- Lecturas bajo bloqueo de FPS Station (sesiones abiertas se actualizan en vivo): posible 500 aislado; reintentable.
- 502 transitorio de ~8–20 s del endpoint público al reiniciar `FpsApi` (afecta a los demás consumidores de fps-api).

## 4. Procedimiento (ejecución supervisada por una persona; WinRM+Kerberos por hostname `SRV-API.ad.faret.cl`; sin `ExecutionPolicy Bypass`, sin `c$`, sin leer `.env`)
Referencia: `docs/OPERACION_DESPLIEGUE_QCC.md` §7. Ventana: fuera de horario pico; avisar el corte de ~20 s.

**A. Antes**
1. Autorización expresa del responsable.
2. Local: `node --check` de los 3 archivos y `npm test` = 8/8; recalcular los 3 hashes y compararlos con la tabla.
3. **Línea base de producción:** traer `C:\API WEB\api\fps-api\src\server.js` (solo lectura) y comprobar que su SHA-256 es `38454385…e756`. **Si difiere, DETENERSE**: alguien cambió el archivo en el servidor; revisar el diff antes de continuar.
4. Confirmar que `C:\API WEB\api\fps-api\src\services\sesionesMaquina.service.js` y `src\routes\sesionesMaquina.routes.js` NO existen.
5. Respaldo: `C:\API WEB\_backups\fps-api_pre_sesiones-maquina_<aaaammdd_hhmmss>\src\server.js` + hash. (Los otros 2 archivos son nuevos: no hay nada que respaldar.)
6. Subir los 3 archivos a `...\_backups\...\nuevo\` con `Copy-Item -ToSession`; verificar hash de cada uno.

**B. Publicación**
7. `Stop-ScheduledTask -TaskName 'FpsApi'` → comprobar que el puerto 3002 no tiene listener.
8. Copiar `server.js` + los 2 archivos nuevos a sus rutas; verificar hashes en destino.
9. `Start-ScheduledTask -TaskName 'FpsApi'`. Nunca `taskkill /IM node.exe`.
10. Esperar el 502 transitorio (8–20 s); confirmar PID/StartTime nuevos en el puerto 3002.

**C. Verificación (criterios de éxito)**
11. `GET https://api.faret.cl/fps/api/health` = 200.
12. Sin clave: `GET /api/produccion/sesiones-maquina?...` = **401** (autenticación OK, el endpoint existe).
13. Con clave (la ejecuta una persona): `GET /api/produccion/sesiones-maquina?maquina=15&desde=<ayer>&hasta=<ayer>` = 200, `ok:true`, campos esperados (incluye `Online`), tiempo de respuesta razonable.
14. Regresión: `GET /api/produccion/sesiones-documentos?np=22991` = 200 y `GET /api/produccion/laboratorio/registros?np=...` sin cambios.
15. Prueba de carga máxima **una sola vez**: 30 máquinas × 92 días con `limite=2000`, mientras otra persona observa CPU/lecturas en SQL (SSMS). Registrar tiempo y número de páginas (`siguiente`).
16. Cerrar: documentar hashes, PID/StartTime, tiempos y resultados en `contex.md`.

**D. Criterios de reversión inmediata**
Health ≠ 200 pasados 2 min; cualquier endpoint existente con 5xx; `sesiones-maquina` con 5xx sistemáticos o > 15 s; CPU/lecturas anómalas en SQL durante el paso 15.

**E. Reversión**
`Stop-ScheduledTask 'FpsApi'` → restaurar `server.js` desde el respaldo y borrar `src\services\sesionesMaquina.service.js` y `src\routes\sesionesMaquina.routes.js` → `Start-ScheduledTask 'FpsApi'` → health 200 → `sesiones-maquina` debe dar 404 y `sesiones-documentos` 200 → comparar hash de `server.js` con la línea base.
(El cambio es aditivo y nada depende de él; el desktop no usa el endpoint hasta que se active la auditoría.)

## 5. Fuera de alcance
Publicar el desktop, activar `CoberturaFpsHabilitada`, atribuir operadores, crear índices o tocar SQL Server, confirmar las 9 equivalencias pendientes, commit/push.
