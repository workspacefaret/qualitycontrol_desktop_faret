# 14 — Habilitar MCP de solo lectura sobre `calidad_db` (DIAGNÓSTICO + PROPUESTA; nada aplicado)

> **Estado 10-11-2026 (actualizado):** login `qcc_audit_ro` creado (SELECT solo en `no_conformidades` y `maquinas`). Falta el perfil `calidad-sqlserver` en 192.168.1.76 (admin `faret`). Ver docs 15 y 16. El diagnóstico de abajo sigue vigente; sobre `run-mcp.sh`: ya fue leído (ver doc 15 §1) y no hace falta instancia separada.

## 1. Diagnóstico (solo lectura, sin secretos)

| Punto | Hallazgo | Estado |
|---|---|---|
| `.mcp.json` | 3 servidores, todos `ssh -o BatchMode=yes <usuario>@192.168.1.76 /srv/ia/servicios/indexador/run-mcp.sh <perfil>` con perfiles `codigo`, `ejecutar`, `sqlserver`. Sin `env` ni secretos en el archivo | CONFIRMADO |
| Cómo se ejecuta | El servidor MCP corre **en 192.168.1.76**, por SSH con llave; el perfil se elige con el argumento de `run-mcp.sh` | CONFIRMADO |
| Servidor/base que usa `ia-sqlserver` | Fijos: login `pblectura` en el servidor `SAP-B1`, base `FARET_PRODUCCION` (la herramienta lo declara; solo acepta `SELECT`/`WITH`, tope 200 filas). No acepta parámetro de servidor ni base | CONFIRMADO |
| Código del agente | El script `run-mcp.sh` y el servidor Python están en 192.168.1.76, **fuera de los repos indexados** y no los leí (inspeccionarlos requeriría SSH/`ia-ejecutar`, que no usé) | PENDIENTE |
| ¿Múltiples conexiones? | Por la firma de las herramientas, una sola conexión por instancia. Lo más probable es que haga falta un **perfil nuevo** (misma plantilla, otra configuración) y no tocar el existente | INFERIDO, confirmar leyendo `run-mcp.sh` |
| `calidad_db` existe | **Sí**, en `SAP_NEW` (192.168.1.230), `ONLINE`. También `calidad_api_validation`, `formularios_db`, `mejora_continua_db`, `FPS_PRODUCCION` | CONFIRMADO (metadatos vía el servidor enlazado `CONEXIONFPS`) |
| Tablas (conteo por metadatos) | `no_conformidades` ≈ 200 filas, `maquinas` 34, `usuarios` 28 | CONFIRMADO |
| Cuentas existentes en `calidad_db` | `pblectura`, `qcc_innpack_api_sql`, `quality_control_backend_sql`, `api_programa_produccion`, `calidad_migracion` | CONFIRMADO |
| ¿Reutilizar `pblectura`? | Ya existe en `calidad_db` pero con rol **`db_datareader`** (SELECT sobre toda la base, incluida la tabla `usuarios`). Además es la cuenta de SAP. **No cumple mínimo privilegio** | CONFIRMADO |
| Cuentas de las APIs | `qcc_innpack_api_sql` y `quality_control_backend_sql` escriben: no se reutilizan | CONFIRMADO |

**Hallazgo de seguridad (informativo):** desde `ia-sqlserver` se alcanza `calidad_db` a través del servidor enlazado `CONEXIONFPS` (OPENQUERY), con los permisos del login del enlace. Solo leí metadatos y conteos; no leí datos de negocio. Conviene que TI revise qué puede hacer ese enlace y si debe restringirse.

## 2. Propuesta mínima (sin tocar `ia-sqlserver`)

**a) `.mcp.json`** — una entrada nueva, sin secretos:

```json
"ia-calidad-sqlserver": {
  "command": "ssh",
  "args": ["-o","BatchMode=yes","<mismo usuario>@192.168.1.76",
           "/srv/ia/servicios/indexador/run-mcp.sh","calidad-sqlserver"]
}
```

**b) En 192.168.1.76 (la hace quien administra ese servidor, no yo):** un perfil `calidad-sqlserver` en `run-mcp.sh` que reutilice el mismo servidor Python parametrizado con: host `192.168.1.230`, base `calidad_db`, usuario `qcc_audit_ro`, y la clave en un archivo `chmod 600` propiedad del usuario del servicio (nunca en `.mcp.json`, repos ni chat). El perfil `sqlserver` no se modifica.

**c) Identidad SQL (la crea el DBA con DDL; script para ejecución supervisada):**

```sql
-- En el servidor SAP_NEW (192.168.1.230). La contraseña la genera el DBA; no se registra en ningún repo.
USE master;
CREATE LOGIN qcc_audit_ro WITH PASSWORD = N'<generada-por-DBA>', CHECK_POLICY = ON,
      DEFAULT_DATABASE = calidad_db;
USE calidad_db;
CREATE USER qcc_audit_ro FOR LOGIN qcc_audit_ro;
GRANT SELECT ON OBJECT::dbo.no_conformidades TO qcc_audit_ro;
GRANT SELECT ON OBJECT::dbo.maquinas        TO qcc_audit_ro;   -- solo si se quiere contrastar máquinas
-- Sin roles de base de datos. Sin acceso a usuarios, adjuntos ni otras tablas.
```
Nota: los GRANT son por objeto (política vigente del proyecto). Si se agregan otros objetos para la auditoría, un GRANT por cada uno. Quitar el acceso después: `DROP USER` + `DROP LOGIN`.

## 3. Cómo verificar que no puede escribir (después de crearlo)

1. **Permisos efectivos** (con el login nuevo):
   ```sql
   SELECT IS_SRVROLEMEMBER('sysadmin') sa, IS_MEMBER('db_owner') dbo, IS_MEMBER('db_datareader') dr,
          HAS_PERMS_BY_NAME('dbo.no_conformidades','OBJECT','SELECT') sel,
          HAS_PERMS_BY_NAME('dbo.no_conformidades','OBJECT','INSERT') ins,
          HAS_PERMS_BY_NAME('dbo.no_conformidades','OBJECT','UPDATE') upd,
          HAS_PERMS_BY_NAME('dbo.no_conformidades','OBJECT','DELETE') del,
          HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','CREATE TABLE') ct,
          HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','ALTER') alt;
   ```
   Esperado: `sel=1`, todo lo demás `0`.
2. **Lista completa:** `SELECT * FROM fn_my_permissions(NULL,'DATABASE')` y `fn_my_permissions('dbo.no_conformidades','OBJECT')`: solo `CONNECT` y `SELECT`.
3. **Prueba negativa por el DBA** en SSMS con `EXECUTE AS LOGIN='qcc_audit_ro'`: `UPDATE dbo.no_conformidades SET nivel = nivel WHERE 1=0;` debe fallar con error 229 (permiso denegado) aun sin filas afectadas; luego `REVERT`.
4. **Doble barrera:** la herramienta MCP ya rechaza todo salvo `SELECT`/`WITH`; el permiso de base de datos es la barrera real (cubre también `SELECT … INTO`, que el MCP dejaría pasar).
5. Probar desde Claude solo con un `SELECT` de metadatos (`DB_NAME()`, `SUSER_NAME()`, conteo de `no_conformidades`) y comprobar que otras tablas (`usuarios`) responden "permiso denegado".

## 4. Orden exacto de habilitación (requiere tu autorización)

1. DBA ejecuta el script de §2c (con clave generada por él).
2. Administrador de 192.168.1.76: revisar `run-mcp.sh`, agregar el perfil `calidad-sqlserver` y el archivo de clave `chmod 600`; probar sin reiniciar nada más.
3. Yo agrego la entrada de §2a en `.mcp.json` (un cambio de 1 bloque, reversible).
4. Verificaciones de §3.
5. Recién ahí: auditoría completa (docs 11–13).

## 5. Alternativa descartada

Seguir usando `pblectura` o el servidor enlazado `CONEXIONFPS` para leer `calidad_db`: funciona técnicamente, pero concede lectura de toda la base (incluye `usuarios`) o depende de permisos del enlace que no controlamos. No recomendada.
