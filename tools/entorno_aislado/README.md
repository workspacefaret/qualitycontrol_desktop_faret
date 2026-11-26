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
| fps-api | `ficticios`: sin base. `reales`: no arranca si el login tiene INSERT/UPDATE/DELETE/ALTER/CONTROL/EXECUTE/CREATE TABLE o un rol de servidor, en FPS **o** al otro lado de `CONEXIONSAP`, ni si desde SAP se puede volver por `CONEXIONFPS`. |
| apisapfaret | `SapServiceLayer:SoloLectura`: POST y DELETE se rechazan antes de salir (solo Login/Logout y GET). |

Con `--sap`, las consultas llegan al Service Layer real. Es solo lectura, pero abre sesiones con ese usuario SAP.

Ningún proceso hereda de la terminal variables con credenciales o destinos (`FPS_SQL_*`, `SQL_*`, `MYSQL_*`, `Database__*`,
`SapServiceLayer__*`, etc.): el SQL de FPS llega solo a fps-api y el usuario y clave de Service Layer solo a apisapfaret.

Actualizado el 25-11: si la base LocalDB ya existía, ejecutar `preparar.js --recrear` (cambió la migración 2026_12).

## Prueba con datos reales (solo lectura)

> **SUSPENDIDO desde el 26-11-2026.** En SAP-B1 (SQL Server 2019 15.0.2210.4) el lote `CREATE LOGIN` + `ALTER LOGIN
> DISABLE` produjo una excepción interna (`c000000d`, error 17310 severidad 20, Msg 596). La causa **no está
> determinada**. `qcc_sap_ro` quedó deshabilitada, sin usuarios ni asignaciones. Los scripts 1 y 2 están bloqueados.
> La clave usada quedó en el volcado: tratar esos archivos como secretos, conservarlos y no reutilizar la clave.
>
> **No continuar** hasta que el DBA o soporte revise el volcado y TI lo autorice. La continuación está en
> `acceso_lectura\continuacion_sapb1\`: `C0` (consulta, antes y después de cada paso) → `C1` clave → `C2` (una vez por
> vinculado) → `C3` (3 veces) → `C4` (3 veces) → `C5` (una vez por base) → `3a` → `C6` habilitar. Un archivo por vez,
> en ventana nueva, con `<<DUMPS>>` = total de volcados que informa `C0` **la primera vez**. Si cambia, hay un volcado
> nuevo: detenerse. Ante excepción, severidad ≥ 19, Msg 596 o corte de conexión: **detenerse, no reintentar y no
> ejecutar la reversa**. Una cuenta habilitada sin sus bloqueos heredaría la asignación general: habilitar solo con `C6`.
> Separar los pasos no garantiza que la excepción no se repita. La tabla siguiente queda como referencia.

Mientras tanto, validación parcial con la `fps-api` **de producción** (solo GET, requiere autorización de TI):
`node --use-system-ca tools/entorno_aislado/comparar_reales.js --produccion --np 4007`. Pide URL y clave (no se guardan).
Única URL admitida (`consulta-fps.js`): `https://api.faret.cl/fps/api/produccion`; solo GET y sin seguir redirecciones.
`--use-system-ca` usa los certificados de Windows; nunca desactivar TLS. Pruebas locales:
`node --test --test-concurrency=1 tools/entorno_aislado/consulta-fps.test.js` (con el entorno aislado cerrado: usa el
puerto 5293). Esa API es la versión del 24-11: despachos y documentos sin ítem se informan como `NO VALIDABLE`.

TI la ejecutó el 26-11 (85 coinciden, 7 difieren; matriz, "Décima iteración"). Para acreditar las causas, con nueva
autorización y tras revisar el script: `node --use-system-ca tools/entorno_aislado/evidencia_diferencias.js`
(un GET a cada una de 4123, 4162 y 4190; guarda documentos, folios y corridas, sin nombres).

1. **Una vez, con `AD\Administrador`** (lo ejecuta la persona autorizada, en SSMS, scripts de `acceso_lectura\`;
   revisar con Ctrl+F5 antes de ejecutar; las claves se reemplazan en la ventana y **no se guarda** el archivo):

   | Orden | Servidor | Script | Resultado esperado |
   |---|---|---|---|
   | 1 | SAP-B1 | `1_sapb1_crear_qcc_sap_ro.sql` (`<<CLAVE_SAP_RO>>`) | `OK: qcc_sap_ro habilitado.` |
   | 2 | SAP-B1 | `3a_auditar_admin.sql` | todos los vinculados `BLOQUEADO` |
   | 3 | SAP_NEW | `2_sapnew_crear_qcc_fps_ro.sql` (`<<CLAVE_FPS_RO>>`, `<<CLAVE_SAP_RO>>`) | `OK: qcc_fps_ro habilitado.` |
   | 4 | SAP_NEW | `3a_auditar_admin.sql` | `CONEXIONSAP` = `SOLO LECTURA`; el resto `BLOQUEADO` |

   Después, **con las cuentas nuevas** (sin `-P`, pide la clave; ejecutar desde la carpeta `acceso_lectura` copiada al
   servidor). Escrituras, roles y rutinas ejecutables en 0; ningún `FALLA` ni `REVISAR`:

   ```powershell
   sqlcmd -S SAP-B1 -d master -U qcc_sap_ro -b -W -s "|" -i .\3b_comprobar_como_cuenta.sql
   sqlcmd -S SAP_NEW -d FPS_PRODUCCION -U qcc_fps_ro -b -W -s "|" -i .\3b_comprobar_como_cuenta.sql
   ```

   Si algo no coincide: no iniciar el entorno. Reversa: `4_reversa_sapnew.sql` y después `4_reversa_sapb1.sql`.
   No se modifican las asignaciones generales ni otras cuentas. **Un servidor vinculado creado después heredará la
   asignación general:** repetir `3a`. Las tablas y columnas concedidas salen de las rutas activas de `fps-api`; una
   consulta nueva exige actualizar los scripts. `login_lectura_fps.sql` quedó obsoleto.
2. En el PC, desde la raíz del repositorio:

   ```powershell
   node tools/entorno_aislado/preparar.js --recrear
   node tools/entorno_aislado/iniciar.js --fps reales     # servidor 192.168.1.230, usuario qcc_fps_ro
   ```

   En otra terminal, las consultas reales de todas las rutas (0 fallas): `node tools/entorno_aislado/probar_consultas.js 4007`.
   Las mermas, cierres y certificados siguen escribiéndose solo en LocalDB.
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
