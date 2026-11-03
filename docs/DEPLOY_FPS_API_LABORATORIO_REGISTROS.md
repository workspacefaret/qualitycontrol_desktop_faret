# Despliegue de fps-api: `GET /api/produccion/laboratorio/registros?np=`

Estado: **preparado, NO ejecutado**. Requiere autorización explícita del responsable y ejecución supervisada por una persona
(política de seguridad del proyecto: sin `-ExecutionPolicy Bypass`, sin recursos administrativos `c$`/`admin$`, sin ejecutar
scripts recién generados sin revisión, sin ofuscación).

## 1. Alcance (solo lectura, aditivo)
- Nueva función `obtenerRegistrosLaboratorioPorNp(np)` en `src/services/produccion.service.js`.
- Nueva ruta `GET /api/produccion/laboratorio/registros?np=` en `src/routes/produccion.routes.js`.
- No se modifica ninguna ruta ni función existente. Sin dependencias nuevas (no hay `npm install`). Consulta 100 % parametrizada.
- Devuelve por orden: Cliente, CodigoCliente, OrdenDeCompra, Formato (`Formato_Impresion` > patrón de `Obs3`; `null` si no hay dato),
  Sustrato (`Obs3`), GuiaTecnica (`Obs2`), NP Faret/Innpack con banderas de coincidencia. **FPS no entrega tipo de onda ni largo/ancho/alto
  nominales**: no existen como columnas; el desktop los pide a mano (dimensiones) o los deja manuales (tipo de onda).

## 2. Hashes SHA-256 (fuente de verdad: archivos locales verificados el 03-11-2026)
| Archivo | Versión nueva (a desplegar) | Versión anterior (esperada hoy en servidor) |
|---|---|---|
| `src/services/produccion.service.js` | `d3eeabcd62f6dbc5d99258076801d34be094a278770a3f4813ee1f2a9b88b7aa` | `e7bd39a1866e440016ab8faf303ef04252118ace2f9de71c5208c3ead3a5da77` |
| `src/routes/produccion.routes.js` | `accb85a39b9e2f325735a358ee9e289c67676ad65ec1803052be83dff1338dca` | `8dd53b3b9e8db0cbcd01f42a55cece7ea23b53a7590015360e4a89fd04ebcd82` |

Nota: el `INSTRUCCIONES.txt` de `fps-api/deploy-laboratorio-registros` listaba un hash antiguo del service (`ade1debc…`); quedó obsoleto
porque el service se ajustó después (prioridad de `Formato_Impresion`, formato `null` sin dato). **Este documento reemplaza esa tabla.**
La columna "anterior" debe **re-verificarse en el servidor en el momento del despliegue** (el servidor pudo cambiar desde el 03-11-2026).

## 3. Precondiciones (todas deben cumplirse; si alguna falla, NO desplegar)
1. Autorización explícita del responsable para tocar SRV-API / tarea `FpsApi`.
2. Ventana acordada (el reinicio de `FpsApi` interrumpe unos segundos Talleres Externos, Trazabilidad y Despachos Diarios).
3. `sha256` de los 2 archivos del paquete = columna "nueva" de arriba.
4. `sha256` de los 2 archivos actuales en el servidor = columna "anterior". Si difiere, detenerse y revisar la diferencia (otra sesión pudo desplegar algo).

## 4. Procedimiento (supervisado, comandos explícitos y de solo lectura salvo los pasos 3-5)
Carpeta del servicio: `C:\API WEB\api\fps-api` (tarea programada `FpsApi`, puerto 3002).
1. **Respaldo**: copiar los 2 archivos actuales a `C:\API WEB\api\fps-api\_backup_<aaaammdd_hhmmss>_laboratorio-registros\` respetando `src\services\` y `src\routes\`;
   calcular y anotar su SHA-256.
2. **Verificar** el hash de los archivos del respaldo = columna "anterior" (paso 4 de precondiciones).
3. **Copiar** los 2 archivos nuevos sobre los existentes (mismo path relativo).
4. **Verificar** el hash de lo copiado = columna "nueva".
5. **Reiniciar solo la tarea `FpsApi`** (Programador de tareas, desde la consola del servidor por una persona) y confirmar PID/StartTime nuevos del `node.exe`.
6. No tocar `.env`, `package.json` ni `node_modules`.

## 5. Pruebas de solo lectura posteriores (reemplazar `<API_KEY>` por el valor del `.env`; no registrarlo en logs ni repos)
```
curl -s -H "x-api-key: <API_KEY>" "http://localhost:3002/api/produccion/laboratorio/registros?np=22924"
curl -s -H "x-api-key: <API_KEY>" "http://localhost:3002/api/produccion/laboratorio/registros?np=4062"
curl -s -o NUL -w "%{http_code}" -H "x-api-key: <API_KEY>" "http://localhost:3002/api/produccion/laboratorio/registros?np=99999999"
curl -s -o NUL -w "%{http_code}" -H "x-api-key: <API_KEY>" "http://localhost:3002/api/produccion/laboratorio/registros?np=abc"
curl -s -o NUL -w "%{http_code}" "http://localhost:3002/api/produccion/laboratorio/registros?np=22924"
```
Criterios de aceptación:
- `np=22924` → `{"ok":true,...}` con `ordenes`, `procesos`, `registros`. Item 2: Emplacado 5 registros (uno con cantidad 0), Troquel 7, Corrugado 0.
- `np=4062` (NP Innpack de la misma orden) → misma orden y mismos registros.
- NP inexistente → 404; no numérico → 400; sin `x-api-key` → 401/403 (el que ya devuelve el resto de la API).
- Cada orden trae `Cliente`, `CodigoCliente`, `OrdenDeCompra`, `Formato`, `Sustrato`, `GuiaTecnica` (algunos pueden ser `null`: el desktop los deja editables).
- **Regresión (deben responder igual que antes del cambio)**: `procesos-por-np`, `registros-por-proceso`, `pilas-dimensionado`, `liberaciones`, `despachos`.
  Comparar contra una captura previa tomada en el paso 0 (antes de copiar).

## 6. Reversión
1. Copiar de vuelta los 2 archivos del respaldo.
2. Verificar hash = columna "anterior".
3. Reiniciar `FpsApi` y repetir las pruebas de regresión del punto 5.
Criterio para revertir: cualquier regresión, 5xx en las rutas existentes o `FpsApi` que no levante.

## 7. Después del despliegue
- Probar en el desktop (QCC) "Nueva Muestra" con NP 22924 (Faret) y 4062 (Innpack): la orden aparece, formato y antecedentes se completan,
  dimensiones nominales quedan editables.
- Registrar en `contex.md` fecha, hashes finales, PID del proceso y evidencia de las pruebas.
