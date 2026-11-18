# Auditoría de paquetes API INNPACK y fps-api — 18-11-2026 (solo lectura; NO desplegado)

Estado previo: migraciones SQL de Calidad NP ejecutadas por el DBA en `calidad_db` (11 tablas + secuencia, verificación sin diferencias).

## API INNPACK — `PAQUETE_API_3ef89e5_LF` (`_preflight_calidadnp_20261118`)
- DLL `104199A50B767191512A91108929C984C61519E1A05926B6FA4AA2C754AB46CB`, PDB `850EA7997BC3174D7A24FCAC654B0950653EA516695198BBE0862DD37C41F549`; coinciden con `MANIFIESTO_API_3ef89e5_LF.txt` y con la compilación limpia de `3ef89e5` (LF). Solo DLL+PDB (sin appsettings ni otros archivos).
- Base de producción confirmada hoy: DLL `2D71507D…F58E`, PDB `E7BB6D4B…DCF8` = respaldo local = compilación de `54da0f1` (0 diferencias en preflight).
- Cambios de código vs `54da0f1` (git diff, exacto): 7 archivos de código. Nuevos: `CalidadNpController/Repository`, `TrazabilidadDocumentosController/Repository/Service`. Modificados: `Program.cs` (+3 registros DI) y `ControlDocumentalService.cs` (`private`→`internal` en `TryValidarAdjunto`). Ningún otro controlador/servicio/repositorio existente cambia; 0 claves de configuración nuevas.
- Rutas nuevas únicamente bajo `api/calidad-np/*` y `api/trazabilidad-documentos/*`; ninguna ruta existente se modifica.
- Nota: la comparación IL método a método vs producción muestra ruido (renumeración de tipos anónimos y lambdas del compilador al agregar código); la evidencia válida de "no se tocó lo existente" es el diff de fuente + 75/75 pruebas.
## fps-api — `paquete_trazabilidad_fase1a_20261117`
- Hashes = manifiesto (OK). Agrega `src/routes/trazabilidad.routes.js`, `src/services/trazabilidad.service.js` y 2 líneas en `server.js` (`require` + `app.use('/api/produccion', apiKeyAuth, trazabilidadRoutes)`). `server.js` y `produccion.routes.js` de producción = respaldo `respaldo_pre_trazabilidad_20261117` (hash hoy = respaldo).
- Rutas nuevas `GET /api/produccion/trazabilidad/np|lote`; no hay colisión con rutas existentes (ninguna empieza con `/trazabilidad`); montaje después de los routers previos y con la misma `apiKeyAuth`.
- Solo lectura: único `INSERT` sobre una variable de tabla local; entradas validadas por patrón + escape; timeouts (9 s consulta, 5 s lock), topes de filas. Sin dependencias npm nuevas (usa `config/db` existente); sin variables de entorno nuevas; el desktop usa su `FpsApiClient` ya configurado (Talleres Externos).
## Producción hoy (solo lectura, 18-11-2026)
Pool `QualityControlInnpackPool` Started (sin otros pools detenidos); tarea `FpsApi` Running; hashes de DLL/PDB/`server.js`/`produccion.routes.js` sin cambios; 0 archivos `trazabilidad*` en fps-api; C: 87,9 GB libres; `C:\API WEB\_backups` existe.
## Respaldo y reversión
- API: DLL+PDB de producción respaldados con hash en `_backups_deploy\calidadnp_pre_20261118\api_innpack`; además se copiarán en el servidor a `C:\API WEB\_backups\innpack_pre_calidadnp_<ts>` antes de reemplazar. Reversión: Stop del pool → restaurar DLL+PDB → Start del pool.
- fps-api: respaldo `respaldo_pre_trazabilidad_20261117` y copia de `src` de producción en `_backups_deploy\...\fps-api`. Reversión: restaurar `server.js`, borrar las 2 rutas nuevas, reiniciar solo la tarea `FpsApi`.
- SQL: tablas nuevas vacías; los `*_rollback.sql` abortan si hay datos. Las APIs previas no usan esos objetos, así que revertir API sin tocar SQL es seguro.

## Despliegue API INNPACK ejecutado (18-11-2026 ~10:30, fps-api NO desplegado)
- Respaldo en servidor: `C:\API WEB\_backups\innpack_pre_calidadnp_20261118_103010` (DLL `2D71507D…F58E` y PDB `E7BB6D4B…DCF8`, hash = producción previa). Staging en su subcarpeta `nuevo\` con hash = paquete.
- Reemplazo: solo DLL y PDB; destino DLL `104199A5…B46CB`, PDB `850EA799…1F549` (= paquete aprobado). Se detuvo y reinició únicamente `QualityControlInnpackPool` (~6 s). Sin tocar SQL, `appsettings`, otros pools ni fps-api.
- Evento Application "started successfully" (10:30:59); 24/24 pools iniciados (la línea base documentada decía 23; ninguno detenido); 0 errores de Application relacionados en 15 min; tarea `FpsApi` Running.
- HTTP antes → después: `health` 200→200; `no-conformidades` y `control-documental` 401→401; `login` con credenciales inválidas 401 (sin 500); rutas nuevas `api/calidad-np/*` y `api/trazabilidad-documentos/*` 404→**401** (GET y POST sin token); ruta inexistente 404→404.
- Pendiente (requiere sesión autenticada): permisos 403/200 por rol, lectura real de las tablas nuevas y regresión funcional con usuario. Reversión disponible: detener pool, restaurar DLL+PDB del respaldo, iniciar pool.
