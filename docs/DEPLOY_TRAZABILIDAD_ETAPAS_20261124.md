# Despliegue — Trazabilidad integral, etapas 1-7 (INNPACK) · versión 1.8.40

Preparado el 24-11-2026. **No ejecutado: requiere autorización expresa.** Base: `docs/OPERACION_DESPLIEGUE_QCC.md` y `.claude/DEPLOY_POLICY.md`.
Paquete: `C:\Installers\Deploy_Trazabilidad_Etapas_20261124\` (manifiesto `MANIFIESTO_SHA256.txt`; verificar hashes antes de copiar).
Todo es **aditivo y solo lectura** salvo 2 columnas nuevas en `np_cierre`. Solo INNPACK: FARET no se toca.

## Qué cambia y de qué depende

| # | Componente | Archivos | Cambio | Si se despliega sin el resto |
|---|---|---|---|---|
| 1 | SQL `calidad_db` (DBA) | `sql\2026_11_calidad_np_mermas_cierre_destruccion_evidencia.sql` | `np_cierre.evidencia_json`, `evidencia_sha256` (nullable, idempotente) | Sin esto la API nueva falla al guardar un cierre (INSERT con columnas) |
| 2 | API INNPACK (SRV-API, pool `QualityControlInnpackPool`) | `api-innpack\QualityControlInnpack.Api.dll/.pdb` (commits `81dede1` + `e7daa2c`, rama `feature/trazabilidad-integral-etapas`) | cierre con evidencia + huella SHA-256; `GET api/no-conformidades/por-np` | Antiguas: el cierre se guarda sin evidencia; NC por NP → "No disponible" |
| 3 | apisapfaret (SRV-API, app `/apifaret`) | `apisapfaret\apifaret.dll/.pdb` (commit `72637d7`, rama `feature/adjuntos-documentos-venta`) | `GET api/documentos-adjuntos/{tipo}/{docEntry}` y `/{linea}/archivo` (scope `logistica:read`, solo GET) | Botón "Ver PDF" muestra error; el resto funciona |
| 4 | fps-api (SRV-API, tarea `FpsApi`) | `fps-api\src\services\trazabilidad.service.js` (1 archivo) | resolución de NP/OT, estado por fuente, entradas a bodega (SAP), turnos, `ultimoDespacho/ultimaLiberacion` | Sin esto: Trazabilidad no muestra entradas ni turnos (No disponible) |
| 5 | Photino 1.8.40 | `QualityControlCenter_Setup_v1.8.40.exe` | las 4 pantallas, acciones nuevas `trazabilidad.noConformidades` / `adjuntosSap.*` | — |

Orden obligatorio: **1 → 2 → 3 → 4 → 5**, y `latest.json` al final (recién cuando 1-4 estén validados). Los pasos 3 y 4 son independientes entre sí.
Hashes de producción previos conocidos: `trazabilidad.service.js` = `C3429E29674203F6F2BEDE730A041B90A65DD739C6148EF1A246D5EAB238CCA6` (respaldo local `fps-api\respaldo_pre_etapas_20261124\`). Para las dos DLL, **antes de copiar** comparar la DLL de producción con una compilación local del commit desplegado anterior (técnica de metadatos); si no coinciden, detenerse: alguien cambió producción.

## Procedimiento (una persona autorizada; WinRM por hostname, sin `c$`, sin `ExecutionPolicy Bypass`)

Para cada API: (a) respaldo con hash de lo que se va a reemplazar en `C:\API WEB\_backups\<componente>_pre_trazabilidad_<fecha>`, (b) copiar el paquete a un staging del servidor y verificar hashes = manifiesto, (c) cortar **solo** lo afectado (pool `QualityControlInnpackPool` / app `/apifaret` / tarea `FpsApi`; recordar que Node tarda ~75 s en abrir el puerto), (d) copiar solo DLL+PDB (o el `.js`), (e) levantar y comprobar. No tocar `appsettings*.json` ni `web.config`.

1. **SQL** — el DBA ejecuta el script (respaldo `COPY_ONLY` previo según `docs/OPERACION_DESPLIEGUE_QCC.md`). Comprobar: `SELECT name FROM sys.columns WHERE object_id = OBJECT_ID('np_cierre') AND name LIKE 'evidencia%'` → 2 filas.
2. **API INNPACK** — reemplazar DLL+PDB; reciclar solo `QualityControlInnpackPool`.
3. **apisapfaret** — reemplazar DLL+PDB; reciclar solo el pool de `/apifaret`. Requiere que la clave del consumidor Desktop tenga scope `logistica:read` (ya lo tiene: Despachos Diarios).
4. **fps-api** — reemplazar `src\services\trazabilidad.service.js`; reiniciar solo la tarea `FpsApi`.
5. **Desktop** — publicar instalador al share de updates, **comparar antes** el número de versión con el `latest.json` real del share (hoy 1.8.39), hash verificado local = share, backup de `latest.json`, y recién entonces activar.

## Pruebas después del despliegue

- fps-api (con clave real, la ejecuta una persona, ver `docs/PRUEBA_AUTENTICADA_FPS_TRAZABILIDAD.ps1`): NP 4171 → `entradas.ingresadoPorItem` = 279.000 (código `4723011500152`), `turnos` con A/B/C; NP 3951 → ingresado 4.356.234 = liberado = despachado; NP sin OT en FPS (p. ej. 3000) → `entradas` vacío con `estado SIN_DATOS`.
- apisapfaret: `GET api/documentos-adjuntos/factura/23278` → 1 adjunto `FC 21-09 INNPACK.pdf`; `.../factura/23278/1/archivo` → PDF de 645.476 bytes (empieza `%PDF`); `guia/999999` → 404 `DOCUMENTO_NO_ENCONTRADO`; `otro/1` → 400.
- API INNPACK: `GET api/no-conformidades/por-np?np=4171` → 200; `np=abc` → 400. Cerrar una NP de prueba y comprobar `evidenciaSha256` de 64 caracteres.
- Desktop: Trazabilidad con 4171 y 3951 (pestañas, indicadores, filtros, "Ver PDF"); Cierre de una NP con cierre previo muestra "Sin movimientos posteriores"; Balance, Certificados y los 4 dashboards abren; un módulo FARET cualquiera abre (regresión).

## Reversión

| Componente | Cómo revertir |
|---|---|
| Desktop | Restaurar `latest.json` desde el backup (los equipos que ya actualizaron conservan 1.8.40: es compatible con las APIs anteriores, mostrando "No disponible" donde falte el dato nuevo). |
| fps-api | Copiar de vuelta el `.js` del respaldo (hash `C3429E29…`) y reiniciar `FpsApi`. |
| apisapfaret / API INNPACK | Cortar el pool, restaurar DLL+PDB del respaldo (hash verificado), levantar. |
| SQL | No revertir automáticamente: las columnas son nullable y la API anterior las ignora. Solo con orden expresa: `sql\..._evidencia_rollback.sql` (borra la evidencia ya guardada). |

## Riesgos conocidos / pendientes

- Las entradas a bodega se vinculan por NP con `IGN1.U_NumOT` (en SAP INNPACK esa columna guarda la **NP** en entradas y la **OT** en salidas: verificado con datos reales). Una entrada con ítem fuera de la NV se lista pero no suma. Si Faret cambiara esa convención de digitación, el total de "Ingresado" podría quedar incompleto.
- Existencia actual de producto terminado **por NP**: no existe relación verificable en SAP (el stock es por artículo/bodega, compartido con otras NP); la pantalla lo declara "No disponible".
- Turnos: estimados por la hora de inicio de la corrida (A 07-15, B 15-23, C 23-07), igual regla que la Evaluación por Operador.
- Adjuntos: solo se abre lo que el Service Layer entrega (tope 25 MB); si SAP lista un archivo cuya ruta compartida no existe, se informa "archivo no disponible".
- El instalador no está firmado ni probado en un equipo limpio; la actualización automática se confirma en un cliente real tras publicar.

## Resultado del despliegue (24-11-2026) — pasos 1-4 EJECUTADOS, piloto y `latest.json` PENDIENTES

- **1 SQL:** ejecutado por el usuario (AD\Administrador, SAP_NEW 192.168.1.230): respaldo COPY_ONLY + VERIFYONLY OK; `evidencia_json` (max_length -1) y `evidencia_sha256` (64) verificados. No repetir.
- **2 API INNPACK (14:43):** respaldo `C:\API WEB\_backups\innpack_pre_trazabilidad_20261124_144321`; DLL `73235C96…1FE2B`, PDB `6DF23022…ADA56`; pool `Started`, 24/24, health 200.
- **3 apisapfaret (14:44):** respaldo `C:\API WEB\_backups\apifaret_pre_adjuntos_20261124_144356`; DLL `53DCCE1B…A7B1` (compilada con SDK 9.0.318: con SDK 10 difiere de producción en 2 métodos ajenos), PDB `A1B7500A…2342`; `ApiFaretPool` `Started`.
- **4 fps-api (14:44):** respaldo `C:\API WEB\_backups\fps-api_pre_etapas_20261124_144431`; `trazabilidad.service.js` `6AA23A83…A7F8`; tarea `FpsApi` Running, PID 12588, health 200.
- **Prueba autenticada de fps-api:** ejecutada por el usuario, todo 200.
- **Pendiente:** piloto manual del instalador 1.8.40 (SHA-256 `1239ea67…aa98`) con regresión FARET, y solo después publicar en el share y activar `latest.json` (hoy 1.8.39, no tocado).
