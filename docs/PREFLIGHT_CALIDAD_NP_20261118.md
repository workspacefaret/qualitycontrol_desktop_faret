# Preflight Calidad NP — 18-11-2026 (solo lectura; nada ejecutado en producción)

## A. Hecho localmente (sin acceso a producción)

| Verificación | Resultado |
|---|---|
| Compilación de `54da0f1` y `91952f5` con SDK 10.0.404 en worktrees limpios fuera del repo | OK. Paquete = **solo** `QualityControlInnpack.Api.dll/.pdb` (+`.exe` que no se copia). SQL y demás archivos idénticos entre ambos |
| Hash propuesto (`_preflight_calidadnp_20261118\MANIFIESTO_API_91952f5.txt`) | DLL `E98C5FA7…DDF3`, PDB `25D9447B…2302`; base `54da0f1` = `B5C30D59…60CA` |
| Hash registrado del despliegue del 17-11 (`54da0f1`) | `2D71507D…F58E` **≠** `B5C30D59…` de mi compilación local → era esperable (ruta de compilación distinta embebida), **no prueba equivalencia ni diferencia**. Se resuelve con la comparación por métodos (§B-3), no por hash |
| Herramienta `cmpmeta` (compara método a método: IL + firma, ignora rutas/MVID) | Autoprueba OK (misma DLL = 0 diferencias). Con builds de commits distintos el IL difiere por tokens: **solo sirve para comparar dos compilaciones del MISMO commit** (producción vs `54da0f1`) |
| SQL: scripts 1b y Calidad NP | Solo CREATE guardado (`IF OBJECT_ID … IS NULL`), semillas con `WHERE NOT EXISTS`, GRANT solo si existe el usuario; **no modifican ni leen tablas existentes**; idempotentes (ejecutados dos veces en LocalDB) |
| Rollbacks | **Corregido hoy**: abortan por defecto si hay datos (`@CONFIRMAR_BORRADO = 0`); las semillas provisionales no cuentan como datos. 3 pruebas nuevas (vacío borra solo lo suyo; con datos aborta sin borrar; 1b con auditoría aborta) |
| Preflight SQL de solo lectura (`2026_11_calidad_np_preflight_SOLO_LECTURA.sql`) | Creado; probado en LocalDB: corre sin errores y no modifica nada |
| Pruebas API | **75/75** (74 + preflight) |
| fps-api: paquete 1a | Aditivo: `trazabilidad.routes.js` y `trazabilidad.service.js` nuevos + 2 líneas en `server.js` (require y `app.use`). Hashes = manifiesto (OK). `src` local idéntico al paquete. `respaldo_pre_trazabilidad_20261117` íntegro (manifiesto 0 fallos) |
| Commits | desktop `ed16609`; API `3ef89e5` (cadena: `91952f5` Calidad NP → `54aa41c` rollbacks seguros → `3ef89e5` preflight). El DLL del paquete se compiló de `91952f5`; los commits posteriores solo tocan SQL y pruebas (el publish no los incluye), por lo que el DLL es idéntico |

## B. Lo que debe ejecutar una persona autorizada (solo lectura; pegar la salida)

Reglas: una línea por comando, sin `Bypass`, sin `c$`. Identidad `ad\dcarrasco`, por hostname.

1. Conectividad: `powershell -NoProfile -Command "Test-WSMan -ComputerName SRV-API.ad.faret.cl -Authentication Kerberos"`
2. Estado y hashes de producción (API + fps-api):
```
powershell -NoProfile -Command "Invoke-Command -ComputerName SRV-API.ad.faret.cl -ScriptBlock { Import-Module WebAdministration; (Get-WebAppPoolState -Name QualityControlInnpackPool).Value; Get-FileHash 'C:\API WEB\api\innpack\QualityControlInnpack.Api.dll','C:\API WEB\api\innpack\QualityControlInnpack.Api.pdb' | Select Hash,Path; Get-ChildItem 'C:\API WEB\api\innpack\QualityControlInnpack.Api.*' | Select Name,Length,LastWriteTime; (Get-ScheduledTask -TaskName FpsApi).State; Get-NetTCPConnection -LocalPort 3002 -State Listen -ErrorAction SilentlyContinue | Select OwningProcess; Get-ChildItem 'C:\API WEB\api\fps-api\src' -Recurse -File | Get-FileHash | Select Hash,@{n='f';e={$_.Path.Replace('C:\API WEB\api\fps-api\','')}}; (Get-PSDrive C).Free/1GB }"
```
   Esperado: pool `Started`; fps-api sin `trazabilidad.*`; en producción `server.js` = el del `respaldo_pre_trazabilidad_20261117\MANIFIESTO_SHA256.txt`.
3. **Copia de respaldo local de producción (lectura en servidor, escritura local) y comparación:**
```
powershell -NoProfile -Command "$s=New-PSSession -ComputerName SRV-API.ad.faret.cl; $d='C:\Users\dcarrasco\Desktop\Proyectos\_backups_deploy\calidadnp_pre_20261118\api_innpack'; New-Item -ItemType Directory -Force $d | Out-Null; Copy-Item 'C:\API WEB\api\innpack\QualityControlInnpack.Api.dll','C:\API WEB\api\innpack\QualityControlInnpack.Api.pdb' -Destination $d -FromSession $s; $f='C:\Users\dcarrasco\Desktop\Proyectos\_backups_deploy\calidadnp_pre_20261118\fps-api'; New-Item -ItemType Directory -Force $f | Out-Null; Copy-Item 'C:\API WEB\api\fps-api\src' -Destination $f -Recurse -FromSession $s; Remove-PSSession $s"
```
   Luego Claude calcula SHA-256 de lo copiado (debe coincidir con el paso 2) y ejecuta `cmpmeta <prod.dll> BASE_54da0f1…dll`: **0 diferencias = producción es `54da0f1`**; cualquier diferencia = DETENER.
4. Preflight SQL: el DBA ejecuta `2026_11_calidad_np_preflight_SOLO_LECTURA.sql` en `calidad_db` y entrega la salida. Esperado antes de migrar: sin objetos `trazabilidad_*` ni de Calidad NP, sin choque de nombres, respaldo reciente, espacio libre, usuario `qcc_innpack_api_sql` existente, permisos de creación = 1.
5. **Respaldo SQL (DBA, escribe en el servidor SQL):**
```
BACKUP DATABASE calidad_db TO DISK = N'C:\SQLBackups\CalidadNp\calidad_db_PRE_CalidadNp_20261118.bak' WITH COPY_ONLY, CHECKSUM, STATS = 10;
RESTORE VERIFYONLY FROM DISK = N'C:\SQLBackups\CalidadNp\calidad_db_PRE_CalidadNp_20261118.bak' WITH CHECKSUM;
```
   Además `SELECT` del hash del `.bak` (`Get-FileHash`) y anotarlo. La restauración completa se probaría en una base distinta si se desea evidencia total.

## C. Reversión (no destruye datos nuevos sin autorización)

- API: restaurar `QualityControlInnpack.Api.dll/.pdb` desde `_backups_deploy\calidadnp_pre_20261118\api_innpack` (hash verificado) y reiniciar solo `QualityControlInnpackPool`.
- fps-api: restaurar `src` desde `…\fps-api` y reiniciar solo la tarea `FpsApi` (la reversión es borrar las 2 rutas nuevas y las 2 líneas de `server.js`).
- SQL: `*_rollback.sql` abortan si hay datos; para borrar con datos hace falta respaldo previo + autorización expresa y cambiar `@CONFIRMAR_BORRADO` a 1. Orden: Calidad NP primero, luego 1b.

## D. Estado de este preflight

Parte local: **APTA**. Parte de producción (§B): **PENDIENTE de ejecución por persona autorizada**; sin ella el preflight global queda **NO CONCLUYENTE**, no se debe migrar ni desplegar.

## E. Resultado de producción (18-11-2026, ejecutado en solo lectura)

- SRV-API accesible por WinRM/Kerberos. `QualityControlInnpackPool` = **Started**; tarea `FpsApi` = **Running**; C: con 87,9 GB libres.
- **DLL producción** `2D71507D…F58E` (1.675.776 B, 17-11-2026 12:09) y PDB `E7BB6D4B…DCF8`: copiadas a `Desktop\Proyectos\_backups_deploy\calidadnp_pre_20261118\api_innpack` con hash local = hash del servidor.
- **Comparación real (cmpmeta, IL normalizado con tokens resueltos):** producción vs `54da0f1` compilado con fin de línea **LF** = **0 diferencias** en 5.219 métodos. (Con checkout CRLF aparecían 97 métodos distintos: solo la cantidad de `\r` en los literales SQL; descartado.) Conclusión: producción = `54da0f1`.
- **Paquete aprobado reconstruido con LF** (convención de los despliegues previos): `_preflight_calidadnp_20261118\PAQUETE_API_3ef89e5_LF` (DLL `104199A5…B46CB`, PDB `850EA799…1F549`), manifiesto `MANIFIESTO_API_3ef89e5_LF.txt`, compilado de `3ef89e5` limpio. **El paquete CRLF de `91952f5` queda obsoleto.**
- **fps-api producción:** copia de `src` (15 archivos) en `…\fps-api` = **idéntica** a `respaldo_pre_trazabilidad_20261117` (0 diferencias); sin archivos `trazabilidad.*`. Paquete 1a verificado aditivo.
- Respaldo local: `_backups_deploy\calidadnp_pre_20261118` + `MANIFIESTO_SHA256_RESPALDO_PROD.txt` (verificado, 0 fallos).
- **calidad_db: SIN ACCESO desde esta sesión** (la única herramienta SQL disponible apunta a FARET_PRODUCCION, no a `calidad_db`). Bloques para el DBA en §B-4 y §B-5; ejecutar en el servidor SQL de SAP_NEW con `db_owner`/permiso `BACKUP DATABASE` y espacio en `C:\SQLBackups\CalidadNp`.
