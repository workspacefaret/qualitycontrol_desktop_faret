# contex-control-documental.md — Módulo "Control Documental"

Documento de contexto **exclusivo** para el trabajo de incorporar un nuevo módulo de
Gestión Documental (protocolos/procedimientos/instructivos/registros) al sistema,
a partir del Excel `docs/Matriz Control Documental  REG-SGI-MCD-V10.xlsx`.

Estado actual (2026-07-14): **MVP implementado completo — Etapas 1, 2 y 3 hechas
y aprobadas explícitamente por el usuario** (SQL ejecutado en la BD real,
backend y frontend compilando sin errores). Pendiente: **prueba manual del
usuario en `dotnet run`** antes de dar el módulo por cerrado, y **nada de esto
está commiteado todavía** (ver "Para retomar mañana" al final del documento).
Modo de trabajo: seguro (ver `CLAUDE.md` — plan → aprobación → un paso a la
vez).

## Objetivo

Incorporar la gestión documental (hoy llevada en el Excel de arriba) como un
nuevo módulo del sistema (`Control Documental`, nombre tentativo), reutilizando
arquitectura, autenticación, permisos, navegación y base de datos ya existentes.
Sin proyecto aislado, sin microservicios, sin motor documental complejo.

## Resumen del análisis del Excel (11 hojas, 3 ocultas)

- **Codificación** (visible): catálogo maestro de nomenclatura — Área/Sigla (64),
  Tipo de Registro/Sigla (66), Estado del Documento (3 valores oficiales según
  comentario de hilo del propio archivo: `Actualizado`, `En revisión`, `Vigente`).
  **No está enlazado por validación de datos real** — es copiar/pegar manual, por
  eso el resto de las hojas tiene inconsistencias de texto.
- **REG-SGI-MCR -Control de Registr** (visible, 251 filas): matriz maestra de
  Registros/Formularios. Sin columna "Responsable". Sin fórmulas.
- **REG-SGI-MCD -Procedimientos** (visible, 178 filas): matriz maestra de
  Procedimientos/Instructivos. **Única fórmula viva de todo el libro**:
  `=L+365` (próxima revisión = fecha última actualización + 365 días), presente
  en solo 2 de 178 filas — el resto está sobrescrito a mano. Tiene columna
  **PLANTAS** (`F`/`F-I`/`I`) que ya distingue Faret/Innpack/ambos — coincide con
  el modelo multi-empresa que ya existe en el sistema actual.
- **Control de registros innpack** (oculta): listado legado 2019, ya cubierto por
  la hoja de Control de Registros actual. Sin valor para el módulo nuevo.
- **Politicas SGSI** (visible): registro de políticas ISO 27001, único lugar del
  libro con distinción real revisor/aprobador ("Revisadas"/"Aprobadas") — no
  generaliza al resto de tipos de documento.
- **Copias** (oculta) y **Copia de HOJA 1** (oculta): legados/backups sin valor,
  reemplazados por hojas visibles equivalentes.
- **Copias Controladas 2025** (visible, 22 filas): bitácora de copias físicas
  vigentes (documento+versión+ubicación física+responsable). Vínculo con las
  matrices maestras solo por coincidencia de texto del código, no por clave real.
- **Fodas Areas** (visible, 29 filas útiles de 1002): matrices FODA/Riesgos y
  Oportunidades por área — mismo esquema de columnas que las matrices maestras,
  en la práctica es un **subtipo de documento**, no una hoja funcionalmente
  distinta.
- **Revision Procedimientos 25-26** (visible, 8 filas): bitácora del proceso de
  campaña de revisión anual (fecha envío, responsable, fecha respuesta,
  observaciones, estatus) — es el evento operativo que debería disparar la
  fórmula `=L+365` de la hoja de Procedimientos.

### Hallazgos clave para el diseño

1. **El código documental incluye la versión** (`PRO-CDP-V02`) → no hay
   identificador estable que sobreviva a un cambio de versión. El Excel **no
   tiene historial real de versiones**: cada fila es solo la vigente, se pisa al
   actualizar. Esto es la razón de ser del nuevo módulo (agregar lo que el Excel
   no puede dar).
2. **Estado documental ambiguo**: `Vigente` y `Actualizado` conviven sin que
   ninguna fórmula/filtro los distinga funcionalmente. Además aparece un 4°
   valor real `Obsoleto` fuera de los 3 "oficiales" documentados en los
   comentarios del archivo. **Pendiente de confirmar con el usuario** (ver
   preguntas abiertas).
3. Sin macros, sin vínculos externos, sin tablas Excel formales (`ListObject`),
   solo autofiltros. Prácticamente 0 automatización real fuera del `=L+365`.
4. No hay columna "Responsable" en Registros (sí en Procedimientos y Políticas).
   No hay revisor/aprobador salvo en Políticas — no está justificado como campo
   general.

## Arquitectura del sistema relevante (ya confirmada con evidencia)

- Flujo: `PhotinoBridge.send` → `MessageRouter.Handle` (despacha por prefijo de
  `action`) → `<Modulo>Handler` → `<Modulo>Repository` → MySQL `calidad`.
- **Precedente más cercano y más reciente**: módulo **No Conformidades INNPACK**
  (commit `eab1f1e`, ya en `main`, hecho en esta misma sesión antes de esta
  actualización) — mismo día. Referencia directa a copiar el patrón:
  - `sql/no_conformidades_innpack.sql`: 1 tabla maestra + 3 tablas hijas
    (`nc_seguimiento`, `nc_analisis`, `nc_acciones_correctivas`), con
    `creado_por`/`fecha_creacion`/`actualizado_por`/`fecha_actualizacion`,
    `ENUM` de estados, código autogenerado.
  - `src/Backend/Modules/NoConformidades/NoConformidadesHandler.cs`: switch de
    acciones `noConformidades.*`, helpers `Ok()`/`Error()`,
    `TryGetString/Int/Decimal`, `GetCamposEditables()` para create/update
    parcial genérico, acción `.gestion.actualizar` para cambios de
    estado/responsable, `.seguimiento.list/.crear` para bitácora (= lo que
    necesita el historial de versiones del módulo nuevo).
  - Ya registrado en `MessageRouter.cs:126-129` y con botón en
    `index.html:184-193`.
  - **Sin soporte de adjuntos** — módulo puramente texto/numérico.
- **Adjuntos/archivos**: confirmado que **no existe ningún patrón de carga
  (upload)** en todo el backend. Lo único que existe es de solo lectura: una
  columna `ruta_archivo` en tabla hija (`registro_adjuntos`, JOIN en
  `RegistrosControlRepository.cs`) que guarda una ruta/URL, no BLOB. Habría que
  construir la subida desde cero si se aprueba para la 2ª etapa.
- **Navegación**: botón `<button data-module="{nombre}" data-empresa="INNPACK">`
  en `index.html`; `core/app.js` (`loadModule`) carga
  `modules/{nombre}/{nombre}.view.html` + `.controller.js` por convención de
  nombre — no hay manifiesto central que editar.
- **Permisos INNPACK**: solo `"admin"`/`"admin_ti"` tienen lógica real
  (`UsuariosHandler.cs:53`, `app.js:198`), usada hoy solo para el botón
  "Usuarios". El resto de módulos (incluido No Conformidades) son visibles para
  cualquier usuario INNPACK logueado — sin gating adicional todavía.
- Exportación Excel: patrón estándar `core/excel-exporter.js` (`exportTable`).

## Propuesta funcional entregada (MVP)

**Principio**: no clonar las 11 hojas. Reducir a: *documento* (identidad
estable) → *versiones* (historial real, lo que el Excel no tiene) → *ciclo de
revisión anual* (2ª etapa).

### Imprescindible (MVP)
- Registro maestro con código estable + versión vigente **separados** (a
  diferencia del Excel).
- Tipo de documento, área/proceso, alcance (INNPACK/FARET/ambas).
- Estado (Vigente / En Revisión / Obsoleto — pendiente confirmar si
  "Actualizado" debe ser un 4° estado real).
- Responsable, fecha última actualización, próxima revisión calculada
  (+365 días, editable), ubicación (texto/ruta, no archivo subido en MVP),
  observaciones.
- Historial de versiones real (tabla hija, append-only, nunca se pisa).
- Búsqueda, filtros, paginación, exportación Excel — todo con el patrón
  estándar ya existente.

### 2ª etapa (conveniente, no MVP)
- Carga real de archivo adjunto por versión (requiere construir upload).
- Bitácora de campañas de revisión anual (equivalente hoja "Revisión
  Procedimientos 25-26").
- KPIs simples (por vencer, por estado, por área).
- Copias controladas físicas.

### Explícitamente descartado por ahora
- Revisor/aprobador como campos separados (solo Políticas lo sustenta).
- Tabla catálogo de Área normalizada (usar lista curada en frontend).
- Cualquier workflow de aprobación multi-nivel.

## Modelo de datos propuesto (sin crear aún)

**`documentos`**: id, `codigo_base` (único, sin versión), `tipo_documento`,
`area`, `nombre`, `alcance_empresa` ENUM('INNPACK','FARET','AMBAS'), `estado`
ENUM('VIGENTE','EN_REVISION','OBSOLETO'), `responsable`, `ubicacion`,
`observaciones`, auditoría (`creado_por`/`fecha_creacion`/`actualizado_por`/
`fecha_actualizacion`).

**`documento_versiones`**: id, `documento_id` FK (CASCADE), `version`,
`fecha_actualizacion`, `proxima_revision` (calculada, editable),
`es_version_vigente`, auditoría de creación. Único (`documento_id`, `version`).
Append-only — nunca se hace `UPDATE` salvo corrección de `proxima_revision`, y
nunca `DELETE` de documentos con versiones (solo pasan a `OBSOLETO`).

**`documento_revisiones`** (2ª etapa): bitácora de campañas de revisión anual.

**`documento_adjuntos`** (2ª etapa, si se aprueba): mismo patrón de
`registro_adjuntos` (ruta/URL), asociada a `documento_versiones.id` (no a
`documentos.id`, para que cada versión conserva su propio archivo).

## Archivos que se crearían/modificarían cuando se apruebe implementar

Nuevos: `sql/control_documental.sql`,
`src/Backend/Modules/ControlDocumental/ControlDocumentalHandler.cs`,
`src/Backend/Repositories/ControlDocumental/ControlDocumentalRepository.cs`,
`src/UI/www/modules/control-documental/control-documental.{view.html,controller.js,css}`.

Existentes a tocar (mínimo, mismo patrón que el alta de No Conformidades):
- `src/Backend/Services/MessageRouter.cs`: 1 `using` + 1 rama
  `else if (action.StartsWith("controlDocumental"))`.
- `src/UI/www/index.html`: 1 botón de sidebar nuevo, calcado del de No
  Conformidades.

No se toca `core/app.js`, autenticación, layouts, ni ningún otro módulo.

## Plan de etapas (pendiente de aprobación, una etapa a la vez)

0. Análisis y propuesta — **hecho**, esta entrega.
1. SQL de `documentos` + `documento_versiones` (reversible, no toca tablas
   existentes).
2. Backend (`Handler` + `Repository`): list/get/create/update + cambio de
   versión.
3. Frontend (listado + crear/editar) + botón sidebar.
4. Importador inicial desde Excel (uso único): separa `codigo_base`/`version`,
   normaliza estados, crea 1 fila `documentos` + 1 versión inicial por
   documento. Solo hojas "Control de Registros" y "Procedimientos" (las únicas
   con datos reales suficientes). Deja fuera del import automático: Fodas
   Areas, Políticas SGSI, Copias — quedan para revisión aparte.
5. (2ª etapa, opcional) adjuntos, bitácora de revisión anual, KPIs.

## Preguntas abiertas — RESUELTAS (2026-07-14)

1. **¿"Vigente" y "Actualizado" son estados realmente distintos?** → **No.**
   Colapsan en uno solo (VIGENTE). Estado final: 3 valores —
   `VIGENTE` / `EN_REVISION` / `OBSOLETO`.
2. **¿Se necesita cargar el archivo real (PDF/Word)?** → **No en el MVP.**
   Se sigue guardando la ubicación como texto, igual que hoy. Carga real de
   archivo queda confirmada como parte de la 2ª etapa.
3. **¿Quién puede crear/editar documentos?** → **Abierto a cualquier usuario
   INNPACK logueado**, sin gating adicional — mismo criterio que No
   Conformidades hoy.
4. **¿Reconstruir historial de versiones anteriores o arrancar desde la
   vigente?** → **Arrancar desde la versión vigente actual hacia adelante.**
   No se reconstruye historial previo desde "Control Cambios".
5. **¿Políticas SGSI y Fodas Areas en la misma tabla `documentos` desde el
   MVP?** → **No.** Quedan fuera del MVP; el importador inicial (Etapa 4) solo
   toma "Control de Registros" y "Procedimientos".

## Etapa 1 — HECHA (2026-07-14)

`sql/control_documental.sql` creado y **ejecutado contra la BD real**
(`calidad`, 192.168.1.70), aprobado explícitamente por el usuario. Tablas
`documentos` y `documento_versiones` ya existen en producción, vacías, sin
tocar ninguna tabla existente. Verificado con `SHOW TABLES` antes y después.

## Etapa 2 — HECHA (2026-07-14)

Backend implementado y compilado sin errores (`dotnet build`), calcando el
patrón de No Conformidades INNPACK:

- `src/Backend/Repositories/ControlDocumental/ControlDocumentalRepository.cs`
  — `Listar` (paginado + filtros texto/tipo/área/estado/alcance, con JOIN a la
  versión vigente), `ObtenerPorId` (documento + historial completo de
  versiones), `Crear` (transacción: documento + primera versión vigente),
  `Actualizar` (parcial, solo cabecera del documento), `CrearVersion`
  (transacción: desmarca la versión vigente anterior, inserta la nueva,
  nunca pisa ni borra — append-only).
- `src/Backend/Modules/ControlDocumental/ControlDocumentalHandler.cs` —
  acciones `controlDocumental.list/get/create/update/version.crear`, valida
  estado (3 valores) y alcance empresa, calcula `proximaRevision` en +365
  días si no se especifica (misma fórmula que el Excel).
- `src/Backend/Services/MessageRouter.cs`: 1 `using` + rama
  `controlDocumental` (mismo patrón que `noConformidades`).
- Sin acciones de filtros/resumen todavía — fuera del alcance aprobado para
  esta etapa; se evalúan en la Etapa 3 (frontend) si hacen falta para los
  `<select>` de filtro.

## Etapa 3 — HECHA (2026-07-14)

Frontend implementado, calcando el patrón visual/estructural de No
Conformidades INNPACK:

- Nuevos: `src/UI/www/modules/control-documental/control-documental.view.html`
  (listado + filtros + modal Nuevo/Ver/Editar con sección "Versión inicial"
  al crear y "Historial de versiones" + "+ Agregar versión" al ver),
  `.controller.js` (list/get/create/update/version.crear contra las acciones
  de la Etapa 2, paginación, exportación Excel con el patrón estándar
  `ExcelExporter.exportTable`), `.css` (scoped a `.control-documental-module`
  / prefijo `cd-`, mismo estilo que `ncq-`).
- Los `<select>` de filtro Tipo/Área se pueblan con los valores ya cargados
  en el listado (sin catálogo propio ni acción `filtrosOpciones` nueva —
  fuera del alcance aprobado en la Etapa 2).
- `index.html`: 1 `<link>` de CSS + 1 botón de sidebar nuevo
  (`data-module="control-documental"`), insertado entre "No Conformidades" y
  "Laboratorio", mismo patrón que los demás módulos INNPACK.
- No se tocó `core/app.js` ni ningún otro módulo.
- Verificado: `dotnet build` sin errores/advertencias, y arranque real de la
  app (`dotnet run`) sin excepciones en el log de inicio. **Limitación**: no
  se hizo clic-a-clic en la ventana Photino (no hay forma de interactuar
  visualmente con la app en este entorno) — falta que el usuario confirme el
  flujo completo (crear documento, agregar versión, filtrar, exportar) en
  `dotnet run` antes de dar por cerrado el módulo.

## Para retomar mañana

**Estado exacto donde quedó la sesión (2026-07-14)**: MVP completo (Etapas
1-3) implementado y funcionando (build OK, arranque sin excepciones), pero
**sin probar clic a clic** y **sin commitear**.

### Archivos nuevos (sin trackear en git — `git status` los muestra como `??`)
- `contex-control-documental.md` (este archivo)
- `sql/control_documental.sql`
- `src/Backend/Modules/ControlDocumental/ControlDocumentalHandler.cs`
- `src/Backend/Repositories/ControlDocumental/ControlDocumentalRepository.cs`
- `src/UI/www/modules/control-documental/` (`.view.html` / `.controller.js` / `.css`)

### Archivos existentes modificados para este módulo
- `src/Backend/Services/MessageRouter.cs` (1 `using` + rama `controlDocumental`)
- `src/UI/www/index.html` (1 `<link>` CSS + 1 botón sidebar)

Ojo: `git status` también muestra `QualityControlCenter.csproj`,
`installers/QualityControlCenter.iss` y
`src/Backend/Modules/Dashboard/DashboardRepository.cs` modificados — **esos
cambios son previos a esta sesión de Control Documental, no tocarlos ni
asumir que son parte de este trabajo** salvo que el usuario lo confirme.

### Pasos concretos al retomar
1. Preguntar al usuario si ya probó el módulo en `dotnet run` (crear
   documento, ver detalle, agregar versión, filtrar, exportar Excel) y si
   encontró algo que corregir.
2. Si todo OK y el usuario lo pide, ofrecer hacer commit (**nunca sin
   pedirlo explícitamente** — regla del modo seguro). Revisar primero que el
   commit no arrastre los 3 archivos modificados ajenos a este trabajo, salvo
   que el usuario confirme que también quiere incluirlos.
3. Recién después, evaluar si se aprueba la **2ª etapa** (no MVP, nada
   implementado todavía): importador desde el Excel original (Etapa 4 del
   plan original — separa `codigo_base`/versión, normaliza estados, solo
   hojas "Control de Registros" y "Procedimientos"), adjuntos reales por
   versión, bitácora de campañas de revisión anual, KPIs simples.
