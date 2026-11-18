# Migración SQL Trazabilidad 1b + Calidad NP en calidad_db (SAP_NEW) — procedimiento supervisado

Alcance: SOLO los 2 scripts SQL. Sin despliegue de APIs, sin reinicios, sin instalador. Lo ejecuta una persona con CREATE TABLE/SEQUENCE y GRANT, junto con Claude revisando cada salida.
Paquete: `Desktop\Proyectos\_deploy_sql_calidadnp_20261118\` (scripts extraídos del commit API `3ef89e5`, fin de línea LF, `MANIFIESTO_SHA256.txt`).
Respaldo previo ya hecho: `C:\SQLBackups\CalidadNp\calidad_db_PRE_CalidadNp_20261118_093835.bak` (SHA-256 574C493E…5FBB).

## Revisión (hecha)
- Scripts = commits aprobados (1b: `5949d5f`; Calidad NP: `91952f5`; sin cambios hasta `3ef89e5`). Contenido idéntico al del repo; en disco puede variar el fin de línea (CRLF/LF), por eso se entrega el blob del commit.
- Solo CREATE guardado (`IF OBJECT_ID … IS NULL`), semillas con `WHERE NOT EXISTS`; sin DROP/DELETE/UPDATE/ALTER sobre objetos existentes. Sin STRING_AGG/TRIM/CONCAT_WS (compatible 2016/compat. 130).
- Permisos por objeto a `qcc_innpack_api_sql` = exactamente las operaciones que usa el código de la API (revisado contra los SQL de los repositorios); `UPDATE` sobre la secuencia es necesario para `NEXT VALUE FOR`; `DELETE` solo en `cert_destruccion_detalle` (rehacer detalle de un BORRADOR).
- Probado en LocalDB (compat. 130, BD temporal ya eliminada): ambos scripts OK, reejecución idempotente (0 filas nuevas), verificación sin diferencias. NO probado en SQL Server 2016 real.

## Procedimiento (PowerShell administrativo en SAP_NEW)

**0. Copiar la carpeta** `_deploy_sql_calidadnp_20261118` a `C:\Deploy\CalidadNp_SQL` y verificar:
```
cd C:\Deploy\CalidadNp_SQL
Get-FileHash -Algorithm SHA256 *.sql | Select Hash,@{n='Archivo';e={Split-Path $_.Path -Leaf}}
Get-Content .\MANIFIESTO_SHA256.txt
```
Cada hash debe coincidir con el manifiesto. Si no: DETENER.

**1. Prechequeo** (sqlcmd presente, instancia y base):
```
Get-Command sqlcmd | Select Source
sqlcmd -S . -E -b -Q "SELECT @@SERVERNAME AS servidor, DB_ID('calidad_db') AS id_bd, (SELECT COUNT(*) FROM calidad_db.sys.tables WHERE name LIKE 'trazabilidad[_]%' OR name LIKE 'np[_]%' OR name LIKE 'cert[_]destruccion%') AS objetos_previos"
```
Esperado: `id_bd` no nulo y `objetos_previos` = 0. (Instancia con nombre: reemplazar `.` por `localhost\NOMBRE` en todos los comandos.)

**2. Trazabilidad 1b** (primero):
```
sqlcmd -S . -E -b -i .\2026_11_trazabilidad_documentos_factor.sql
```
Esperado: `(23 rows affected)` y ningún `Msg`. Si hay error: DETENER, no seguir (`-b` aborta el script).

**3. Verificación intermedia** (solo lectura): `sqlcmd -S . -E -b -W -i .\3_verificacion_postmigracion_SOLO_LECTURA.sql`
Aquí deben existir las 4 tablas trazabilidad_* y faltar las de Calidad NP (esperado: 7 FALTA + secuencia FALTA). Sirve de punto de control.

**4. Calidad NP** (después):
```
sqlcmd -S . -E -b -i .\2026_11_calidad_np_mermas_cierre_destruccion.sql
```
Esperado: `(3 rows affected)` y ningún `Msg`.

**5. Verificación final** (solo lectura):
```
sqlcmd -S . -E -b -W -i .\3_verificacion_postmigracion_SOLO_LECTURA.sql
```
Esperado: 11 tablas OK + secuencia OK; requisitos 23; flujo 3; filas operativas 0; secuencia consumida 0; 4 FK con `is_disabled=0, is_not_trusted=0`; `tabla_sin_pk` vacía; bloque de permisos **sin filas** (ni FALTA ni SOBRA); `objeto_inesperado_creado_hoy` vacío.

**6.** Pegar a Claude la salida de los pasos 1 a 5. No desplegar APIs hasta revisarla.

## Reversión (solo con autorización expresa)
Los `*_rollback.sql` abortan si hay datos (`@CONFIRMAR_BORRADO = 0`). Orden: Calidad NP primero, luego 1b. Con las tablas vacías (recién migradas) se pueden ejecutar sin cambios. Respaldo de referencia: el `.bak` COPY_ONLY de arriba.
