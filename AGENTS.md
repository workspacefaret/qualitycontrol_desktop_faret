# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Reglas de trabajo (modo seguro)

El propietario de este repo trabaja en **modo seguro**. Respeta estas reglas en todo momento:

1. **No modifiques archivos sin aprobación explícita.**
2. Antes de cambiar algo, **analiza el problema**.
3. Entrega primero un **plan** con: archivos que cambiarías, motivo del cambio, riesgo y cómo probarlo.
4. **Espera la aprobación** antes de implementar.
5. Implementa **solo un paso a la vez**.
6. Después de cada cambio, **resume exactamente qué modificaste**.
7. **No agregues dependencias nuevas** sin aprobación.
8. **No hagas refactor general.**
9. **No renombres archivos ni carpetas** salvo que se apruebe.
10. **Mantén el estilo actual del proyecto.**

# Comunicación

- Responder siempre en español.
- Ser breve y directo.
- No hacer cambios sin aprobación.
- Explicar el plan antes de implementar.
- Implementar un paso a la vez.
- Mantener la arquitectura existente.
- No introducir sobreingeniería.

## What this is

Quality Control Center (QCC) is a **Photino.NET desktop app** (.NET 8, `WinExe`). It's the
admin/management panel for an industrial quality-control platform; plant operators feed data in
through a separate Flutter mobile app that writes to the same MySQL `calidad` database. QCC is
read/admin-oriented: dashboards, KPIs, record validation, user management, Excel export.

The C# backend and a vanilla-JS SPA frontend run in the same process. There is no web server — the
frontend talks to the backend over the Photino JS↔C# message bridge. UI text, identifiers, and DB
columns are in Spanish.

## Commands

```bash
dotnet run                 # build + launch the desktop window (dev)
dotnet build               # compile only
dotnet tool restore        # one-time: install csharpier (pinned in .config/dotnet-tools.json)
dotnet csharpier .         # format all C# (the repo's formatter — run before committing C#)

# Publish a self-contained build (note: README's example targets osx-x64; use win-x64 for Windows)
dotnet publish -c Release -r win-x64 --self-contained true
```

There is no test suite, linter for JS, or package manager for the frontend (libs are vendored in
`src/UI/www/libs` or pulled from CDNs in `index.html`).

**`tools/` gotcha**: `tools/` (e.g. `tools/faret_importer/`) holds standalone console projects, not
part of the app. `QualityControlCenter.csproj` explicitly excludes `tools/**` from its default
`Compile`/`None`/`EmbeddedResource` globs — without that exclusion, the SDK's recursive `**/*.cs`
glob pulls in any `Program.cs` under `tools/` and it can silently steal the entry point (this broke
`dotnet run` once: it printed a stray `Hello, World!` and exited instead of launching the Photino
window). If you add another standalone tool under a new top-level folder, exclude it the same way.

## Request flow (the core architecture)

Every frontend→backend interaction is one JSON message routed by a string `action`:

```
JS controller → window.PhotinoBridge.send({action, data})   (src/UI/www/index.html)
  → window.external.sendMessage(JSON)                        Photino bridge
  → Program.cs RegisterWebMessageReceivedHandler             unwraps {id, payload}
  → MessageRouter.Handle(payload)                            dispatch by action prefix
  → <Module>Handler.Handle(action, data)                    switch on exact action
  → <Module>Service / Repository                             business logic + SQL
  → MySQL (DbService.GetCalidadConnection)
```

The response is correlated back to the JS `Promise` by the numeric `id` (`PhotinoBridge._callbacks`).

**Routing convention** (`src/Backend/Services/MessageRouter.cs`): the router matches on the
action *prefix* (e.g. `action.StartsWith("usuarios")`) and constructs a fresh handler per request
(except `AuthHandler`, which is a singleton built in `Program.cs` because it holds the session).
Actions follow `modulo.accion` (e.g. `usuarios.list`, `registrosControl.create`). `excel.guardar`
is a special-cased action handled directly in the router.

**Response contract**: handlers return a JSON *string* shaped `{ ok, data, error }`. The router's
`NormalizeResponse` rewrites it to `{ ok, success, data, error }` (camelCase) before sending. When
adding a handler, mirror the `Ok(...)` / `Error(...)` helpers in `UsuariosHandler.cs` rather than
inventing a new shape.

## Adding a backend module

1. Create `src/Backend/Modules/<Name>/` with `<Name>Handler.cs` (+ `Service`, `Repository`,
   `Models` as needed). The handler exposes `Task<string> Handle(string action, Dictionary<string,object> payload)`
   and switches on the exact action.
2. Register a prefix branch in `MessageRouter.Handle` and add the `using` for the module namespace.
3. Repositories take `DbService` and call `GetCalidadConnection()` (MySqlConnector). See
   `src/Backend/Repositories/` and per-module `*Repository.cs` for query patterns.

`DbService` deliberately **blocks all non-`calidad` connections** — `GetSapConnection`,
`GetBinsConnection`, etc. throw `LegacyDbBlocked`. This is intentional isolation carried over from a
larger logistics system; don't "fix" those by wiring them up. The `BinsPrint` module and the
`Microsoft.Data.SqlClient` / SAP references are similar legacy remnants not wired into the router.

## Adding a frontend module

Frontend modules live in `src/UI/www/modules/<name>/` as `<name>.view.html` +
`<name>.controller.js`. `core/app.js` (`App.loadModule`) loads them **dynamically via synchronous
XHR**, injects the HTML into `#app-content`, and `eval`s the controller by appending a `<script>`.

- The controller must be assigned to `window.<PascalCaseName>Controller` (kebab → PascalCase, e.g.
  `maquinas-seguimiento` → `MaquinasSeguimientoController`) and expose `init()` and optionally
  `destroy()` (called before navigating away).
- Sidebar nav buttons use `data-module="<name>"`; home cards use `data-module-target`.
- Auth/session state lives in `sessionStorage` + `localStorage` (`lcc_*` keys for "remember me").
  Role gating (`admin` / `admin_ti`) is enforced both client-side (`refreshSidebarState`) and
  server-side (`UsuariosHandler.IsAdmin`).
- `shared/baseController.js`, `shared/eventBus.js`, `shared/utils.js` exist but are currently empty.

## Fallback histórico (Laboratorio y Producción, solo INNPACK)

Los módulos `Laboratorio` y `RegistrosProduccion` calculan su resumen sobre una ventana de fecha
por defecto cuando el usuario no filtra explícitamente (`BuildFiltros` en cada
`*Repository.cs`): **30 días** en Laboratorio, **6 días** en Producción. Si esa ventana no tiene
datos (lista principal vacía en Laboratorio / `ControlesPeriodo == 0` en Producción) y el usuario
no puso fechas, `ObtenerResumen` vuelve a consultar **sin restricción de fecha** (todo el
histórico, respetando el resto de filtros como ensayo/inspector/turno/proceso) y marca la
respuesta con `MostrandoHistorico = true` + `FechaUltimoRegistro` (dato del registro más reciente
encontrado). El frontend (`laboratorio.controller.js` / `registros-produccion.controller.js`,
método `renderHistoricoBanner`) muestra un banner ("Sin datos recientes. Mostrando resumen
histórico completo...") cuando ese flag viene en `true`; no hay CSS nuevo, el banner reutiliza la
clase `.card` con estilos inline. Los KPIs fijos a "hoy" (`EnsayosHoy` en Laboratorio;
`ControlesHoy`, mermas, observaciones en Producción) **no** entran en modo histórico, siempre
muestran el dato estricto de hoy — decisión explícita del usuario. En Producción,
`CumplimientoGeneral` sí se recalcula sobre el histórico cuando se activa el fallback (también
decisión explícita, ver el detalle en `contex.md`, sección "Fallback histórico INNPACK"). Esto es
exclusivo de INNPACK — no toca nada de Faret.

## Exportación Excel completa (todos los módulos con exportador, solo INNPACK)

`ExcelExporter.exportTable` (`core/excel-exporter.js`) arma el workbook leyendo **solo las filas
visibles del DOM** (`row.offsetParent !== null`), es decir, exporta exactamente lo que se ve en
pantalla en ese momento. Como varias tablas de INNPACK están capadas por rendimiento (`LIMIT` fijo
en SQL) o paginadas, exportar "tal cual" podía dejar registros fuera sin que el usuario lo notara.
Regla acordada: **si el usuario no aplicó filtros, la exportación debe traer el histórico completo
que cumple las condiciones (todas las páginas/todo el límite); si hay filtros activos, se mantiene
el comportamiento anterior** (exporta la tabla visible tal cual está renderizada).

Estado por módulo (revisar antes de tocar el exportador de cualquiera):

- **`registros-control`** (Registros de Control): ya traía este patrón implementado de fábrica.
  `exportarRegistrosControl()` revisa `hayFiltrosActivos()`; si hay filtros exporta
  `#tablaRegistrosControl` visible; si no hay filtros, vuelve a pedir `registrosControl.
  obtenerRegistros` con `limit: this.total || 999999`, arma una tabla temporal oculta
  (`exportarRegistrosDesdeDatos`) y la exporta. Sin cambios.
- **`usuarios`**: `usuarios.list` no pagina ni limita — siempre exporta el listado completo. Sin
  cambios.
- **`dashboard` (Dashboard Calidad) / `registros-produccion` (Dashboard Producción)**: el botón
  exporta la tabla de "Desempeño individual por inspector" (`tablaDashboardDesempeno` /
  `tablaProduccionDesempeno`), que es un `GROUP BY u.id` sin `LIMIT` — siempre completa. La tabla
  "Últimos registros" (con `LIMIT 15` en el backend, un widget de "últimos N", no una lista
  paginada) no está conectada al botón de exportar, así que no aplica. Sin cambios.
- **`laboratorio`**: la tabla exportada (`#tablaLaboratorio`) sale de `laboratorio.obtenerResumen`,
  cuyo `CargarRegistros` tenía `LIMIT 300` fijo. Se agregó un parámetro `sinLimite` de extremo a
  extremo (`LaboratorioRepository.CargarRegistros(..., limitar)` → `LaboratorioService.
  ObtenerResumen(..., sinLimite)` → `LaboratorioHandler` lee `sinLimite` del payload con un nuevo
  helper `GetBool`). El frontend (`exportarLaboratorio()`) revisa `hayFiltrosActivos()` (fecha/
  ensayo/material): con filtros exporta la tabla visible igual que antes; sin filtros pide el
  resumen con `sinLimite: true`, arma una tabla temporal (`exportarRegistrosLaboratorioDesdeDatos`)
  con **todos** los registros y la exporta.
- **`maquinas-seguimiento`**: la tabla exportada (`#tablaMaquinasSeguimiento`) sale de
  `maquinasSeguimiento.obtenerResumen`, con `LIMIT 100` fijo sobre los registros de la máquina
  seleccionada. Mismo patrón: `MaquinasSeguimientoRepository.ObtenerResumen(maquinaId, sinLimite)`
  omite el `LIMIT` cuando `sinLimite=true`; `MaquinasSeguimientoHandler` lee ese flag del payload.
  Este módulo no tiene filtros propios más allá de la máquina seleccionada (no hay fechas/turno),
  así que `exportarMaquinasSeguimiento()` siempre pide el set completo de la máquina elegida con
  `sinLimite: true` (no existe un caso real de "exportación filtrada parcial" distinto de la
  máquina ya elegida).

En los tres módulos que sí cambiaron, la vista en pantalla **no se modificó** — sigue mostrando
como máximo 300/100 filas por rendimiento; solo el flujo de exportación bypassa ese tope cuando no
hay filtros. Esta parte (el bypass de `LIMIT` vía `sinLimite`) es exclusiva de INNPACK. El botón de
exportar en sí se replicó después también en Faret con un mecanismo distinto — ver "Exportación
Excel en Faret" más abajo, dentro de la sección Faret.

## Merma real por registro y KPIs de merma (solo INNPACK)

El módulo **"Mermas Innpack"** (`mermas-innpack`, backend `Modules/Mermas/*`) fue **eliminado** a
pedido del usuario — leía de la tabla `registro_mermas` (join con `registros_control` vía
`registro_id`), una fuente separada que no aportaba el dato que realmente se quería ver junto a
cada registro.

### Columnas reales de merma en `registros_control` (confirmado con `INFORMATION_SCHEMA` + datos reales)

`registros_control` tiene **5** columnas relacionadas con merma, pero solo 3 están realmente
pobladas por la app móvil:

- `requiere_merma` (`tinyint(1)`) — **el flag real** que marca si el registro tiene merma. Es la
  condición correcta para filtrar (`WHERE requiere_merma = 1`).
- `tipo_merma` (`varchar(150)`) — texto libre con el **nombre del proceso/etapa** donde ocurrió la
  merma (valores reales observados: `Pegado`, `Emplacado`, `Producto Terminado`, `Troquelado`...).
  **No es una categoría fija tipo "Insumos"/"Proceso"** — es un dato descriptivo por registro, sin
  un enum cerrado conocido.
- `cantidad_merma` — **`DECIMAL(10,2)` nativo** (no texto), se puede sumar directo
  (`SUM(cantidad_merma)`) sin `CAST`/`REPLACE` ni preocuparse por coma decimal.
- `merma_insumos_desponche_bobinas` / `merma_proceso_monotapas` (`DECIMAL(10,2)` cada una) —
  **columnas muertas**: existen en el esquema pero la app móvil actual **nunca las llena** (siempre
  `NULL`), confirmado consultando la BD real. No usarlas para nada nuevo.

**Nota histórica**: una versión anterior de este documento decía que `requiere_merma`/`tipo_merma`/
`cantidad_merma` "no se usan en ningún lado" y que el dato real venía de
`merma_insumos_desponche_bobinas`/`merma_proceso_monotapas`. Eso **ya no es así** — se confirmó con
consultas reales que es exactamente al revés: las columnas dedicadas están muertas y
`requiere_merma`/`tipo_merma`/`cantidad_merma` sí traen datos reales de la app móvil. Si vuelves a
tocar algo de merma, no confíes en documentación vieja — confirma contra la BD primero.

### Columnas por fila (Data, Inspecciones Calidad, Inspecciones Producción)

Los 3 módulos con tabla de "registros"/"últimos registros" — `dashboard` (Inspecciones Calidad),
`registros-produccion` (Inspecciones Producción) y `registros-control` (Data) — muestran
`tipo_merma`/`cantidad_merma` **por fila**, sin agregación, en dos columnas ("Cantidad Merma" /
"Detalle Merma") ubicadas después de "Observación" y antes de "Estado Validación". Cambio solo de
lectura: no se tocó ningún INSERT/UPDATE, filtro, ni la lógica de validación.

Archivos: `DashboardModels.cs`/`DashboardRepository.cs` + `dashboard.view.html`/`.controller.js`;
`RegistrosProduccionModels.cs`/`RegistrosProduccionRepository.cs` +
`registros-produccion.view.html`/`.controller.js`; `RegistroControlItem.cs`/
`RegistrosControlRepository.cs` + `registros-control.view.html`/`.controller.js` (acá también se
actualizó la tabla temporal oculta que arma `exportarRegistrosDesdeDatos` para la exportación "sin
filtros", con las mismas 2 columnas). `colspan` de las filas de estado (`Cargando...`/`Sin
registros`/`Error`) quedan en 17/17/16 según la cantidad real de columnas de cada tabla.

### KPIs agregados de merma (Inicio, Inspecciones Calidad, Inspecciones Producción)

- **`inicio`** (Home INNPACK): el KPI "Merma Total (Hoy)" y el gráfico donut "Merma por proceso
  (hoy)" (`chart-merma-proceso`) leían de la tabla muerta `registro_mermas` (la misma fuente vieja
  que usaba el módulo "Mermas Innpack" eliminado) — nunca traían dato real. `HomeService.cs`
  (`ObtenerKpis`, `ObtenerMermaPorProceso`) se corrigió para sumar `registros_control.cantidad_merma`
  filtrando `requiere_merma = 1`, agrupado por `proceso_id` para el gráfico (con `HAVING total > 0`
  para no listar procesos sin merma).
- **`dashboard`** (Inspecciones Calidad) y **`registros-produccion`** (Inspecciones Producción):
  tenían dos campos `MermaInsumosHoy`/`MermaProcesoHoy` calculados con un `CASE WHEN tipo_merma =
  '...'` que comparaba contra dos strings inventados (`'Insumos - Desponche de bobinas'` /
  `'Proceso - Merma por monotapa'`) que **nunca existieron en los datos reales** — la suma siempre
  daba 0. Además, ninguno de los dos campos estaba conectado a ningún `view.html`/`controller.js`
  (confirmado con grep, KPI muerto en el backend). Como no existe ninguna forma real de distinguir
  "Insumos" de "Proceso" en `tipo_merma` (son nombres de proceso, no una categoría binaria), se
  consolidaron en un único campo real `MermaHoy` (`SUM(cantidad_merma)` con `requiere_merma = 1` y
  filtro de área existente, CALIDAD/PRODUCCION) en vez de mantener una separación ficticia.

Todo este bloque (columnas por fila + KPIs) se verificó con consultas de solo lectura reales contra
la BD `calidad` (arnés C#/MySqlConnector temporal fuera del repo, mismo patrón que otros pasos de
diagnóstico), no solo con `dotnet build`.

## Control Documental (INNPACK y Faret — dato 100% compartido)

Módulo de gestión documental (protocolos/procedimientos/instructivos/registros, con historial real
de versiones — algo que el Excel original `Matriz Control Documental REG-SGI-MCD-V10.xlsx` nunca
tuvo, cada fila del Excel se pisaba al actualizar). Detalle completo del análisis del Excel, las
decisiones de MVP y las preguntas resueltas con el usuario está en `contex-control-documental.md`
(archivo dedicado, no se repite acá). Resumen de la arquitectura y de los dos fixes reales
encontrados:

- **Tablas** (BD `calidad`, sin tocar nada existente): `documentos` (identidad estable —
  `codigo_base` — separada de la versión, a diferencia del Excel donde el código incluye la
  versión) y `documento_versiones` (historial append-only: nunca se pisa ni se borra una versión
  previa, solo se desmarca `es_version_vigente`). `documentos.alcance_empresa` es
  `ENUM('INNPACK','FARET','AMBAS')` — pensado **desde el diseño original** para que ambas empresas
  convivieran en la misma tabla, aunque al principio (Etapas 1-3) el módulo solo tenía frontend en
  INNPACK.
- **Backend**: `src/Backend/Modules/ControlDocumental/ControlDocumentalHandler.cs` +
  `src/Backend/Repositories/ControlDocumental/ControlDocumentalRepository.cs`, acciones
  `controlDocumental.list/get/create/update/version.crear/eliminar/adjunto.subir/adjunto.abrir`,
  mismo patrón que `NoConformidadesHandler.cs` (`Ok()`/`Error()`, `TryGetString/Int`, filtros
  dinámicos sin catálogo propio). Registrado en `MessageRouter.cs` (rama `controlDocumental`).
- **Eliminar (borrado lógico) y Adjuntos reales (Paso 51 en `contex.md`, 2026-08-10)**: columna
  `documentos.eliminado` (nunca `DELETE` físico, mismo criterio que el resto del sistema) y tabla
  nueva `documento_adjuntos` (`LONGBLOB`, `UNIQUE(documento_version_id)` — un adjunto por versión,
  reemplazable). Sin gating de rol (el módulo nunca tuvo ninguno). El adjunto (Word/PDF/imagen, máx.
  10 MB, validado en el backend) vive en la **tabla principal** de documentos (Ver/Adjuntar/
  Reemplazar sobre la versión vigente) y se puede subir al **crear** un documento o al **agregar una
  versión nueva** (en la misma transacción) — deliberadamente NO dentro de "Ver/Editar → Historial
  de versiones" (ahí vivió en una primera pasada, se movió a pedido del usuario). Imágenes/PDF se
  previsualizan embebidos (`data:` URI, WebView2 renderiza PDF nativo); Word se escribe a una
  carpeta temporal y se abre con `Process.Start` (mismo patrón que `UpdateService` para el
  instalador). Replicado igual en `control-documental` (INNPACK) y `faret-control-documental`.
- **Bug real encontrado y corregido**: `ControlDocumentalRepository.Listar()` armaba el SQL
  concatenando las columnas extra de la versión vigente (`v.version AS version_vigente`, ...)
  **después** de `DocumentoSelectSql`, que ya terminaba en `"...FROM documentos d"`. Eso generaba
  `FROM documentos d, v.version AS version_vigente, ...` — MySQL interpreta `v.version` (tras la
  coma en el `FROM`) como `esquema.tabla`, es decir intenta resolver `v` como **nombre de base de
  datos**, de ahí el error real `"Unknown database 'v'"` (reproducido primero con una consulta
  read-only vía `pymysql` contra la BD real antes de tocar el código). Por eso el listado nunca
  traía datos aunque `create`/`get` sí funcionaban (esos métodos no tenían el bug). Fix: las
  columnas de versión se agregan ahora al `SELECT` **antes** del `FROM`, no después. Si se vuelve a
  tocar este método, cuidado con reintroducir el mismo patrón de concatenación.
- **Faret: módulo replicado como excepción deliberada a "Faret nunca toca MySQL directo"**. La
  regla general (ver más abajo, sección Faret) existe porque los datos de Faret viven en sistemas
  remotos que el desktop no controla (`qualitycontrolfaret`, `mejora-continua`, o tablas Faret
  dentro de `calidad` como `registros_calidad_faret`). Control Documental es un caso distinto: las
  tablas `documentos`/`documento_versiones` no pertenecen a ningún backend Faret — son tablas que
  este mismo proceso desktop administra directamente vía `DbService.GetCalidadConnection()`, y el
  usuario pidió explícitamente que el dato fuera **común/compartido** entre ambas empresas, no
  duplicado. Por eso `src/UI/www/modules/faret-control-documental/` (módulo Faret distinto,
  `FaretControlDocumentalController`, prefijo de ids/clases `fcd-` para no chocar con el `cd-` de
  INNPACK ya que ambos CSS quedan cargados a la vez) llama **directo** a las mismas acciones
  `controlDocumental.*` — sin pasar por `FaretHandler.cs`, sin nueva `FaretApiService`, sin tocar
  ninguna de las 3 APIs Faret ni el repo `quality_control/backend`. Cualquier documento creado
  desde un lado aparece también en el otro. Botón de sidebar `data-module="faret-control-documental"
  data-empresa="FARET"` sin gating de rol (visible para todos los roles Faret, a pedido explícito
  del usuario) — no se tocó `refreshSidebarState`. Si en el futuro se necesita que Faret filtre o
  restrinja este módulo por rol, hay que agregarlo ahí explícitamente.
- **Precedente distinto (no confundir)**: el módulo "Talleres Externos" (`talleres-externos` /
  `faret-talleres-externos`) se ve visualmente parecido pero es la arquitectura opuesta — cada
  empresa tiene **sus propias tablas separadas** (`talleres_externos_trabajos` en `calidad` para
  INNPACK vs. tablas propias en `qualitycontrolfaret` para Faret, vía `FaretTalleresExternosApiService`
  y REST). Control Documental es el único módulo con dato genuinamente compartido en una sola tabla.

## Fix: tarjetas KPI de Inicio (INNPACK) no navegaban al hacer clic

`inicio.controller.js` (`bindModuleCards()`) usaba `window.app?.loadModule` (minúscula) para las 4
tarjetas KPI superiores (`data-module-target`, ej. "Controles Hoy" → `registros-control`) — el
global real que expone `core/app.js` es `window.App` (mayúscula, confirmado con grep, solo existe
esa variante). Como es optional chaining, no lanzaba error visible en consola; las tarjetas
simplemente no hacían nada al clic. El resto del módulo (`renderAlertas`, botón "Gestionar") ya
usaba `window.App` correctamente. Corregido (una palabra, 2 líneas). El mismo bug exacto sigue
presente en `faret/faret.controller.js:21` (Inicio de Faret) — no se tocó porque no fue pedido,
pero si se reporta que las tarjetas de Inicio Faret tampoco navegan, es el mismo fix.

## Versión 1.7.7 (release que incluye lo de arriba)

Sube de 1.7.6 → 1.7.7 (`QualityControlCenter.csproj` + `installers/QualityControlCenter.iss`,
ambos siempre juntos) porque este release toca `src/UI/www/**` (módulo `faret-control-documental`
nuevo + botón de sidebar + fix de `inicio.controller.js`). Generado con el flujo estándar:
`dotnet publish -c Release -r win-x64 --self-contained true` → `"C:\Program Files (x86)\Inno Setup
6\ISCC.exe" installers/QualityControlCenter.iss` → `C:\Installers\QualityControlCenter_Setup_v1.7.7.exe`.
Igual que en releases anteriores, subir el instalador y actualizar `latest.json` en el share queda
a cargo del usuario (no se hizo desde acá) — recordar el gotcha del Paso 43 (JSON en una sola línea,
sin saltos crudos) si se ayuda a editarlo.

## Reposición/destrucción y familia de producto en No Conformidades (INNPACK y Faret, Paso 49)

A pedido explícito del usuario, aplicado en **ambas** tablas tipo-PNC (`no_conformidades` INNPACK,
`importacion_pnc` Faret): 4 columnas nuevas nullable — `familia_producto` (select cerrado
Etiquetas/Estuches/Folletos/Preformas, sin catálogo previo, campo manual), `disposicion` (select "No
aplica"/"Reposición"/"Destrucción"/"Reposición y destrucción", terminología nueva), `cant_destruida`,
`cant_repuesta`. La sección Disposición solo aparece si Tipo PNC es `Cuarentena` o **`Rechazo
Cliente`** (valor nuevo del catálogo, distinto del `Rechazo` genérico ya existente — ese valor
mezclaba internos y de cliente sin poder diferenciarlos en el histórico). Detalle completo en
`contex.md`, Paso 49.

## Indicadores de calidad del Panel Faret + deploy productivo de `apiqualitycontrolfaret` (Paso 50)

6 indicadores nuevos en el dashboard Faret (`faret`/Inicio): cuarentenas y rechazos de cliente por
mes (recuperados vs. destruidos), reclamos, incidentes por familia de producto, incidentes por área,
Pareto de defectos (primer chart mixto barra+línea del proyecto, mismo Chart.js v3.9.1, sin librería
nueva). Backend nuevo: `GET api/importaciones/pnc/indicadores-calidad` en `apiqualitycontrolfaret`
(filtro solo de período, sin `tipoPnc` — cada serie fija el suyo). Desktop:
`faret.indicadoresCalidad.resumen` en `FaretHandler.cs`. **Ya desplegado en producción** (`SRV-API`,
`QualityControlPool`) siguiendo un procedimiento de 4 fases (diagnóstico → staging+diff por hash →
backup con timestamp → deploy mínimo + recycle solo de ese pool) — detalle completo, incluido un
`405→401` real usado como criterio de validación post-deploy, en `contex.md` Paso 50.

## No Conformidades INNPACK: botón Eliminar (borrado lógico, solo INNPACK)

Mismo patrón que el resto del sistema: columna `no_conformidades.eliminado`, acción
`noConformidades.eliminar`, sin gating de rol (el módulo nunca tuvo ninguno). No se tocó `faret-nc`
— pedido explícitamente solo para INNPACK.

## Columnas "Código Producto"/"Producto" y fix de scroll/paginación (Data, Inspecciones Calidad, Inspecciones Producción — solo INNPACK)

Flutter empezó a capturar `codigo_producto`/`descripcion_producto` en `registros_control` a partir
de una búsqueda por NP contra SQL Server externo (`FPS_PRODUCCION`, fuera de este repo) — columnas
que ya existían con datos reales pero que el desktop no leía (o leía solo parcialmente). Se agregó
`codigo_producto` a los 3 módulos y `descripcion_producto`/"Producto" a Data (que no tenía ninguna).
Se quitó además la columna preexistente "Formulario" de los 3 (pedido de espacio visual, no estaba
relacionada). Aparte: el salto de scroll/página al guardar/validar/rechazar/eliminar en estos mismos
3 módulos se corrigió envolviendo `cargarDatos()` con `window.TableUtils.preservarScroll` (ya
existente en `shared/utils.js`, usado hasta ahora solo por módulos Faret) — mismo mecanismo, cero
cambios en los botones de acción.

## Versión 1.8.0 (release que incluye los 5 bloques de arriba)

Sube de 1.7.9 → 1.8.0. Mismo flujo estándar (`dotnet publish -c Release -r win-x64
--self-contained true` → `ISCC.exe installers/QualityControlCenter.iss`) →
`C:\Installers\QualityControlCenter_Setup_v1.8.0.exe`. Subir el instalador y actualizar
`latest.json` en el share queda a cargo del usuario.

## No Conformidades INNPACK: indicadores estadísticos + reporte imprimible (solo INNPACK, replicado de Faret)

Misma feature que ya existía en `faret-nc` (ver sección Faret más abajo) replicada en
`no-conformidades` — 6 indicadores (Cuarentenas, Rechazos Cliente, Total Reclamos, PNC por Familia,
Incidentes por Área, Pareto de Defectos) sobre una única fila por registro filtrado, más botón
"Imprimir Reporte Estadístico" reutilizando `PrintExporter.printReport()` tal cual, sin tocarlo.
Diferencia arquitectónica real con Faret: en INNPACK `no_conformidades` es **una sola tabla** con
todos los campos (PNC + gestión juntos, sin la fusión Data+NC que sí existe en Faret), así que el
cálculo lee directo cada fila sin filtrar por "fuente". Fuente de datos: se reutiliza
`_obtenerItemsFiltrados()` (ya existente, usado por Exportar/Imprimir) para traer el universo
completo filtrado — sin fetch nuevo ni endpoint nuevo. Archivos: `no-conformidades.controller.js`
(cálculo de indicadores + popover, prefijo `ncq-`), `no-conformidades.view.html` (botón + sección de
6 tarjetas), `no-conformidades.css` (mínimo: grid + alturas de canvas, reutiliza
`.ncq-seccion`/`.kpi-value` ya existentes). Ver `contex.md` Paso 52 para el detalle completo.

## Fix real: bobinas múltiples de Corrugado no se visualizaban correctamente (Data, Inspecciones Calidad, Inspecciones Producción — solo INNPACK)

Diagnóstico con consultas de solo lectura contra la BD real confirmó que `registro_control_bobinas`
es una tabla 1:N genuina (FK real `fk_registro_bobinas_registros` → `registros_control.id`) y que las
3 consultas ya agregaban con `GROUP_CONCAT` — no había pérdida de datos por `LIMIT`/`MAX`/`JOIN` que
colapse filas. El bug real: la condición de match usaba `rc2.np = rc.np` + ventana ±7 días en vez del
FK directo — un riesgo latente de mezclar bobinas entre registros hermanos de la misma NP. Fix SQL:
se reemplazó esa condición por `WHERE rb.registro_id = rc.id` en los 3 `Repository.cs`
(`RegistrosControlRepository`, `DashboardRepository`, `RegistrosProduccionRepository`) — validado con
consultas reales antes y después del cambio. UI: las columnas "Código Bobina"/"Descripción Bobina"
pasan de mostrar todo concatenado en texto plano a un patrón compacto `primera + "+N"` (badge
clickeable) que abre un popover con todas las bobinas emparejadas (Código/Descripción/Lote) —
mecanismo nuevo y genérico en `shared/utils.js` (`TableUtils.resumenBobinas`/`abrirPopover`/
`cerrarPopover`), anclado a `document.body` (inmune al `overflow` de `.table-container`), sin CSS
nuevo (estilos inline, mismo patrón que el visor de imágenes ya existente
`mostrarImagenRegistroControl`). `construirTablaTemp()` (exportación/impresión de Data) no se tocó —
sigue usando el texto crudo completo. Ver `contex.md` Paso 53.

## Fix real en Flutter: codigoProducto/descripcionProducto se guardaban en NULL (repo aparte: `quality_control`)

No era un bug de este desktop — QCC ya mostraba correctamente lo que hubiera en `registros_control`
(confirmado con el mismo método de auditoría SQL/DTO/Handler/frontend usado para las bobinas). Causa
real encontrada en el repo Flutter `C:\Users\dcarrasco\Desktop\Proyectos\quality_control`
(`lib/features/control_form/presentation/control_form_page.dart` y `control_measurements_page.dart`):
`codigoProducto`/`descripcionProducto` solo se asignaban dentro del `onChanged` del dropdown "Ítem
del NP" — con un solo ítem (el caso más común) Flutter no lo autoseleccionaba, y sin validación antes
de guardar se subía `null` sin ningún aviso. Fix: autoselección cuando la NP trae un único ítem,
validación de seguridad antes de guardar, y `ControlMeasurementsPage` (flujo "No Conforme") ahora
recibe el producto ya buscado en la pantalla anterior en vez de obligar a repetir la búsqueda.
Validado con `flutter analyze`/`flutter test` (0 errores nuevos) y desplegado: build web
(`flutter build web --release`) copiada con backup previo a `\\192.168.1.70\QualityControl` (sirve
`qualitycontrol.faret.cl`, confirmado con hash MD5 + `curl` 200) y APK Android compilado — no
distribuido, sin procedimiento documentado de cómo llega a los dispositivos. Ver `contex.md` Paso 54
(nota: esa numeración de pasos es de *este* repo, no del repo Flutter, que tiene su propio
`AGENTS.md`).

## Versión 1.8.1 (release que incluye No Conformidades INNPACK + fix bobinas Corrugado)

Sube de 1.8.0 → 1.8.1 (toca `src/UI/www/**`: sección de indicadores de No Conformidades INNPACK +
fix de bobinas). Mismo flujo estándar (`dotnet publish -c Release -r win-x64 --self-contained true`
→ `ISCC.exe installers/QualityControlCenter.iss`) → `C:\Installers\
QualityControlCenter_Setup_v1.8.1.exe`. Subir el instalador y actualizar `latest.json` en el share
queda a cargo del usuario.

## Catálogos administrables en No Conformidades (Faret e INNPACK, Pasos 55-58)

A pedido explícito del usuario, los campos de texto/select cerrados de "+ Nueva NC" (ambas
empresas) pasaron a un mecanismo de catálogo real: seleccionar existente, buscar, o escribir un
valor nuevo que queda persistido y disponible para los siguientes usuarios. Componente genérico
nuevo **`window.CatalogCombo`** en `shared/utils.js` (`attach(input, dropdown, {cacheKey,
obtenerOpciones, crear, onSeleccionar, bloqueadoMsg})`, idempotente) — se reutiliza sin cambios de
lógica entre los dos módulos, solo cambian las clases CSS del contenedor por módulo
(`.fnc-combo-dropdown` en Faret, `.ncq-combo-dropdown` en INNPACK); los ítems que genera usan
clases neutras `catalog-combo-*` (sin prefijo de módulo) — cada módulo define esas 4 reglas en su
propio CSS.

**Faret** (`faret-nc`): 8 tablas nuevas `cat_faret_*` (clientes/categorias_defecto/tipos_falla/
supervisores/revisores/familias_producto/niveles/impactos) en la API `apiqualitycontrolfaret`
(`PncCatalogosController`/`Service`/`Repository`, `api/pnc-catalogos/*`, `id/nombre/activo/
creado_por INT FK usuarios(id)/created_at`, `UNIQUE(nombre)`) — Familia de producto sembrada con
los 4 valores originales + `Display`/`Bandejas`/`Cajas`/`Tarjetas` (pedido explícito de Calidad).
Área/Máquina/Operador reutilizan los catálogos jerárquicos ya existentes `cat_areas`/
`cat_operadores`/`cat_maquinas` (mismo servidor, usados también por otros flujos de planta) —
código de área generado automáticamente desde el nombre (`cat_areas.codigo` es `UNIQUE` y
obligatorio pero el formulario de PNC no lo pide). **Tipo PNC y Disposición quedan
deliberadamente cerrados** — pilotan lógica real: `_esDisposicionAplicable` compara el string
exacto para mostrar la fila de Disposición, y los indicadores de Cuarentenas/Rechazos/Reclamos
agrupan por ese mismo string.

**INNPACK** (`no-conformidades`): mismo mecanismo pero **sin capa REST** — conexión directa a
MySQL `calidad` (usuario `tickera`, con permisos DDL reales, a diferencia del usuario restringido
de la app Faret). 9 tablas `cat_nc_*` (los mismos 8 campos de Faret + Área, que acá es plana
porque no existe un catálogo de área equivalente sin acoplarse a tablas con otro propósito) —
**Máquina y Operador no se tocaron**: siguen sugiriendo desde `maquinas` (con `codigo_qr` único,
la misma que usa "Máquinas y Procesos") y `usuarios` (login real), decisión explícita del usuario
para no divergir de esos registros reales. Se relajó la validación server-side de `Nivel` en
`NoConformidadesHandler.cs` (antes limitada a Crítico/Mayor/Menor por whitelist — bloqueador real,
no solo cosmético: sin este fix el backend rechazaba cualquier Nivel nuevo). `creado_por` en las 9
tablas nuevas es `VARCHAR(150)` libre (no `INT FK`), siguiendo la convención real ya usada en
`no_conformidades.creado_por`/`actualizado_por`/etc., distinta de la de Faret. Sembrado también
con todo el histórico real ya existente en `no_conformidades` (a diferencia de Faret, que no tenía
datos previos que preservar en esos campos).

**3 bugs reales encontrados y corregidos en el camino** (ver `contex.md` Pasos 55/57/58 para el
detalle completo): `FaretHandler.HandleCatalogo` no desenvolvía la respuesta `{success,data}`
(dead code hasta que se conectó uso real); `CatalogosService.CreateAreaAsync` (API Faret) no
manejaba código duplicado — corregido con el mismo patrón "insertar y recuperar ante 1062" ya
usado en los catálogos nuevos; `window.CatalogCombo` tenía clases CSS hardcodeadas con prefijo
`fnc-` pese a documentarse como genérico — corregido a clases neutras antes de reutilizarlo en
INNPACK, sin romper el combo de Responsable de Faret (hecho a mano, clases propias).

**Bug de posicionamiento (Paso 58, confirmado corregido por el usuario en Photino real)**: el
dropdown de `CatalogCombo` se recortaba dentro de `.fnc-modal`/`.ncq-modal` (`overflow-y:auto`,
necesario para formularios largos) cuando el campo estaba cerca del borde — mismo problema y
misma solución ya usada por `TableUtils.abrirPopover` (bobinas): el dropdown se reparenta a
`document.body` con `position:fixed`, coordenadas calculadas desde `getBoundingClientRect()`, se
reposiciona en scroll/resize del modal mientras está abierto.

## Faret (multi-empresa)

QCC soporta dos empresas, elegidas en un selector **antes** del login (`empresa-selector` module):

- **INNPACK**: todo lo de arriba, sin cambios — login desktop, `DbService.GetCalidadConnection()`.
- **FARET**: login propio (`faret-login` module, RUT/usuario/correo) contra una **API REST
  separada** (`FaretApiClient` → `https://api.faret.cl/qualitycontrol`, configurada en
  `config.json` → `QualityControlFaretApi`). **No hay acceso directo a MySQL para Faret desde el
  desktop** — todo pasa por la API. Acciones `faret.*` (prefijo) → `FaretHandler` →
  `Faret*ApiService` (en `src/Backend/Services/FaretApi/`) → `FaretApiClient.GetAsync` /
  `PostJsonAsync` / `PostMultipartFileAsync`.

Faret tiene **tres APIs REST distintas**, todas bajo `api.faret.cl` pero con base path, dominio de
datos y hasta stack tecnológico separados:
- `qualitycontrol` (login, catálogos, registros, importación PNC, usuarios — con JWT).
- `mejora-continua` (No Conformidades — **sin JWT**, endpoints públicos).
- `calidad` (Inspecciones — formulario "Calidad/Producción Faret" de la app móvil Flutter, **sin
  JWT**; ver más abajo, es la más distinta de las tres).

`FaretApiClient` es genérico y se instancia **tres veces** en `Program.cs` (`faretApiClient` /
`faretMejoraContinuaClient` / `faretCalidadClient`), una por cada `FaretApiSettings.Load(sectionName)`
(`QualityControlFaretApi` / `MejoraContinuaFaretApi` / `CalidadFaretApi` en `config.json`);
`FaretHandler` recibe las tres instancias. Si se suma una cuarta API Faret con otro base path,
seguir el mismo patrón (nueva sección en `config.json` + nueva instancia de `FaretApiClient`) en vez
de crear un cliente HTTP nuevo.

**La API `calidad` es un caso especial**: a diferencia de las otras dos (ambas .NET, en repos propios
`apiqualitycontrolfaret` y `mejoracontinua.api`), esta es un backend **Node.js/Express** que vive
**dentro del propio repo de la app Flutter FARET**
(`C:\Users\dcarrasco\Desktop\Proyectos\quality_control\backend`, no un repo aparte). Sus rutas están
montadas en `server.js` bajo `/api/calidad-faret/*` (`POST /registros` para que la app móvil suba el
formulario, `GET /registros` y `GET /resumen` para que el desktop lo lea — ver "Módulo Inspecciones"
más abajo). **Además, y esto es lo más importante: usa la misma base de datos MySQL `calidad` en
`192.168.1.70` que usa INNPACK directamente** (mismo usuario `tickera`), en tablas nuevas y
separadas (`registros_calidad_faret`, `registro_calidad_faret_defectos`,
`registro_calidad_faret_adjuntos`) — confirmado consultando `INFORMATION_SCHEMA` real, no es una BD
Faret distinta. Aun así, **se decidió mantener la regla de "Faret nunca toca MySQL directo desde el
desktop"** (decisión explícita del usuario, ver `contex.md` Paso 24) — el desktop sigue leyendo estos
datos vía REST (`FaretApiClient` → API `calidad`), igual que las otras dos APIs, en vez de aprovechar
que técnicamente podría conectarse directo a esa BD. Si en el futuro se evalúa cambiar esto, es una
decisión de arquitectura que requiere aprobación explícita, no algo para asumir por conveniencia.

Módulos frontend Faret actuales: `faret` (Inicio — **rediseñado en el Paso 26** para replicar
visualmente el `inicio` de INNPACK: mismas clases CSS sin scope propio (`.home-module`,
`.home-modules-grid`, `.home-module-card`, `.home-middle`, `.home-bottom`, `.alert-box`,
`.activity-item`) y los mismos tipos de gráfico Chart.js (barra horizontal/doughnut/línea). No
lee una API nueva: combina en el frontend 3 acciones ya existentes (`faret.dashboard.resumen` de
`mejora-continua`, `faret.inspecciones.resumen` y `faret.maquinas.resumen` de la API `calidad`) en
un solo `Promise.all`. Como Faret no tiene equivalentes reales de merma/laboratorio, los KPIs y
gráficos de esos conceptos se reemplazaron por otros con datos reales (inspecciones hoy/con
defectos, acciones vencidas/% completadas, máquinas con más registros) — ver `contex.md` Paso 26
para el mapeo completo INNPACK→Faret. El `FaretDashboardService`/`faret.dashboard.resumen` en sí
no cambió (sigue siendo la misma agregación de NC/acciones del Paso 19), solo cambió cómo se
consume en el frontend),
`faret-data` (Data — listado paginado + resumen de `importacion_pnc`, solo lectura),
`faret-importacion` (Carga Masiva), `faret-usuarios` (Gestión de Usuarios — solo visible con
`faretRol === "ADMIN"`, ver `refreshSidebarState` en `app.js`), `faret-nc` (No Conformidades —
**el módulo principal para usuarios finales desde el Paso 34** (decisión explícita de arquitectura,
detallada más abajo); `faret-data` queda como vista técnica/histórica/importación/exportación, no
como flujo de trabajo diario. **Desde el Paso 28, es una vista combinada Data + gestión de NC**, no
solo un listado de NC: el frontend trae todo `faret-data` (loop de páginas) + todo `faret.nc.list` y
los fusiona por `sistemaOrigen="DATA_FARET"` + `origenId=String(data.id)` — cada fila de Data
aparece siempre, con su NC vinculada si ya existe o como "Sin gestión" si no. Botón "Gestionar" crea
el vínculo (primera vez) o abre responsable/estado de gestión/fecha compromiso/seguimiento/cierre
(siempre que ya existe). Ver/Editar/Analizar siguen apareciendo solo si hay NC real. Las NC creadas
manualmente (sin vínculo a Data, incl. las de prueba de pasos anteriores) se siguen mostrando al
final del listado combinado, nunca desaparecen. Paginación client-side (todo ya está en memoria,
50 filas/página, mismo patrón visual que `faret-data`) y exportación Excel que arma la tabla desde
el conjunto ya filtrado completo (no solo la página visible). API `mejora-continua` de base, más
análisis de causa raíz (5 Porqués/Ishikawa/Mixta) y planes de acción correctiva vía
`faret.nc.analisis.*`/`faret.nc.acciones.*`, ver `contex.md` Pasos 15, 17, 18 y 28; sin filtros
server-side ni catálogos propios de la API — todo el filtrado es client-side.

El Paso 31 había agregado una tercera fuente a la fusión (Inspecciones, `sistemaOrigen=
"INSPECCION_FARET"`, campo `fuente` con badges Data/Inspección/Manual) — **revertido en el Paso 33**
a pedido explícito del usuario: No Conformidades debe trabajar solo sobre Data/carga masiva, no
sobre Inspecciones. Cambio 100% frontend y reversible con una línea: en `_loadLista()`, la llamada a
`_cargarInspeccionesCompleta()` dentro del `Promise.all` se reemplazó por `Promise.resolve([])`, y
se quitó la opción "Inspección" del `<select>` de filtro "Fuente". Toda la lógica de fusión con
Inspecciones sigue definida pero inactiva (`_cargarInspeccionesCompleta`, el branch
`fuente === "INSPECCION"` en `_abrirGestion`, `_labelFuente`/`_colorFuente`, el manejo de
`INSPECCION_FARET` en `_verDetalle`). Las NC que ya existían en producción con `sistemaOrigen=
"INSPECCION_FARET"` no desaparecen: al no calzar con ninguna fila de Inspecciones (que ya no se
cargan), quedan mostrándose como fuente "Manual", igual que cualquier NC sin vínculo. El módulo
`faret-inspecciones` en sí no se tocó, sigue funcionando igual.

**Desde el Paso 34, `importacion_pnc` (vía la API `qualitycontrolfaret`) es la fuente maestra de
datos de las PNC/NC Faret** — decisión explícita de arquitectura del usuario: los usuarios finales
deben poder crear y gestionar una No Conformidad completa sin pasar por Data, y sin duplicar los 30
campos del Excel en una segunda tabla. `nc_no_conformidades` (API `mejora-continua`) queda **solo
como tabla de gestión vinculada** (responsable/estado de gestión/fecha compromiso/seguimiento/cierre
+ análisis de causa raíz/acciones correctivas) — sin cambios de esquema, mismo mecanismo
`sistemaOrigen`/`origenId` que ya existía desde el Paso 28, ahora también el camino principal para
crear una NC nueva:

- **Nuevo endpoint `POST /api/importaciones/pnc`** en la API `apiqualitycontrolfaret` (repo aparte:
  `apiqualitycontrolfaret/QualityControlFaret.Api`) — crea **una sola fila manual** en
  `importacion_pnc` (antes solo se podía insertar vía Excel + `validar`/`confirmar`). Reutiliza el
  insert transaccional ya probado de la carga masiva (`ImportacionesRepository.ConfirmarAsync`/
  `InsertLoteAsync`/`InsertFilaAsync` — este último ahora devuelve el `id` insertado, cambio de tipo
  de retorno sin romper el flujo de carga masiva existente); el lote queda trazado con
  `nombre_archivo = "Creación manual (No Conformidades)"` y `usuario_id`/`created_at` reales (mismo
  mecanismo de trazabilidad que ya usa el historial de importaciones — sin columna nueva). Valida
  los mismos obligatorios que exige el Excel (NP/NV, Cliente, Código, Producto, Cant. requerida,
  Cant. rechazada, Fecha ingreso, Descripción defecto, Categoría defecto, Nivel); `FechaIngreso` se
  genera server-side con `DateTime.Now` (no viaja en el request); `PctRecuperacion` se calcula en
  backend igual que la fórmula real de la columna O del Excel (confirmado abriendo el `.xlsx`:
  `=IFERROR(M/L,"")`) → `CantRecuperada / CantRechazada`, `null` si `CantRechazada` es 0/nula.
  `ImportacionPncDto` (el de lectura/listado, usado también por `faret-data`) se amplió de forma
  aditiva con `Area`/`Maquina`/`Operador`/`Supervisor`/`RevisadoPor`/`Impacto` (mismo patrón que ya
  usó el Paso 30 con `FechaSalida`) para que el autocompletar del formulario nuevo tenga datos
  reales. Probado con `curl` real en local y en producción (`https://api.faret.cl/qualitycontrol`)
  antes y después de publicar, incluida regresión de `GET /api/importaciones` (lotes),
  `GET /api/importaciones/pnc/resumen` y una carga masiva real — nada se rompió.
- **Backend desktop**: nuevo `FaretImportacionApiService.CrearPncAsync`, y nueva acción
  `faret.nc.crearRegistro` en `FaretHandler.cs` (deliberadamente en el namespace de NC, no de Data,
  aunque internamente llame al mismo endpoint de importaciones) — crea la fila en Data y, si sale
  bien, **encadena automáticamente** la creación del vínculo de gestión (`faret.nc.create` con
  `sistemaOrigen="DATA_FARET"`, `origenId=<id nuevo>`), reutilizando `TryBuildNcRequest` ya
  existente. Si el vínculo falla pero la fila de Data ya se creó, no se pierde nada: queda visible
  en Data y se puede gestionar después con el botón "Gestionar" ya existente. Nuevo helper
  `TryGetDecimal` (no existía; solo había `TryGetString`/`TryGetInt`/`TryGetBool`) para leer los
  campos numéricos del Excel sin el bug de payload Photino ya documentado arriba. Probado end-to-end
  con un harness temporal (fuera del repo, ya eliminado al terminar) que instancia `FaretHandler`
  igual que `Program.cs` y llama la acción directamente contra las APIs reales — confirmado que crea
  la fila de Data y la NC vinculada en una sola llamada, y que los mensajes de validación llegan
  correctamente hasta la respuesta.
- **Frontend**: el botón "+ Nueva NC" ahora abre un modal nuevo (`fnc-nuevo-pnc-modal`) con los 30
  campos del Excel — fecha ingreso automática (solo lectura), `<select>` cerrado para Tipo PNC/
  Nivel/Tipo de falla/Impacto (catálogos estables, confirmados analizando los valores reales del
  `.xlsx`), `<datalist>` de autocompletar (sugiere, no obliga) para Cliente/Categoría defecto/Área/
  Máquina/Operador/Supervisor/Revisado por — poblado dinámicamente desde `_dataItems` (ya cargado en
  el módulo, nada hardcodeado), cantidades numéricas + `% Recup.` de solo lectura recalculado en
  vivo en JS (mismo cálculo que el backend, solo para feedback visual), y texto libre para Código/
  Producto/Descripción defecto/Observación/Causa raíz/Acciones correctivas/Verificación-seguimiento.
  Al guardar, autogenera los campos del vínculo de gestión (título/descripción/severidad/proceso/
  fecha detección, `tipo="INTERNA"`/`origen="AUDITORIA_INTERNA"` fijos) a partir de los datos ya
  ingresados — mismo patrón que ya usaba "Gestionar" — y llama `faret.nc.crearRegistro`. El
  formulario/modal viejo de NC manual (`fnc-form-card`, esquema simplificado de `mejora-continua`)
  **no se tocó** y sigue existiendo en el código (`_abrirFormEditar`), pero desde el Paso 35 su
  único botón de entrada (`fnc-editar-btn` en la tabla) está oculto — ver Paso 35 más abajo.

**Desde el Paso 35, el registro completo de `importacion_pnc` (los mismos ~26 campos del Excel de
"Nueva NC") se puede editar desde No Conformidades**, no solo crear — antes de este paso no existía
ningún endpoint de actualización sobre `importacion_pnc`:

- **API `apiqualitycontrolfaret`**: nuevo `PUT /api/importaciones/pnc/{id}`, DTO nuevo
  `ActualizarPncRequest` con **todos los campos nullable**. Semántica "lee-fusiona-guarda": el
  repositorio (`ImportacionesRepository.ActualizarAsync`) lee la fila actual completa, pisa en
  memoria solo los campos que llegaron no-nulos en el request, recalcula `PctRecuperacion`
  (`CantRecuperada / CantRechazada`, igual que en creación) y hace un único `UPDATE` con la fila ya
  fusionada. Un campo de texto vacío (`""`) sí se aplica (permite vaciar); un campo ausente/`null`
  se interpreta como "no tocar" — limitación consciente: no se puede vaciar explícitamente un campo
  **numérico** vía edición parcial (ausente y "vaciado" colapsan al mismo `null`), aceptado para no
  sobre-ingenierizar. `ImportacionPncDto` se amplió (aditivo) con `PncReal`/`FechaFabricacion`/
  `DescripcionDefecto`/`CausaRaiz`/`AccionesCorrectivas`/`VerificacionSeguimiento` (faltaban para
  poder mostrar/editar el registro completo, no solo crearlo). 404 si el `id` no existe, 400 con
  mensaje claro si se intenta vaciar un obligatorio (NP/NV, Cliente, Código, Producto, Descripción
  defecto, Categoría defecto, Nivel). Probado con `curl` real en local y en producción antes y
  después de publicar (campo único / formulario completo con recálculo de `%Recup.` / 404 / 400),
  limpiando siempre los datos de prueba (`cliente = "TEST-Codex-BORRAR"`) al terminar.
- **Backend desktop**: `FaretImportacionApiService.ActualizarPncAsync(id, payload) → PutJsonAsync`,
  nueva acción `faret.nc.actualizarRegistro` → `HandleNcActualizarRegistro`, que reutiliza
  `BuildPncPayload` **tal cual** (el mismo helper que ya usa `faret.nc.crearRegistro`) — como
  `TryGetString`/`TryGetDecimal` dejan el valor en `null` cuando la clave no viene en el payload
  Photino, el mismo endpoint sirve tanto para "guardar todo" (el frontend manda el formulario
  completo) como para "guardar solo el último campo editado" (el frontend manda únicamente ese
  campo) sin ninguna rama de código distinta — la granularidad la decide el frontend, no el backend.
  `BuildPncPayload` se extendió con `fechaIngreso` (no existía antes porque la creación la genera
  el servidor); es inofensivo para `faret.nc.crearRegistro` porque ese flujo nunca envía esa clave y
  `CrearPncManualRequest` ni siquiera tiene esa propiedad.
- **Frontend `faret-nc`**: el modal **"Ver detalle"** (antes solo mostraba los campos de gestión de
  `nc_no_conformidades`) ahora también muestra, si la fila tiene vínculo real a Data (`dataId`), una
  sección "Registro completo (Data)" con los mismos campos del formulario "Nueva NC" —
  **estática/`disabled` por defecto**. Botón **"Editar"** dentro de esa sección habilita todos los
  campos y trackea el último campo tocado (`oninput`/`onchange`); aparecen entonces **"Guardar
  cambio"** (solo ese último campo) y **"Guardar todo"** (formulario completo), ambos contra
  `faret.nc.actualizarRegistro`. Tras guardar, aplica los cambios al objeto en memoria
  (`_dataItems`) y refresca la tabla sin refetch. Reutiliza los mismos `<datalist>` que ya pobla
  "Nueva NC" (Cliente/Categoría defecto/Área/Máquina/Operador/Supervisor/Revisado por). NC
  manuales sin `dataId` no muestran esta sección (no hay registro Data detrás que editar).
- **Botón "Editar" de la tabla oculto (a pedido del usuario, tras probar en `dotnet run`)**: el
  botón `fnc-editar-btn` de cada fila abría el formulario viejo/limitado (`fnc-form-card`, ~9
  campos de gestión), generando confusión porque el editor completo nuevo vive dentro de "Ver" →
  "Editar", no en ese botón de la fila. Se ocultó con `style="display:none;"` **sin tocar la
  lógica** (`_abrirFormEditarPorKey`/`_abrirFormEditar` y el listener siguen intactos, reversible
  quitando ese `style`). Efecto colateral conocido y aceptado: las NC 100% manuales (sin vínculo a
  Data) se quedan sin una vía visible en la UI para editar tipo/título/severidad/proceso/descripción
  (el botón "Gestionar" cubre otro set de campos: responsable/estado/fecha compromiso/seguimiento/
  cierre). Si se necesita reactivar ese caso, hay que decidir un acceso alternativo, no solo
  quitar el `display:none`.

Ver `contex.md` Pasos 33, 34 y 35 para el detalle completo de archivos, las pruebas end-to-end
(incluida la limpieza de datos de prueba en las bases reales) y la decisión de arquitectura
discutida con el usuario antes de implementar.

**"Fecha ingreso" editable al crear una NC nueva (Paso 42, 2 repos, v1.7.4)**: la creación manual
(`POST pnc`) siempre usaba `DateTime.Now` server-side, ignorando cualquier fecha — a diferencia de
la edición (Paso 35), que ya permitía cambiar `fechaIngreso` en un registro existente.
`CrearPncManualRequest.cs` (API) suma `FechaIngreso` opcional; `ImportacionesService.CrearManualAsync`
usa `request.FechaIngreso ?? DateTime.Now` (retrocompatible). En el desktop, `fnc-npnc-fecha-ingreso`
del modal "Nueva NC" pasó de `<input type="text" disabled>` a `<input type="date">` editable, y ese
mismo valor se reutiliza también como `fechaDeteccion` del vínculo de gestión en Mejora Continua
(antes fija en "hoy"). Como este cambio sí toca frontend, se subió la versión del instalador a
**1.7.4** (antes 1.7.3) — recordatorio: si un cambio Faret solo toca alguna de las 3 APIs, no hace
falta nuevo instalador; si toca `src/UI/www/**`, sí, y hay que subir versión para que el
auto-updater lo detecte en clientes ya instalados.

`faret-inspecciones` (Inspecciones — **funcional desde el Paso 24**, solo lectura: registros del
formulario "Calidad/Producción Faret" enviado por la app móvil Flutter, vía la API `calidad`
descrita arriba. KPIs (Inspecciones Hoy/Período/Con defectos/Sin defectos), filtros por fecha/área
de control/operador/máquina/¿presenta defectos?, tabla paginada con NV Faret, área, operador,
máquina, defectos detectados y acción correctiva. `faret.inspecciones.list`/`.resumen` en
`FaretHandler` apuntan a `calidad-faret/registros`/`calidad-faret/resumen` bajo `CalidadFaretApi`,
sin requerir token — ver `contex.md` Paso 24 para el detalle completo, incluyendo el bug encontrado
y corregido en la app Flutter que impedía llegar a este formulario. **Desde el Paso 32, la columna
"Adjuntos" tiene un botón "Ver adjuntos (N)"** que abre un modal (mismo look & feel que el visor de
imágenes de INNPACK en `registros-control.controller.js`: overlay oscuro + tarjeta blanca +
`.btn-secondary`) con miniaturas cuando hay más de una foto — ver `contex.md` Paso 32, incluye el
endpoint nuevo `GET /registros/:id/adjuntos` agregado a la API Node `calidad`), `faret-maquinas` (Máquinas —
**funcional desde el Paso 25**, solo lectura, agregación sobre los mismos `registros_calidad_faret`
que usa Inspecciones: a diferencia de INNPACK (tabla `maquinas` con `id`/`proceso_id`), en Faret la
máquina es texto libre capturado por el formulario móvil — no hay catálogo con ID, así que el
"listado de máquinas" sale de un `GROUP BY maquina, area_control` sobre los registros reales, no de
una tabla catálogo. Selector de máquina + KPIs (total máquinas con registros, registros de la
máquina elegida, con defectos) + tabla de últimos 100 registros de esa máquina.
`faret.maquinas.resumen` en `FaretHandler` apunta a `calidad-faret/maquinas/resumen` bajo
`CalidadFaretApi`, mismo cliente sin token que Inspecciones — ver `contex.md` Paso 25).
Todos menos `faret-login` cargan como cualquier módulo genérico (sin casos especiales en `app.js`);
`faret-login` sí tiene casos especiales (oculta sidebar, dispara `hideSplash`).

**Orden del sidebar Faret alineado con INNPACK (Paso 27)**: los botones `data-module="faret-*"` en
`index.html` siguen el mismo orden posicional que sus pares INNPACK (Inicio → Inspecciones → No
Conformidades → Carga Masiva → Máquinas → Data → Usuarios, calcado de Inicio → Dashboard →
Registros Producción → Laboratorio → Máquinas y Procesos → Registros de Control → Usuarios). Es
solo orden de aparición en el DOM — nombres, `data-module`, íconos y comportamiento no cambiaron.
Faret no tiene equivalente de Laboratorio ni separa Producción de Calidad, así que el mapeo
posición-a-posición para esas 3 filas es aproximado (ver `contex.md` Paso 27 para el detalle
completo de la tabla de equivalencias). Si se agrega o quita un módulo de cualquiera de las dos
empresas, revisar si conviene reacomodar el orden del otro lado para mantener la alineación.

**Exportación Excel en Faret**: ninguno de los módulos Faret tenía botón de exportar hasta que se
replicó la función ya existente en INNPACK (ver `contex.md` Paso 22). A diferencia de INNPACK, acá
no controlamos el SQL detrás de los datos — todo pasa por `api.faret.cl` —, así que el patrón
cambia según si el módulo pagina contra esa API o no:

- **`faret-data`** e **`faret-inspecciones`** (paginados vía `faret.data.list` /
  `faret.inspecciones.list`, que reenvían `page`/`pageSize` tal cual a la API externa): el botón
  llama a `_exportar()`, que revisa los mismos filtros del módulo; con filtros activos exporta la
  tabla visible tal cual (`#fd-tabla` / `#fi-tabla`), sin filtros recorre páginas sucesivas
  (`_traerTodosLosRegistros()`, `pageSize=500`, corte de seguridad en 200 páginas) hasta acumular
  `totalCount`, arma una tabla temporal oculta y la exporta. No se tocó `FaretHandler` ni las APIs
  Faret — todo el "traer todo" pasa por el frontend haciendo múltiples llamadas a la acción
  existente. `faret-inspecciones` ya exporta datos reales desde el Paso 24 (antes exportaba vacío,
  a la espera de que existiera la API).
- **`faret-nc`** (`faret.nc.list` trae todo de una vez, filtro 100% client-side en
  `_filtrarItems`): el botón exporta directo la tabla visible (`#fnc-tabla`) — como el filtrado ya
  ocurre en memoria sobre el listado completo, la tabla visible ya es "todo" o "filtrado" según
  corresponda, sin necesidad de refetch.
- **`faret-usuarios`** y **`faret-importacion`** (listas completas sin filtros ni paginación):
  botón simple que exporta la tabla visible (`#fu-tabla`, `#fi-historial-tabla` — esta última es
  la tabla de "Historial de importaciones", no la de "Filas con error" de la validación).
- **`faret`** (Dashboard Ejecutivo) quedó **sin botón de exportar**, a propósito: su tabla
  "Últimas NC" es un widget top-N, mismo criterio ya aplicado en los dashboards de INNPACK.

**Rediseño visual de módulos Faret**: `.home-modules-grid`/`.home-module-card` (tarjetas KPI) **no
tienen ninguna regla base sin scope** en `core/styles.css` — solo están estilizadas dentro de
`.home-module` (el `inicio` de INNPACK). Para mejorar visualmente un módulo Faret sin arriesgar
otros módulos, agrega reglas scoped a la clase raíz de ese módulo (`.faret-data-module .home-module-card
{...}`, `.faret-nc-module .home-module-card {...}`, etc.) en su propio CSS — nunca en
`core/styles.css` ni sin scope en el CSS de otro módulo (dos de los CSS por módulo comparten clases
sin prefijo como `.faret-table`/`.faret-loading`/`.faret-error`/`.faret-empty`, definidas una sola
vez en `faret.css` y reutilizadas; no las redefinas en otro archivo o pisas el estilo de todos los
módulos Faret por orden de carga en `index.html`). Ver `contex.md` Paso 20.

**Filtros de texto libre → `<select>` con opciones reales (Paso 38, solo frontend)**: los filtros
de Cliente/Tipo PNC (`faret-nc`, `faret-data`) y Operador/Máquina (`faret-inspecciones`) eran
`<input type="text">` que exigían escribir exactamente igual al dato guardado; se reemplazaron por
`<select>` poblados dinámicamente con los valores únicos reales de los registros (nada
hardcodeado). Patrón según si el módulo tiene o no el dataset completo en memoria: `faret-nc` ya
combina todo Data+NC en `this._combinados`, así que arma las opciones directo desde ahí
(`_poblarFiltrosSelect()` tras `_combinar()`); `faret-data`/`faret-inspecciones` paginan
server-side, así que reutilizan su `_traerTodosLosRegistros()` existente (el mismo helper que ya
usaba la exportación "sin filtros"), parametrizado (`filtros = this._getFiltros()` por defecto)
para poder llamarlo también sin filtros y extraer el universo completo de valores. No se tocó
backend ni ninguna API Faret. El filtro "Área de control" de `faret-inspecciones` sigue con
opciones fijas hardcodeadas en el HTML (no era un campo de texto libre, quedó fuera del alcance).

La gestión de usuarios Faret (`FaretUsuariosApiService` → `api/usuarios`) reutiliza un
`UsuariosController` que ya existía completo en la API Faret (tabla `usuarios` + `roles` +
`usuario_roles`, la misma que usa el login) — antes de proponer cambios de BD para un feature de
usuarios, revisa si la API ya lo resuelve.

**Rol `ADMIN_TI` y visibilidad del sidebar Faret por rol (Paso 36, 2 repos)**: a pedido del
usuario, el sidebar Faret ahora oculta módulos según el rol del usuario logueado, no solo según
empresa. Roles reales (tabla `roles` de la API `qualitycontrol`): `ADMIN_TI` (nuevo, ve todo),
`ADMIN` (ve todo, sin cambios), `INSPECTOR` (sin Data/Carga Masiva, con Gestión de Usuarios),
`CALIDAD`/`CONSULTA` (sin Data/Carga Masiva ni Gestión de Usuarios — esto último ya estaba así de
fábrica, no fue necesario tocarlo). El mapeo se decidió de forma iterativa con el usuario en varias
rondas (primero se asumió que "Operador" era un rol nuevo a crear; el usuario aclaró que son los
roles ya existentes CALIDAD/INSPECTOR/CONSULTA, y luego corrigió que INSPECTOR sí debía conservar
Gestión de Usuarios, a diferencia de CALIDAD/CONSULTA).

- **API `qualitycontrolfaret`**: rol `ADMIN_TI` insertado directamente en la tabla `roles` de la BD
  real (no hay endpoint para crear roles nuevos, se hizo con un `INSERT` puntual, dato de
  configuración permanente). `Services/UsuariosService.cs`: `RolesValidos` amplía con `"ADMIN_TI"`.
  `Controllers/UsuariosController.cs`: `[Authorize(Roles = "ADMIN")]` → `"ADMIN,ADMIN_TI,INSPECTOR"`
  (sin esto, el botón del desktop se ve pero la API devuelve 403 igual). `Controllers/
  ImportacionesController.cs` (Data + Carga Masiva): `[Authorize(Roles = "ADMIN,CALIDAD")]` →
  agregado `ADMIN_TI` (INSPECTOR/CALIDAD/CONSULTA no se tocaron ahí, siguen igual que antes — el
  cambio de visibilidad para ellos es solo de sidebar, la API de Importaciones no varió su alcance
  para esos roles).
- **Bug encontrado y corregido en el mismo Paso**: la API tiene **dos** fuentes de rol por usuario
  — `usuario_roles` (tabla real, la que usa login vía `ResolverRolesEfectivosAsync`) y una columna
  legacy `usuarios.rol` (la que lee `GetAllAsync`/`GetByIdAsync` para mostrar el rol en el listado
  de gestión). `PUT /api/usuarios/{id}/roles` (`UsuariosService.UpdateRolesAsync`) solo actualizaba
  la tabla `usuario_roles` — el cambio de rol se guardaba (el login ya reflejaba el nuevo rol) pero
  la lista de "Gestión de Usuarios" seguía mostrando el rol viejo al refrescar, porque nunca se
  tocaba `usuarios.rol`. Corregido con un método nuevo `SetRolLegacyAsync` (`UsuariosRepository`/
  `IUsuariosRepository`) que `UpdateRolesAsync` llama junto con `SetRolesAsync`, manteniendo ambas
  fuentes sincronizadas (mismo patrón que ya usa `CreateAsync`, que sí seteaba las dos desde el
  principio). Probado antes y después del fix, en local contra la BD real y en producción, con
  usuarios de prueba creados/eliminados vía `pymysql` directo (limpiados al terminar).
- **Desktop backend**: `FaretUsuariosApiService.UpdateRolesAsync(id, rol)` nuevo (`PUT
  api/usuarios/{id}/roles`), acción nueva `faret.usuarios.cambiarRol` en `FaretHandler.cs` (mismo
  patrón que `activar`/`desactivar`).
- **Desktop frontend** `faret-usuarios`: la celda "Rol" de la tabla pasó de texto fijo a un
  `<select>` con los 5 roles; al cambiar dispara `confirm()` (mismo patrón que activar/desactivar),
  guarda vía la acción nueva y si falla revierte al valor anterior. `faret-usuarios.view.html`: el
  `<select>` de "Nuevo usuario" también suma la opción `ADMIN_TI`.
- **Sidebar** (`core/app.js`, `refreshSidebarState`): `btn-faret-usuarios` ahora visible para
  `ADMIN`/`ADMIN_TI`/`INSPECTOR` (antes solo `ADMIN`); nuevo bloque que oculta
  `[data-module="faret-data"]` y `[data-module="faret-importacion"]` salvo `ADMIN`/`ADMIN_TI`. No
  se tocó el gating de INNPACK (`usuariosBtn`/`rolUsuario`, una variable de sesión distinta a
  `faretRol`).

**Ocultar un módulo del sidebar por rol NO restringe el acceso a la API detrás de él — son cosas
distintas** (bug real encontrado y corregido en el Paso 39, repo `apiqualitycontrolfaret`): el Paso
36 ocultó `faret-data`/`faret-importacion` del sidebar para `INSPECTOR`/`CALIDAD`/`CONSULTA`, pero
`ImportacionesController.cs` ya tenía (desde antes, sin relación con el Paso 36) un único
`[Authorize(Roles = "ADMIN,ADMIN_TI,CALIDAD")]` a nivel de **clase**, cubriendo por igual los
endpoints de escritura (`Validar`/`Confirmar`/`CrearPnc`/`ActualizarPnc`, correcto que estén
restringidos) y los de **lectura** (`GetPncList`/`GetPncResumen`). El problema: No Conformidades
(visible para *todos* los roles Faret, nunca oculta) depende de esos mismos endpoints de lectura
(`faret.data.list`/`.resumen`) para traer las filas de Data vinculadas — así que para
`INSPECTOR`/`CONSULTA` (nunca estuvieron en la lista de roles de la API) esas llamadas devolvían
`403`, y el frontend lo trataba como "sin datos" (`if (!res.ok) break;`), haciendo desaparecer en
silencio los registros de Data de la vista de No Conformidades para esos roles. `CALIDAD` no lo
sufría porque sí estaba en la lista de roles de la API. **Fix**: se separó la autorización por
acción — clase con `[Authorize]` simple (cualquier rol Faret autenticado), y
`[Authorize(Roles = "ADMIN,ADMIN_TI,CALIDAD")]` explícito solo en los métodos de escritura + el
historial de lotes (`GetList`). `GetPncList`/`GetPncResumen` quedan abiertos a cualquier rol
autenticado. Regla general: si un módulo/endpoint es consumido indirectamente por otro módulo que
sí es visible para todos los roles, la autorización de lectura no puede calcarse 1:1 del
ocultamiento de sidebar de su módulo "dueño" — hay que revisar quién más lo llama.

**El Paso 39 dejó las escrituras (`CrearPnc`/`ActualizarPnc`) sin INSPECTOR — corregido en el Paso
41** (repo `apiqualitycontrolfaret`): "+ Nueva NC"/"Editar" en `faret-nc` (visible para todos los
roles) llama a esos dos endpoints, que seguían en `[Authorize(Roles = "ADMIN,ADMIN_TI,CALIDAD")]`.
Con rol INSPECTOR la API devolvía `403` con body vacío, y `TryUnwrapApiResponse` (`FaretHandler.cs`)
mostraba su mensaje genérico por defecto `"Error al comunicarse con la API Faret"` — mismo texto
reportado por el usuario. Se agregó `INSPECTOR` a esos dos `[Authorize(Roles=...)]`, sin tocar
`Validar`/`Confirmar`/`GetList` (siguen ADMIN/ADMIN_TI/CALIDAD, Carga Masiva sigue oculta para
INSPECTOR). Probado en producción con un usuario INSPECTOR real (creado/logueado/probado/borrado vía
`pymysql` + curl, mismo patrón que otros pasos). Auditoría del resto de la API para ese rol:
`CatalogosController` (escrituras ADMIN,CALIDAD, ni INSPECTOR ni ADMIN_TI — sin impacto, el desktop
solo lee catálogos) y `RegistrosController` (`api/registros-control`, código muerto, no wireado a
ningún módulo) no tienen impacto real hoy. **Hallazgo dejado pendiente a pedido del usuario**:
`UsuariosController` no tiene ninguna restricción interna — INSPECTOR puede crear usuarios, asignar
cualquier rol (incluido ascenderse a ADMIN/ADMIN_TI), cambiar la contraseña de cualquiera y
desactivar/reactivar cuentas, sin ninguna barrera adicional en la API ni en
`faret-usuarios.controller.js`. No tocar sin que el usuario lo pida explícitamente.

**Gotcha real (Paso 44): la columna legacy `usuarios.rol` puede quedar desincronizada de
`usuario_roles` para registros creados/editados ANTES del fix del Paso 36 (`SetRolLegacyAsync`)** —
ese fix solo previene desincronización futura, no repara filas ya desincronizadas. Como "Gestión de
Usuarios" (`UsuariosRepository.GetAllAsync`, campo `Rol`) muestra el valor **legacy**, mientras el
login/JWT usa `usuario_roles` (`GetRolesByUsuarioIdAsync`), un usuario puede verse con un rol en la
UI y en realidad estar autorizado con otro — causa real de un caso donde un usuario "visto como
INSPECTOR" no podía crear una NC (su rol real era CONSULTA). Si se reporta un problema de permisos
que no tiene sentido con el rol que se ve en pantalla, comparar `usuarios.rol` contra
`usuario_roles` directo en BD antes de asumir un bug de código — puede ser solo un dato
desincronizado (se corrige re-guardando el rol desde la UI, que ahora sí sincroniza ambas columnas).

**Desde el Paso 44, `CrearPnc`/`ActualizarPnc` (`POST`/`PUT api/importaciones/pnc`, el endpoint de
"Nueva NC"/"Editar" completo) ya no restringen por rol** — decisión explícita del usuario: ese
acceso operativo (escribir una No Conformidad completa) debe estar disponible para todos los roles
Faret, no solo ADMIN/ADMIN_TI/CALIDAD/INSPECTOR. Quedan solo con el `[Authorize]` de clase (cualquier
usuario autenticado), mismo patrón que ya usaban `GetPncList`/`GetPncResumen` desde el Paso 39.
Carga Masiva (`Validar`/`Confirmar`/`GetList`, acción distinta y administrativa) no se tocó, sigue
restringida a ADMIN/ADMIN_TI/CALIDAD.

⚠️ Al detener procesos de prueba locales, **nunca uses `taskkill /F /IM dotnet.exe`** — mata
*todos* los procesos `dotnet.exe` del sistema, no solo el que lanzaste (esto pasó durante las
pruebas de este Paso: se cerraron 3 procesos, no solo el buscado). Usa el PID específico del
proceso que lanzaste.

**Gestión operativa de NC vinculada a Data (backend + desktop, completo desde el Paso 28)**: el
usuario pidió que "No Conformidades" funcione como una bandeja operativa administrativa sobre los
registros de Data (asignar responsable, estado de gestión, fecha compromiso, seguimiento, cierre),
no solo un formulario aislado. Diagnóstico previo confirmó que `nc_no_conformidades` no tenía casi
nada de eso persistido de forma real y compartida entre usuarios (`responsable`/`reportado_por`
existían en BD pero no volvían en el GET; `estado` quedaba fijo en `'ABIERTA'` para siempre, sin
PATCH ni lógica de transición; no había `fecha_compromiso` a nivel de NC, ni tabla de
seguimiento/comentarios, ni campos de cierre, ni ninguna columna para vincular una NC a un registro
externo de Data). Se descartó explícitamente una solución con `localStorage` (el usuario la
rechazó: no sirve para varios usuarios viendo la misma información). Se implementó **Fase 2 con
persistencia real** en el repo separado `mejoracontinua.api`
(`C:\Users\dcarrasco\Desktop\Proyectos\mejoracontinua.api`, ver también la sección de abajo sobre
los dos repos Faret): migración SQL versionada en
`MejoraContinua.Api/Sql/2026_nc_gestion_operativa_faret.sql` (agrega `sistema_origen`, `origen_id`,
`estado_gestion`, `fecha_compromiso`, `fecha_cierre`, `cerrado_por` a `nc_no_conformidades`, sin
tocar `estado` existente para no romper nada que ya lo lea; agrega tabla nueva `nc_seguimiento` para
bitácora de comentarios), más 4 endpoints nuevos en `NoConformidadesController`
(`PATCH {id}/gestion`, `POST {id}/cerrar`, `GET/POST {id}/seguimiento`) y corrección del
SELECT/DTO para que `responsable`/`reportado_por`/`fecha_deteccion` por fin vuelvan al desktop. Ya
desplegado y probado end-to-end contra `https://api.faret.cl/mejora-continua` (SQL ejecutado en el
servidor, API republicada) — ver el fix de un 500 en `nc_seguimiento` por una tabla que no había
quedado creada en el primer intento, en `contex.md` Paso 23.

**El desktop se conectó en el Paso 28**, en dos etapas aprobadas por separado: (1) wiring backend
puro (`FaretApiClient.PatchJsonAsync` nuevo — el endpoint de gestión usa `HttpPatch`, no existía
ese verbo en el cliente —, 4 métodos nuevos en `FaretNoConformidadesApiService.cs`, 4 acciones
nuevas en `FaretHandler.cs`: `faret.nc.gestion.actualizar`, `faret.nc.cerrar`,
`faret.nc.seguimiento.list`, `faret.nc.seguimiento.crear`, y `TryBuildNcRequest` extendido con
`sistemaOrigen`/`origenId` opcionales para poder crear una NC ya vinculada a Data); (2) fusión en
el frontend (`faret-nc.controller.js`/`.view.html`), decidida explícitamente **sin** crear tabla ni
endpoint combinado nuevo — Data sigue siendo la fuente base, la gestión solo guarda los campos
administrativos que ya agregó el Paso 23, y la "unión" ocurre en memoria en el frontend (mismo
patrón que ya usaba el Home de Faret del Paso 26 para combinar múltiples acciones vía
`Promise.all`), no en una API ni en SQL. Ver `contex.md` Paso 28 para el diagnóstico completo, la
decisión de arquitectura (por qué no A/B, ver las opciones evaluadas) y el detalle de archivos.

**"Recordar usuario" (INNPACK y Faret)**: ambos guardan **usuario y contraseña en texto plano** en
`localStorage` (`lcc_codigoUsuario`/`lcc_password` para INNPACK, `lcc_faret_identificador`/
`lcc_faret_password` para Faret) — es una decisión explícita del usuario (ver `contex.md`, Paso 14:
se probó cifrar la password de Faret con DPAPI de Windows y se pidió revertir a texto plano para
igualar el comportamiento de INNPACK). No "arregles" esto reintroduciendo cifrado sin que te lo
pidan de nuevo. La restauración de sesión recordada vive en
`empresa-selector.controller.js` (`_entrarInnpack` / `_entrarFaret`): INNPACK solo restaura
`sessionStorage` (no depende de token), Faret necesita reenviar `faret.login` en segundo plano con
las credenciales guardadas porque el JWT vive en memoria en `FaretApiClient` y no se persiste.

**Gotcha del payload Photino con campos numéricos**: el payload JS→C# se deserializa a
`Dictionary<string, object>`, donde cada valor queda envuelto en un `JsonElement` (no en su tipo
nativo). Si el JS envía un campo como número (ej. `page: 1`, no `page: "1"`) y el handler lo lee
con el helper `TryGetString` (que llama `JsonElement.GetString()`), lanza
`InvalidOperationException: The requested operation requires an element of type 'String', but the
target element has type 'Number'` — falla en tiempo de ejecución, no en compilación. Para campos
numéricos usa siempre `TryGetInt` (u otro helper que llame `TryGetInt32`/similar), nunca
`TryGetString`. Esto causó un bug real en `faret.data.list` (ver `contex.md`, Paso 12) donde el
resumen cargaba bien pero la tabla quedaba vacía porque solo esa acción leía `page`/`pageSize`.
Para decimales (cantidades del formulario "Nueva NC" del Paso 34: Cant. requerida/rechazada/
recuperada, PNC real) existe el mismo tipo de helper, `TryGetDecimal` (`FaretHandler.cs`), que
llama `JsonElement.TryGetDecimal()` — mismo motivo, mismo patrón.

El código de las APIs Faret vive en **tres repositorios/carpetas distintas** (no es el mismo código
para las tres — confirmado explorando las tres, no asumir):

- **`qualitycontrol`**: `C:\Users\dcarrasco\Desktop\Proyectos\apiqualitycontrolfaret\QualityControlFaret.Api`
  — .NET 8 Web API, sin Entity Framework (MySqlConnector + SQL parametrizado), JWT Bearer,
  respuestas `ApiResponse<T> { success, message, data, errors }`, roles
  `ADMIN/CALIDAD/INSPECTOR/CONSULTA`.
- **`mejora-continua`**: `C:\Users\dcarrasco\Desktop\Proyectos\mejoracontinua.api\mejoracontinua.api`
  — .NET 8 Web API mínima, **Dapper + MySqlConnector** (sin EF, sin migraciones, sin carpeta `Sql/`
  — las tablas se crean a mano contra el servidor), **sin autenticación**, controllers devuelven
  JSON crudo (no `ApiResponse<T>`). BD `mejora_continua` en `192.168.1.70` (esquema separado de
  `qualitycontrolfaret`), tablas con prefijo `nc_` (`nc_no_conformidades`,
  `nc_analisis_causa_raiz`, `nc_acciones_correctivas`).
- **`calidad`**: `C:\Users\dcarrasco\Desktop\Proyectos\quality_control\backend` — **no es un repo
  separado**, vive dentro del repo de la app Flutter FARET (`quality_control`, que también tiene el
  código de la app móvil en `lib/`). Node.js/Express + `mysql2` (sin ORM), **sin autenticación**,
  controllers devuelven `{ok, data}` / `{ok, message, error}`. Usa la BD `calidad` en `192.168.1.70`
  — **la misma que usa INNPACK directamente** (ver arriba, sección Faret), no una BD separada.
  Rutas montadas en `server.js` (`app.use('/api/calidad-faret', calidadFaretRoutes)`); en el
  servidor corre como **tarea programada de Windows** (Task Scheduler, no IIS ni PM2 ni servicio de
  Windows/SCM — confirmado en el Paso 24 rastreando el proceso `node.exe` hasta su padre
  `svchost.exe -k netsvcs`), escuchando en el puerto configurado por `.env` (`PORT`, 3000 en local).
  Deploy = copiar los archivos cambiados a la misma ruta relativa en el servidor y reiniciar esa
  tarea programada (no hay build/compilación, es JS plano). **Script de reinicio ya confirmado (Paso
  25)**: `C:\API WEB\reiniciar-calidad.bat`, ejecutado desde el cmd del servidor — la ruta tiene un
  espacio (`API WEB`) así que hay que invocarlo entre comillas (`"C:\API WEB\reiniciar-calidad.bat"`);
  sin comillas cmd interpreta `C:\API` como comando y falla con "no se reconoce como un comando".

Al tocar algo de Faret, revisa si el cambio requiere tocar el repo correspondiente también (no solo
este) — y confirma primero **cuál de los dos** repos es, no asumas que comparten arquitectura.

Detalle completo del flujo multiempresa, decisiones y avances está en `contex.md` — léelo antes de
tocar cualquier cosa de Faret.

**Gotcha de ClosedXML con números**: `IXLCell.GetString()` devuelve el texto **formateado según la
configuración regional** (coma decimal en es-CL/es-ES). Si luego parseas ese texto con
`decimal.TryParse(..., CultureInfo.InvariantCulture)`, la coma se interpreta como separador de
miles y el valor se corrompe silenciosamente (`"0,9998"` → `9998`) sin lanzar error. Para leer
números de celdas Excel con ClosedXML, usa siempre `cell.TryGetValue<decimal>(...)` (valor nativo,
independiente de locale) y deja el parseo de texto solo como *fallback* para celdas de texto. Esto
causó un bug real (ver `contex.md`, Paso 10) que pasaba la validación pero rompía el `INSERT` en
MySQL con "Out of range value".

**Gotcha de la API `mejora-continua` (No Conformidades) con enums no documentados**: el endpoint
`POST/PUT api/no-conformidades` acepta `origen` como `string` libre según el Swagger, pero el
servidor en realidad espera un enum cerrado (`AUDITORIA_INTERNA` / `AUDITORIA_EXTERNA`) y **no lo
valida** — cualquier otro valor revienta con `HTTP 500` (no un 400 de validación). Confirmado con
curl real (ver `contex.md`, Paso 16). Por eso en el desktop el campo "Origen" es un `<select>`
cerrado a esos dos valores (`faret-nc.view.html`) y `FaretHandler.TryBuildNcRequest` valida el mismo
enum antes de llamar a la API, en vez de confiar solo en el combo del frontend. Si en el futuro esta
API agrega más orígenes válidos, hay que confirmarlo con quien mantiene esa API antes de ampliarlo
acá — no adivinar, porque un valor equivocado no da un error claro, da un 500.

**Gotcha de `FaretApiClient.GetAsync` (corregido)**: a diferencia de `PostJsonAsync`/
`PutJsonAsync`/`DeleteAsync` (que devuelven el body real de la API en errores no-2xx),
`GetAsync` generaba siempre un mensaje sintético `"HTTP {status}: {reason}"` y descartaba el body
real. Esto rompía cualquier lógica que necesitara distinguir el motivo real de un 404 (ej. "NC sin
análisis todavía" vs "NC inexistente" en `faret.nc.analisis.get`, ver `contex.md` Paso 18). Ya está
corregido para ser consistente con los otros 4 métodos — si ves un helper que solo maneja errores de
`GetAsync` con el formato viejo `{ok:false, error:"HTTP ..."}`, probablemente sea código anterior a
este fix.

**Patrón: módulo Faret construido antes de que exista su API** (usado originalmente para
`faret-inspecciones`, ver `contex.md` Paso 21 — **ya resuelto en el Paso 24**, dejar documentado
como patrón para el próximo caso similar): cuando se prepara infraestructura para una futura fuente
de datos, el backend deja la llamada lista (`Faret*ApiService` + acción en `FaretHandler`) apuntando
al endpoint propuesto, aunque hoy responda 404. El frontend **nunca** muestra ese error como un
banner ni inventa datos — lo trata igual que "sin resultados" y renderiza un empty state elegante.
Si se agrega otro módulo en esta misma situación (a la espera de una API futura), replicar ese mismo
criterio de UX en vez de mostrar el error crudo.

**Gotcha: `TryUnwrapApiResponse` (en `FaretHandler.cs`) reconoce 3 formatos de respuesta
distintos** — hay que saber cuál usa cada API antes de agregar una acción nueva:
- `{success, message, data, errors}` → API `qualitycontrol` (.NET, `ApiResponse<T>`).
- `{ok, data}` / `{ok, message}` → API `calidad` (Node/Express, agregado en el Paso 24; mismo shape
  que ya usaba `crearRegistroCalidadFaret` para el `POST` que sube la app móvil).
- JSON crudo en éxito / `ProblemDetails` `{title, status}` en error → API `mejora-continua` (no pasa
  por `TryUnwrapApiResponse`, usa `ExtractMcErrorMessage` en su lugar).
Si agregas una acción contra una de estas 3 APIs, usa el parser que ya le corresponde — no asumas
que todas devuelven el mismo shape.

**Columna "Fecha Salida" en Data y No Conformidades (Paso 30, solo Faret)**: se agregó al Excel de
importación masiva (columna nueva "FECHA SALIDA", opcional, entre "FECHA INGRESO" y "NP/NV"). El
cambio tocó **dos repos**: la API `qualitycontrolfaret` (`ALTER TABLE importacion_pnc ADD COLUMN
fecha_salida DATE NULL`, `Models/ImportacionPnc.cs` + `DTOs/Importaciones/ImportacionPncDto.cs` +
lectura opcional en `ImportacionesService.LeerFila` + `ImportacionesRepository` INSERT/SELECT) y
este desktop (`faret-data` y `faret-nc`, solo vista/exportador — sin cambios de backend porque
`FaretHandler.HandleDataList` es un passthrough JSON sin modelo tipado intermedio, así que el campo
nuevo "viaja" solo). Ver `contex.md` Paso 30 para el detalle completo, incluida la verificación
`curl` contra la API real ya desplegada.

**Gotcha de encabezado `sticky` transparentándose al hacer scroll (corregido)**: el patrón de
tabla del proyecto pone `position: sticky; top: 0` en `.table thead th` (`core/styles.css`), pero
el `background` sólido para esa cabecera se declaraba en el `<thead>` padre
(`.table thead { background: ... }`), no en el propio `th` que es el elemento realmente
posicionado. Un `background` en un ancestro no “viaja” con un hijo posicionado por `sticky` de
forma independiente — el `th` quedaba transparente y, al hacer scroll, las filas del `tbody` se
veían pasar por detrás/mezcladas con el texto del encabezado. Corregido agregando el `background`
directamente al selector `thead th` (mismo color ya usado, sin tocar layout ni columnas) en la
regla base de `core/styles.css` y en los módulos que la sobreescriben con su propio color:
`faret-data.css`, `faret-nc.css`, `faret-inspecciones.css`. Si se agrega un color de encabezado
nuevo en cualquier módulo, ponerlo siempre en `thead th`, nunca solo en `thead`.

## Config & deployment

- **Database config**: `config.json` at the app root (copied to output) holds MySQL host/port/
  user/password/db; `DbSettings.Load()` reads it, falling back to `MYSQL_*` environment variables,
  then to localhost defaults. Note `config.json` is committed with real credentials and
  `Config/AppSettings.cs` is an unused parallel settings class (`DbSettings` in `DbService.cs` is
  the one actually used).
- **Auto-update**: on startup `UpdateService` reads `latest.json` from the Windows network share
  `\\192.168.1.71\Programas TI\Programas\Quality Control Center\Qcontrol_Updates` (corrected in
  Paso 37 — the old hardcoded path `\\192.168.1.71\Qcontrol_Updates` was stale, the share moved and
  the check was silently never firing), compares to the assembly version, and if newer **copies the
  installer to a local staging folder first** (`UpdateService.PrepareLocalInstaller` →
  `C:\ProgramData\QualityControlCenter\setup.exe`) before launching it with `Process.Start` — same
  copy-then-run pattern the user already uses for a sibling in-house app ("Logistic Control
  Center"), added because running an installer straight from a UNC path is more likely to trigger
  the corporate network's credential/UAC prompt than running a local copy; admin prompts themselves
  are explicitly acceptable to the user, this only avoids the *extra* network-path friction. Both
  the path fix and the local-staging step live in `src/Backend/Services/UpdateService.cs` +
  `src/Backend/Program.cs`. **Superseded desde el Paso 59 (release 1.8.2/1.8.3)**: QCC.exe ya NO
  ejecuta el instalador él mismo — solo prepara `Pending`, arranca un relanzador no elevado
  (`QCC.Updater.exe --relanzar <RunId>`, instalado en
  `C:\ProgramData\QualityControlCenter\Updater\Host\`, fuera de `{app}` a propósito) y dispara una
  Scheduled Task elevada (`QCCUpdaterElevado`, SDDL propio para que un usuario normal pueda
  `/Run`-earla sin UAC) que corre el mismo `QCC.Updater.exe` como SYSTEM: valida SHA-256, promueve a
  un staging protegido, espera a que QCC cierre, corre el instalador silencioso (`/VERYSILENT`) y
  reabre la app. Detalle completo (por qué, todos los fixes reales encontrados en el camino, los
  RunId de las pruebas E2E) en `contex.md` Paso 59 — no se repite acá. Bump `<Version>` en
  `QualityControlCenter.csproj` **y** `AppVersion`/`OutputBaseFilename` en
  `installers/QualityControlCenter.iss` juntos en cada release (current: `1.8.4`). Publicar con
  `dotnet publish -c Release -r win-x64 --self-contained true` → `ISCC.exe
  installers/QualityControlCenter.iss` → subir el instalador al share + actualizar `latest.json`
  (`version`/`installer`/`sha256`, ver gotcha de encoding más abajo).
- **Gotcha de `latest.json` con un salto de línea crudo rompiendo el JSON silenciosamente (Paso
  43, archivo en la carpeta compartida, no en el repo)**: `UpdateService.GetLatestUpdateInfo()`
  envuelve el `JsonSerializer.Deserialize` en un `try/catch { return null; }`, y el chequeo completo
  en `Program.cs` también está en un `try/catch` que solo hace `Console.WriteLine` — cualquier JSON
  inválido en `latest.json` hace que el updater simplemente no dispare, **sin ningún error visible
  para el usuario**. Causa real encontrada: un editor de texto guardó un salto de línea real dentro
  del valor del campo `"installer"` (partiendo la ruta UNC en dos líneas), lo que es JSON inválido.
  Si el auto-updater "no hace nada" al abrir un cliente viejo, **leer el `latest.json` real de la
  ruta de red y validarlo como JSON antes de sospechar del código** — el código ya compara versiones
  y escapa la ruta correctamente, el punto de falla más probable es el archivo mismo. Al escribir
  ese archivo desde este entorno, evitar generarlo con comandos PowerShell anidados dentro de Bash
  (el escaping de backslashes en cascada bash→PowerShell→JSON se corrompe fácilmente); es más
  confiable escribir el contenido exacto con la herramienta `Write` a un archivo local y copiarlo
  con `Copy-Item`/`copy` a la ruta UNC, validando después con un parser JSON real.
- **Excel export**: frontend builds the workbook (`core/excel-exporter.js` + CDN `xlsx`), sends
  base64 via `excel.guardar`; the router writes it to the user's Downloads folder and opens it.
- **Gotcha de `dotnet publish` generando una carpeta `publish/publish` anidada** (encontrado en el
  repo `apiqualitycontrolfaret`, Paso 39, pero aplica a cualquier proyecto `Microsoft.NET.Sdk.Web`
  de este ecosistema): si queda una carpeta llamada `publish/` **suelta dentro del código fuente**
  del proyecto (no en `bin/`/`obj/` — p. ej. una copia manual vieja de un publish anterior que
  alguien dejó ahí), el SDK Web la trata como contenido normal (glob `**` por defecto) y la copia
  dentro de cada nuevo output de publish, generando un `publish/publish` anidado que **persiste
  incluso borrando `bin`/`obj` y republicando**, porque el origen es la carpeta suelta en el
  código fuente, no el build. Si aparece esta carpeta anidada, buscar y borrar primero cualquier
  `publish/` residual en la raíz del proyecto (fuera de `bin/`) antes de re-publicar.
- **Gotcha real de `dotnet publish` sin proyecto explícito en esta solución (release 1.8.4)**: correr
  `dotnet publish -c Release -r win-x64 --self-contained true` desde la raíz del repo (sin indicar
  `QualityControlCenter.csproj`) publicó de una **los dos proyectos** de `QualityControlCenter.sln`
  — incluido `QCC.Updater`, pero **sin** `-p:PublishSingleFile=true`. Resultado: `QCC.Updater.exe`
  volvió a quedar como el apphost desnudo de 151 KB sin sus DLLs de runtime al lado — exactamente el
  mismo bug 0x8000809A ya resuelto en el Paso 59 (ver más arriba). Se detectó a tiempo comparando el
  tamaño del archivo antes de compilar el instalador (67.523.636 bytes esperado vs 151.552 real) y
  se corrigió republicando `QCC.Updater/QCC.Updater.csproj` explícitamente con
  `-p:PublishSingleFile=true`. **Regla:** al publicar para un release, apuntar siempre
  `dotnet publish` al `.csproj` específico (`QualityControlCenter.csproj`), nunca correrlo sin
  argumento en la raíz del repo — y si en algún momento hace falta también republicar `QCC.Updater`
  (solo cuando cambia su propio código, no en cada release normal), hacerlo en un comando aparte con
  sus flags completos (`-r win-x64 --self-contained true -p:PublishSingleFile=true`), nunca
  asumiendo que un publish genérico de la carpeta raíz lo cubre correctamente. Nota aparte: el hash
  SHA-256 de `QCC.Updater.exe` cambia entre publishes idénticos en código (el bundling single-file
  no es reproducible por defecto) — no es una señal de que algo cambió, solo importa cuando el
  tamaño/comportamiento difiere.

## Producto Terminado (INNPACK y Faret — dato 100% compartido, release 1.8.4)

Módulo nuevo de solo consulta/análisis sobre las inspecciones finales de Termoformado y Pegado
(muestreo NCh44:2007) que la app móvil Flutter ya escribe directo en la BD `calidad`. Photino
**nunca** inserta/edita inspecciones ni recalcula el plan de muestreo (nivel/AQL/letra código/
tamaño muestra/Ac/Re) — se muestran tal cual los guardó Flutter/API, es responsabilidad exclusiva
de esa app. El único mutador que agrega Photino es "Eliminar" (borrado lógico).

- **Tablas reales** (ya creadas por Flutter, no duplicadas): `registros_producto_terminado`
  (cabecera — incluye `empresa` ENUM('FARET','INNPACK') NULLABLE y `eliminado` TINYINT(1), ver
  abajo), `registro_pt_pallets`, `registro_pt_hallazgos` (1 hallazgo = 1 unidad no conforme, con
  `foto_ruta` embebida), `registro_pt_hallazgo_defectos` (N defectos por hallazgo). Catálogos
  reutilizados sin cambios: `parametros_control_visual` (defectos, `procesos.id`: Pegado=4,
  Termoformado=5) y `origenes_problema` (mismo scoping).
- **Backend**: `src/Backend/Modules/ProductoTerminado/{Handler,Repository,Models}.cs`, registrado en
  `MessageRouter.cs` (prefijo `productoTerminado`). Acciones: `.filtros`, `.resumen` (5 KPIs + 4
  gráficos en una sola llamada — Pareto de defectos, NC por origen, tendencia, comparación
  Termoformado vs Pegado), `.list` (paginado), `.detalle`, `.exportarDetalle` (fila por
  inspección/hallazgo/defecto, trazabilidad completa para Excel), `.eliminar`. KPIs "Unidades NC" y
  "Defectos" se suman directo desde `registros_producto_terminado.unidades_nc`/`defectos_totales`
  (ya precalculados por Flutter) — nunca se recalculan sumando joins, evitando inflarse.
- **Scope por empresa (decisión de arquitectura explícita del usuario)**: Flutter agregó la
  pregunta "Empresa" al formulario (columna `empresa`, nullable — registros previos a ese cambio
  quedaron en NULL). Se decidió tratar la tabla como **compartida con filtro**, igual que Control
  Documental (no como Inspecciones/Data Faret, que sí pasan por API REST) — Faret llama las mismas
  acciones `productoTerminado.*` directo por `DbService.GetCalidadConnection()`, sin pasar por
  `FaretHandler`/`FaretApiClient`. Cada acción exige un campo `empresa` ("INNPACK"/"FARET") — si
  falta, error explícito en vez de mezclar datos de las dos empresas. Registros con `empresa=NULL`
  se muestran como INNPACK (nunca en Faret), decisión explícita para no hacer desaparecer datos
  históricos. El mismo scope aplica también a `ObtenerDetalle`/`Eliminar` (un id de una empresa no
  se puede ver ni eliminar desde la otra, ni por link directo) y al catálogo de Máquinas.
- **Borrado lógico**: `sql/producto_terminado_eliminar.sql` agrega `eliminado TINYINT(1) DEFAULT 0`
  a `registros_producto_terminado` (nunca `DELETE` físico, mismo criterio que el resto del sistema).
  Botón "Eliminar" por fila en ambos módulos, con `confirm()`, sin gating de rol.
- **Frontend**: `src/UI/www/modules/producto-terminado/` (INNPACK) y
  `src/UI/www/modules/faret-producto-terminado/` (Faret) — el segundo es una réplica casi literal
  del primero (mismo patrón que `faret-control-documental` vs `control-documental`), con ids
  prefijados `fpt`/clases `faret-producto-terminado-*` para no chocar con el CSS de INNPACK (ambos
  quedan cargados a la vez en `index.html`) y `empresa: "FARET"` hardcodeado en cada llamada.
  Reutiliza sin cambios: Chart.js local (mismo patrón dual-axis del Pareto de `no-conformidades`),
  `ExcelExporter.exportTable`, paginación y patrón de exportación con tabla temporal oculta de
  `registros-control.controller.js`, y el visor de imágenes (`normalizarImagenUrl` →
  `api.faret.cl/calidad`, mismo host que ya usa `registro_adjuntos.ruta_archivo` en INNPACK).
- **Validado con datos de prueba reales** (insertados, verificados y eliminados en cada corrida,
  marca `TEST-Codex-BORRAR-PT*`, nunca queda nada en producción): agregación unidades NC/defectos
  sin inflarse por JOIN, filtro por proceso, NP con múltiples inspecciones, detalle completo con
  pallets/hallazgos/multi-defecto, export con trazabilidad, scope por empresa (cruzado y con
  legacy NULL), borrado lógico (scope + idempotencia). **No validado**: interacción real en la
  ventana Photino (sin capacidad de screenshot en el entorno de desarrollo) ni el caso real
  `inspeccion_100=1`.

## No Conformidades: filtro "Responsable" → filtro "Área" (INNPACK y Faret, release 1.8.4)

Cambio pedido explícitamente por el usuario, solo visual/filtros — el campo "Responsable" de
gestión (asignar responsable a una NC) **no se tocó**, solo se reemplazó el filtro de listado.

- **INNPACK** (`no-conformidades`, filtrado server-side): `NoConformidadesRepository.cs`
  (`AplicarFiltros`/`Listar`/`ObtenerResumen`) y `NoConformidadesHandler.cs` (`LeerFiltros`/
  `HandleList`/`HandleResumen`) — parámetro `responsable` (`LIKE`) reemplazado por `area` (`=`
  exacto, apropiado para un `<select>`). La columna `area` y su catálogo de valores reales
  (`ObtenerFiltrosOpciones` → `areas`) ya existían de antes, no fue necesario agregar nada nuevo del
  lado de datos.
- **Faret** (`faret-nc`, filtrado 100% client-side sobre `this._combinados`): `_normalizarFila()`
  ahora expone `area: dataRow?.area || "-"` (mismo campo real que ya usaba el indicador "Incidentes
  por área" existente, confirmado antes de usarlo). `_poblarFiltrosSelect()`, `_getFiltros()`,
  `_limpiarFiltros()`, `_filtrarItems()` y el resumen de filtros actualizados con el mismo patrón ya
  usado para Cliente/Tipo PNC (Paso 38).

## Versión 1.8.4

Sube de 1.8.3 → 1.8.4 (toca `src/UI/www/**` y `src/Backend/**`: módulo Producto Terminado nuevo +
cambio de filtro en No Conformidades). Mismo flujo estándar (`dotnet publish -c Release -r win-x64
--self-contained true` **apuntado al `.csproj` específico**, ver gotcha de `dotnet publish` más
arriba → `ISCC.exe installers/QualityControlCenter.iss`) →
`C:\Installers\QualityControlCenter_Setup_v1.8.4.exe`. A diferencia de releases anteriores, esta
vez el instalador se subió al share productivo y se activó `latest.json` desde este mismo entorno
(no quedó a cargo del usuario) — backup del `latest.json` anterior guardado como
`latest.backup-20260817-155300.json` en el share, SHA-256 del instalador verificado byte a byte
entre la copia local y la del share antes de activar. **Confirmado por el usuario en producción**:
el flujo de auto-actualización completo (detección → confirmación → Pending → relanzador →
Scheduled Task elevada → instalación silenciosa → reapertura) funcionó end-to-end desde la 1.8.3
instalada hacia esta 1.8.4 real. Release cerrado. Commit `2e867f2` (Diego Carrasco), sin push.
