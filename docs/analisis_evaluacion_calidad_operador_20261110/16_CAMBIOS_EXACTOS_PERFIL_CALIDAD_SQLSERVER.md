# 16 — Cambios exactos para el perfil `calidad-sqlserver` (PREPARADO, NADA APLICADO)

Destinatario: administrador del agente en 192.168.1.76 (usuario `faret`, propietario de `/srv/ia/servicios/indexador/`).
Motivo: `diego` entra por SSH sin sudo y no puede escribir en esos archivos; las claves SSH actuales no están autorizadas para `faret`. No se cambian permisos SSH desde esta sesión.

## 1. Cambio en `run-mcp.sh` (conserva `codigo`, `sqlserver`, `ejecutar` sin tocar)

Respaldo previo:
```bash
cd /srv/ia/servicios/indexador
cp -p run-mcp.sh run-mcp.sh.bak-20261110
sha256sum run-mcp.sh        # anotar el hash del original
```

Sustituir **solo** el bloque final `case ... esac` por este (cambian: línea nueva `calidad-sqlserver)` y el texto de uso):

```bash
case "${1:-codigo}" in
  codigo)    exec python -u mcp_codigo.py    ;;
  sqlserver) exec python -u mcp_sqlserver.py ;;
  ejecutar) exec python -u mcp_ejecutar.py ;;
  calidad-sqlserver)
    # Misma herramienta de solo lectura, otra credencial/base (calidad_db en SAP_NEW).
    export IA_ENV_SQL="/srv/ia/servicios/.env.calidad"
    exec python -u mcp_sqlserver.py ;;
  *) echo "uso: run-mcp.sh [codigo|ejecutar|sqlserver|calidad-sqlserver]" >&2; exit 2 ;;
esac
```

Notas de compatibilidad:
- El `export` queda dentro de la rama nueva: `sqlserver` sigue usando `IA_ENV_SQL` por defecto (`.env.sql`).
- El script usa `set -u` y no escribe nada por stdout (canal JSON-RPC): no agregar `echo`.
- Validar sin ejecutar el servidor: `bash -n run-mcp.sh`.
- Comprobar que el perfil existente sigue igual: `./run-mcp.sh perfil-inexistente; echo $?` debe dar `2` y el mensaje de uso en stderr.
- No hay reinicios: cada sesión MCP es un proceso nuevo por SSH.

Rollback: `cp -p run-mcp.sh.bak-20261110 run-mcp.sh && sha256sum run-mcp.sh` (debe coincidir con el hash anotado); borrar `.env.calidad`.

## 2. Credencial SQL en Ubuntu (sin mostrarla ni versionarla)

Ejecuta el administrador (o el DBA entrega la clave por un canal aprobado, nunca por chat ni correo en claro). La clave no debe aparecer en la pantalla, en el historial del shell ni en argumentos de proceso.

```bash
cd /srv/ia/servicios
umask 137                                   # archivo resultante 640
read -r -s -p "Clave de qcc_audit_ro: " CLAVE; echo   # no se muestra ni queda en el historial
{
  printf 'SQL_HOST=192.168.1.230\n'
  printf 'SQL_USER=qcc_audit_ro\n'
  printf 'SQL_PASS=%s\n' "$CLAVE"
  printf 'SQL_BASE=calidad_db\n'
} > .env.calidad
unset CLAVE
chgrp ia .env.calidad
chmod 640 .env.calidad
ls -l .env.calidad          # esperado: -rw-r----- 1 faret ia
```

- **Formato:** verificar que las claves (`SQL_HOST`, `SQL_USER`, `SQL_PASS`, `SQL_BASE`) coinciden con las de `.env.sql` comparando solo los nombres: `cut -d= -f1 .env.sql` (nunca `cat`). Si el lector `cfg()` acepta otro formato (comillas, `export`), ajustar igual que `.env.sql`.
- **Grupo `ia`:** necesario porque la sesión MCP corre como `diego` (grupo `ia`). Es el mismo modelo que `.env.sql`. Consecuencia: cualquier miembro de `ia` puede leer la clave; como la cuenta solo tiene `SELECT` sobre 2 tablas, el impacto es acotado.
- **Git:** `/srv/ia/servicios/` no es parte de ningún repo indexado; no copiar `.env.calidad` a repositorios. Si existe un repo en esa ruta, agregar `.env*` a su `.gitignore` y comprobar con `git status --ignored`.
- **Historial:** si se usó otro método, `history -d` de la línea y no pegar la clave en ningún comando.
- **Rotación futura:** cambiar la clave en SQL (`ALTER LOGIN`, DBA) y repetir el bloque; no requiere tocar `run-mcp.sh`.

## 3. Prueba de humo del perfil (sin Claude, sin escribir)

Con el usuario que ejecuta el agente, solo lectura de metadatos:
```bash
./run-mcp.sh calidad-sqlserver < /dev/null   # debe arrancar y terminar sin error al cerrar stdin
```
Si falla por conexión, revisar `SQL_HOST`/puerto 1433 desde .76 hacia 192.168.1.230 (el firewall puede no permitirlo; hoy `ia-sqlserver` llega a SAP-B1, no necesariamente a SAP_NEW).

## 4. Entrada de `.mcp.json` (preparada, NO activa)

Archivo `mcp.ia-calidad-sqlserver.PENDIENTE.json` en esta carpeta. Se agrega a `.mcp.json` solo cuando el administrador confirme que `./run-mcp.sh calidad-sqlserver` funciona. No lleva secretos.

## 5. Tareas que dependen del administrador

| # | Tarea | Quién | Estado |
|---|---|---|---|
| A1 | Crear login `qcc_audit_ro` + SELECT en `no_conformidades` y `maquinas` | DBA | **Hecho (confirmado por el usuario)** |
| A2 | Respaldar `run-mcp.sh` y aplicar §1 | admin de .76 (`faret`) | Pendiente |
| A3 | Crear `.env.calidad` según §2 | admin de .76 (`faret`) | Pendiente |
| A4 | Confirmar que .76 alcanza 192.168.1.230:1433 y prueba de humo §3 | admin de .76 / red | Pendiente |
| A5 | Avisar a Claude para activar la entrada de `.mcp.json` y verificar permisos | usuario | Pendiente |
| A6 | (Seguridad) revisar el servidor enlazado `CONEXIONFPS`, que permite leer metadatos de `calidad_db` desde SAP-B1 | TI | Pendiente, informativo |
