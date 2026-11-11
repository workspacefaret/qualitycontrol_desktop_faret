# 15 — Habilitar `ia-calidad-sqlserver`: hallazgos del agente y pasos que requieren a otras personas (10-11-2026)

> **ACTUALIZACIÓN (estado real confirmado por el usuario):** el Paso A está **HECHO**: `calidad_db` ONLINE en SAP_NEW; login `qcc_audit_ro` creado con CONNECT y SELECT solo sobre `dbo.no_conformidades` y `dbo.maquinas`, sin roles adicionales. El Paso B está **PENDIENTE**: `diego` tiene SSH sin sudo; `faret` (propietario del agente) no es accesible con las claves actuales. No se modificó el agente ni `.mcp.json`. Cambios exactos y procedimiento de credencial: `16_CAMBIOS_EXACTOS_PERFIL_CALIDAD_SQLSERVER.md`. Verificación de permisos de `qcc_audit_ro` por mí: pendiente (requiere el perfil operativo).

Estado original: autorizado por el usuario. Lo que depende de permisos que esta sesión no tiene queda como paquete listo para ejecución supervisada. No se creó ningún usuario, no se tocó `.mcp.json`, no se modificó nada en 192.168.1.76.

## 1. Hallazgos en 192.168.1.76 (solo lectura, valores sensibles no leídos)

- Sesión SSH de `ia-ejecutar`: usuario `diego` (uid 1001, grupos `diego`, `ia`).
- `/srv/ia/servicios/indexador/` y sus archivos pertenecen a `faret`. `run-mcp.sh` es `-rwxr-xr-x faret`: **`diego` no puede escribirlo** (y no se intentó elevar privilegios).
- `run-mcp.sh` (30 líneas): `case "$1" in codigo|sqlserver|ejecutar` → `exec python -u mcp_<perfil>.py`. Cualquier otro perfil termina con `exit 2`.
- `mcp_sqlserver.py`: conecta con `pymssql` usando `SQL_HOST`, `SQL_USER`, `SQL_PASS`, `SQL_BASE` leídos del archivo indicado por `IA_ENV_SQL` (hoy `/srv/ia/servicios/.env.sql`, legible por el grupo `ia`). `consultar` solo acepta `SELECT`/`WITH`, bloquea `INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|EXEC|MERGE|GRANT` y limita filas.
- **Consecuencia:** no hace falta código nuevo ni otra instancia. Basta un perfil que apunte `IA_ENV_SQL` a otro archivo de credenciales. `ia-sqlserver` queda intacto.
- Limitación menor: `buscar_tabla`, `describir_tabla` y `ver_consulta` usan el índice Qdrant de SAP y `ver_consulta` lee `OUQR` (no existe en `calidad_db`). Para el nuevo perfil solo `consultar` es útil; basta con eso para la auditoría.

## 2. Paso A — DBA en SAP_NEW (192.168.1.230)

Ejecutar en SSMS con permisos de administración; la clave la genera el DBA (larga, aleatoria) y no se envía por chat ni se guarda en repos.

```sql
USE master;
CREATE LOGIN qcc_audit_ro WITH PASSWORD = N'<generada-por-DBA>', CHECK_POLICY = ON,
      DEFAULT_DATABASE = calidad_db;
USE calidad_db;
CREATE USER qcc_audit_ro FOR LOGIN qcc_audit_ro;
GRANT SELECT ON OBJECT::dbo.no_conformidades TO qcc_audit_ro;
GRANT SELECT ON OBJECT::dbo.maquinas        TO qcc_audit_ro;  -- solo para contrastar nombres de máquina
```

Sin roles de base de datos. Reversión: `DROP USER qcc_audit_ro;` y `DROP LOGIN qcc_audit_ro;`.

## 3. Paso B — administrador de 192.168.1.76 (propietario `faret`)

1. Respaldo: `cp -p run-mcp.sh run-mcp.sh.bak-20261110`.
2. Crear `/srv/ia/servicios/.env.calidad` (`chmod 640`, grupo `ia`, mismo formato que `.env.sql`) con `SQL_HOST=192.168.1.230`, `SQL_USER=qcc_audit_ro`, `SQL_PASS=<la clave>`, `SQL_BASE=calidad_db`. Copiar el formato desde `.env.sql` sin mostrar su contenido.
3. En `run-mcp.sh`, agregar una línea al `case` (antes de `*)`) y ajustar el mensaje de uso:
   ```bash
   calidad-sqlserver) export IA_ENV_SQL=/srv/ia/servicios/.env.calidad; exec python -u mcp_sqlserver.py ;;
   ```
4. `bash -n run-mcp.sh` para validar sintaxis. No se reinicia ningún servicio: cada sesión MCP es un proceso nuevo por SSH.
5. Rollback: restaurar `run-mcp.sh.bak-20261110` y borrar `.env.calidad`.

## 4. Paso C — `.mcp.json` (lo agrego yo cuando A y B estén hechos)

Se agrega solo la entrada `ia-calidad-sqlserver` (misma forma que las otras, sin secretos) con argumento `calidad-sqlserver`. Se difiere a propósito: sin el perfil, el servidor saldría con código 2 y quedaría como un MCP fallido en la sesión.

## 5. Paso D — verificación (la hago yo con la nueva conexión, solo metadatos y SELECT)

`SUSER_NAME()`, `DB_NAME()`, `IS_SRVROLEMEMBER('sysadmin')`, `IS_MEMBER('db_owner'/'db_datareader')`, `HAS_PERMS_BY_NAME` (SELECT=1; INSERT/UPDATE/DELETE/ALTER/CREATE TABLE=0), `fn_my_permissions`, SELECT sobre `usuarios` debe dar permiso denegado, y acceso a otras bases denegado. Sin UPDATE/INSERT/DELETE, ni con 0 filas. Luego, la auditoría de datos (docs 11, 12, 13) con la fecha de fabricación y pesos 10/5/1.
