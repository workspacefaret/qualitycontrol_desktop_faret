# Entorno aislado de pruebas (INNPACK)

Photino + API INNPACK + fps-api + apisapfaret, todo local y escuchando en 127.0.0.1.
**Revisar `comun.js`, `preparar.js`, `iniciar.js`, `fps-local.js` y `solo-lectura.js` antes de ejecutar.**

## Comandos (PowerShell, desde la carpeta del repositorio)

```powershell
node tools/entorno_aislado/preparar.js            # una vez (--recrear rehace solo la base LocalDB de pruebas)
node tools/entorno_aislado/iniciar.js             # datos ficticios (NP 9999): sin credenciales ni bases reales
node tools/entorno_aislado/iniciar.js --sap       # + apisapfaret local en solo lectura (consulta SAP real)
node tools/entorno_aislado/iniciar.js --fps reales --sap   # + SQL real de FPS con login de solo lectura
```

Se detiene cerrando Photino (o con Ctrl+C si se usó `--solo-apis`). Logs y configuración: `%LOCALAPPDATA%\QCC_Aislado`.
Si Kaspersky bloquea o alerta algo: detenerse, anotar el comando y no reintentar por otra vía.

## Autenticación (la realiza una persona)

| Dónde | Qué se ingresa |
|---|---|
| Ventana de Photino | Elegir INNPACK; `prueba.aislado` (todo), `prueba.ver` (solo ver) o `prueba.sinacceso`; clave `Aislado-Pruebas-2026`. No usar la clave real. |
| `--fps reales` | La terminal pide servidor, usuario y clave SQL (la clave no se muestra ni se guarda). |
| `--sap` | Usa la configuración local de desarrollo de apisapfaret. Si no tiene credenciales de Service Layer, definirlas como variables de entorno `SapServiceLayer__Companies__INNPACK__UserName` / `__Password` en esa terminal. |

## Qué protege de escribir en producción

| Componente | Barrera (falla cerrado) |
|---|---|
| Photino | `QCC_AISLADO=1`: usa solo `QCC_CONFIG`; no arranca si hay un destino no local; updater desactivado. |
| API INNPACK | Entorno `Aislado`: no arranca si la base no es `(localdb)\` sin usuario SQL o si alguna URL/host MySQL no es local. |
| fps-api | `ficticios`: sin base. `reales`: no arranca si el login tiene INSERT/UPDATE/DELETE/ALTER/CONTROL/EXECUTE/CREATE TABLE o un rol de servidor, en FPS **o** al otro lado de `CONEXIONSAP`. |
| apisapfaret | `SapServiceLayer:SoloLectura`: POST y DELETE se rechazan antes de salir (solo Login/Logout y GET). |

Con `--sap`, las consultas llegan al Service Layer real. Es solo lectura, pero abre sesiones con ese usuario SAP.

Ningún proceso hereda de la terminal variables con credenciales o destinos (`FPS_SQL_*`, `SQL_*`, `MYSQL_*`, `Database__*`,
`SapServiceLayer__*`, etc.): el SQL de FPS llega solo a fps-api y el usuario y clave de Service Layer solo a apisapfaret.

Actualizado el 25-11: si la base LocalDB ya existía, ejecutar `preparar.js --recrear` (cambió la migración 2026_12).

## Prueba con datos reales (solo lectura)

1. **Una vez, en el servidor SQL de FPS** (`SAP_NEW`, 192.168.1.230; lo ejecuta la persona autorizada): primero
   `sqlcmd -S SAP_NEW -E -b -W -s "|" -i .\verificar_lectura_fps.sql -o .\verificacion_fps.txt` (solo consulta) para
   ver si hay un login reutilizable. Si no lo hay, revisar y ejecutar en SSMS `login_lectura_fps.sql`.
   Después, **conectado con ese login** (sin `-P`, pide la clave) y antes de usarlo:
   `sqlcmd -S SAP_NEW -d FPS_PRODUCCION -U qcc_lectura -b -W -s "|" -i tools\entorno_aislado\comprobar_qcc_lectura.sql`.
   Roles y escrituras en 0; al otro lado de `CONEXIONSAP` nunca `sa`. Si no coincide, no iniciar el entorno.
   Crea `qcc_lectura`, sin escritura, que entra a SAP por `CONEXIONSAP` como `pblectura`. Las claves se reemplazan en la
   ventana de SQL y no se guardan. La reversa está al final del script.
2. Cerrar el entorno anterior y levantar: `node tools/entorno_aislado/iniciar.js --fps reales` (pide servidor, usuario
   y clave). Las mermas, cierres y certificados siguen escribiéndose solo en LocalDB.
3. En otra terminal: `node tools/entorno_aislado/comparar_reales.js`. Compara las 8 NP contra `referencia_np.json`
   (cifras obtenidas el 25-11 por SQL propio) y mide el tiempo de cada consulta. Una diferencia se revisa en el origen:
   la referencia es una foto y puede haber movimientos posteriores.
4. Agregar `--sap` solo para probar adjuntos y ZIP, y solo con un usuario de Service Layer **sin permisos de escritura**.
   La barrera `SoloLectura` bloquea POST y DELETE, pero no reduce los permisos del usuario.

## Limitaciones

- Photino usa su propio almacenamiento WebView2 (`%LOCALAPPDATA%\QCC_Aislado\webview2`). Comprobar que esa carpeta
  aparezca **antes de elegir empresa**; si no aparece o entra solo con una sesión recordada, cerrar la ventana.
- La impresión de bins queda bloqueada (la impresora Zebra es un equipo físico de la red).
- Una foto de Calidad con ruta relativa se pide por GET a `api.faret.cl/calidad` (escrito en el front). La base de pruebas
  nace sin fotos, así que no ocurre salvo que se carguen datos con esas rutas.

- Las APIs de FARET no se configuran: los pallets (calidad-api) aparecen como "No disponible".
- La base de pruebas nace vacía: mermas, cierres y certificados se crean en ella durante la prueba.
- `--fps reales` requiere un login SQL de solo lectura en el servidor de FPS cuyo mapeo en `CONEXIONSAP` también lo sea.
  Si no existe, el lanzador lo rechaza (no usar `sa`).
- Sin `--fps reales`, las cifras mostradas son ficticias aunque se use `--sap`.

## Pruebas de las barreras

```powershell
node --test tools/entorno_aislado/solo-lectura.test.js
dotnet run --project tools/entorno_aislado/guarda_tests
# API INNPACK: EntornoAisladoTests · apisapfaret: SoloLecturaTests
```
