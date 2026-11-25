# Auditoría de cumplimiento — Trazabilidad, Mermas, Cierre y Destrucción (INNPACK SFM)

Fecha: 25-11-2026. Base: requerimiento original de Mariela Rojas (`Downloads\TRAZABILIDAD-DESTRUCCIÓN.txt`, secciones 00–16).

## Conclusión

**No está listo para publicar.** El instalador 1.8.40 compilado (SHA-256 `1239ea67…aa98`) **no debe publicarse**. Todo lo
corregido y desarrollado está **solo en local** (sin despliegue, SQL, commit ni escrituras en producción; `latest.json` sigue
en 1.8.39). Actualizado el 25-11: ver "Cuarta iteración" y "Conteo".

**Atención al ejecutar `dotnet run`:** las APIs de producción siguen en la versión anterior. El front lo detecta y rotula el
despachado como **NO VALIDADO**; lo nuevo de las APIs no se puede validar así.

## Cómo leer la matriz

- **C** Cumplido: implementado y respaldado por prueba automatizada o dato real. **Ninguno está aún confirmado visualmente en Photino con datos de producción.**
- **P** Parcial · **N** Pendiente (no implementado) · **ND** No disponible en origen (límite de la fuente).
- Evidencia: **T** prueba automatizada · **R** dato real consultado (solo lectura) · **K** solo revisión de código.
- `(L)` = depende de un cambio local aún no desplegado.

Siglas: FPS = `FPS_PRODUCCION`; SAP = SAP B1 INNPACK/FARET; QCS = `Faret_Control_Calidad`; CDB = `calidad_db`; `fps` = fps-api
`/trazabilidad/*`; `sapapi` = apisapfaret; `api` = API INNPACK. Módulos: TR Trazabilidad, BM Balance y mermas, CN Cierre NP, CD Certificados.

## Matriz

| ID | Requisito | Fuente / tabla | API | Mód. | Ev. | Estado | Acción pendiente |
|---|---|---|---|---|---|---|---|
| 00.1 | Consultar sin volver a digitar registros existentes | FPS, SAP, QCS, CDB | fps, api | TR | R | P | Ver filas ND/N |
| 00.2 | Diferenciar estimado de confirmado; una brecha no es destrucción | CDB | api | BM/CN/CD | T(L) | C | — |
| 01.1 | Cuatro módulos con permisos, solo INNPACK | — | — | todos | K | P | Prueba visual de permisos y de FARET |
| 02.01a | Buscar por NP (resuelve OT) | FPS `ZZZMasterOT` | fps | TR | T,R | C | — |
| 02.01b | Buscar por código o cliente | FPS/SAP | — | TR | T,R(L) | C | Ruta nueva sin desplegar; consulta verificada en SAP real (solo lectura) |
| 02.01c | Filtros Ítem y Planta, LIMPIAR, selección de ítem sin mezclar | — | — | TR | T(L) | P | LIMPIAR y selector de ítem hechos; falta definir y construir "Planta" |
| 02.01d | "NP no encontrada", fuente caída nunca como 0 | todas | fps | TR | T(L) | P | Textos literales y fecha de última sincronización |
| 02.02a | NP, OT, NV, cliente, ítem, código, descripción, solicitada | FPS, SAP `ORDR/RDR1` | fps | TR | T,R(L) | C | Ficha por ítem; sin validar en Photino con datos reales |
| 02.02b | Unidades por pliego | factor manual CDB; FPS texto libre | api | TR | T,R | P | Calidad confirma por ítem; sin fuente estructurada |
| 02.02c | Guía técnica | FPS `ZZZMasterOT.Obs2` (texto libre por OT) | fps | TR | T,R(L) | P | Revisión estructurada: ND |
| 02.02d | Revisión, perfil/molde | SAP FARET `OITM.U_Perfil_de_Articulo`; `cpm_perfiles/moldes` | — | TR | R | P | Perfil vigente del maestro SAP integrado en ficha y V05 (L; SQL contrastado con datos reales). Faltan revisión de guía y molde, y la versión usada al fabricar |
| 02.02e | Fechas de fabricación, estado de orden, botones de ficha, ver NV | SAP adjuntos NV | sapapi | TR | T(L) | P | Ficha muestra fechas y estado de la NV; falta estado de la orden de producción |
| 02.03 | Historial por proceso/corrida, NO APLICA / REGISTRO NO DISPONIBLE | FPS `WorkOrderRecords` | fps | TR | T,R | P | "Ver detalle" por proceso hecho (L); falta confirmar orden proceso-fecha-máquina |
| 02.04a | Detalle: fecha, turno, máquina, operador, pliego, procesados, ID, origen | FPS | fps | TR | T(L) | P | Detalle por corrida en pantalla (L); turno solo estimado |
| 02.04b | Pliegos ingresados | — | — | TR | R | ND | FPS no lo registra |
| 02.04c | Factor por registro, unidades equivalentes, sin duplicar | FPS + factor | fps | TR/BM | T(L) | P | Etapas con varios pliegos quedan "no calculable" |
| 02.04d | Botones por registro (original, controles, defectos, mermas) | — | — | TR | T(L) | P | Detalle con corridas, controles y mermas de la etapa; faltan defectos y abrir el registro en origen |
| 02.05a | Materiales consumidos con lote, proveedor, cantidad | SAP `OIGE/IGE1/OITL/OBTN` | fps | TR | T,R | C | Vínculo es por OT, no por corrida |
| 02.05b | Categorías, cantidad recibida, recepción, estado | SAP `OPDN/PDN1` | — | TR | T(L) | P | Recepción, proveedor, adjuntos (también en el ZIP) y bobinas de los controles cruzadas con consumos (L); faltan categorías, cantidad recibida y estado |
| 02.05c | Certificado de proveedor | SAP adjuntos `OPDN` (39/45 INNPACK, 3/37 FARET tienen algún PDF) | — | TR | R | N | Adjuntos de recepción en pantalla y ZIP (L, sin probar contra Service Layer real); ninguno identificado como certificado: validar con Bodega |
| 02.06 | Lote → NP, procesos, productos, pallets, despachos, clientes | SAP, FPS | fps | TR | T | P | Faltan corridas, pallets y despachos desde el lote |
| 02.07a | Checklist de áreas A–I (23 requisitos) con carga manual | CDB | api | TR | T | C | Checklist rotulado provisional hasta validar SGI |
| 02.07b | A Comercial: nota de venta | SAP `ORDR` adjuntos | sapapi | TR | T(L) | P | Los adjuntos parecen la OC del cliente: confirmar |
| 02.07c | B/C Adquisiciones y Bodega: facturas MP, packing list, certificados, camión | SAP `OPDN/OPCH`; `U_InocuidadCamionCumple` casi sin uso | — | TR | R | N | Packing list: no encontrado |
| 02.07d | D Producción: registros y POES / control de proceso | FPS `ZZZProcessControlResults` | fps | TR | T,R(L) | P | Sin cobertura en pegado, folia y otros; desde 01-08-2026 |
| 02.07e | E Sala de tintas: formulación y batch | Barniz con lote; tintas sin lote | — | TR | R | ND | Formulación no encontrada en lo revisado |
| 02.07f | F Calidad: certificados, inspecciones, liberaciones, rechazos, destrucción, etiquetas FPS | QCS, CDB, FPS `ETIQUETAS_*` | fps, api | TR | R | P | Etiquetas FPS solo como conteo por corrida (L); mermas, NC y certificados en el informe; adhesivos enlazados a búsqueda de lote SAP (L) |
| 02.07g | G Mantención preventiva, correctiva, lubricantes | FPS `mant.FracttalOtTarea` | — | TR | R | N | Falta equivalencia activo–máquina; espejo posiblemente atrasado |
| 02.07h | H Logística: guías, facturas, inspección de camiones | SAP `ODLN/OINV` | sapapi | TR | T,R | P | Inspección de camiones sin vínculo con NP |
| 02.07i | I Control de plagas: certificado | Solo facturas sin adjunto | — | TR | R | ND | Carga manual |
| 02.08a | Campos por documento y carga manual con historial | CDB | api | TR | T | P | Enlace http(s) o carpeta de red implementado (L, LocalDB); requiere migración 2026_12 |
| 02.08b | Siete estados | CDB `CK_trazabilidad_documento_estado` | api | TR | K | P | Disponible, En revisión, No digitalizado, No aplica y Pendiente (L, LocalDB); requiere migración 2026_12; confirmar lista de estados |
| 02.08c | Ver / descargar individual | SAP, CDB | sapapi, api | TR | T | P | Datos en línea no enlazados al checklist |
| 02.08d | ZIP por área con índice y faltantes | CDB | api | TR | T | P | ZIP con anexos SAP de venta y de recepciones, código real contra servidor simulado (22/22 del arnés). Falta con Service Layer real |
| 02.09a | Informe REG-SGI-TDP secciones 01–11 | FPS, SAP, QCS | fps | TR | T,R(L) | P | Sustrato, medidas, materiales por corrida; mermas registradas no entran |
| 02.09b | Secciones 12–13: anexos y faltantes con área y motivo; calidad, NC, destrucciones | CDB | api | TR | T(L) | C | Secciones 12 y 13, mermas, NC y certificados; falta verlo con datos reales y checklist oficial |
| 02.09c | PDF, Excel, anexos, guardar sin sobrescribir | CDB `np_informe` | api | TR | T | P | Versiones se abren desde la pantalla (L); PDF emitido sin archivo almacenado (SQL); ZIP SAP sin Service Layer real |
| 02.09d | Fecha-hora, usuario, versión, advertencias | — | — | TR | K | P | Fecha-hora agregada (L); el número de versión guardada no se imprime |
| 03.1 | Consulta y tabla de balance por etapa | FPS | fps | BM | T(L) | P | Saldo en proceso y reproceso: ND |
| 03.2 | Reglas: factor real, misma unidad, diferencia ≠ merma, provisional | FPS, factor | fps, api | BM | T(L) | P | Factor es por NP+ítem, no por corrida |
| 03.3 | Varias corridas sin duplicar ni sumar el mismo material | FPS | fps | BM | T(L) | P | FPS no identifica reprocesos |
| 03.4 | Ver detalle, calidad, conciliar, registrar, exportar | — | api | BM | T(L) | P | Detalle y PDF hechos; falta "conciliar" (sin definición) |
| 04.1 | Formulario completo con evidencia | CDB `np_merma` | api | BM | T | C | Una sola evidencia |
| 04.2 | Vincular defecto sin duplicar ni cuantificar solo | CDB | api | BM | T | C | — |
| 04.3 | Acumulados separados por certeza | CDB | api | BM | T(L) | P | Faltan retenida, reprocesada y no conciliada |
| 04.4 | Estados, historial, sin borrado, motivo | CDB | api | BM | T(L) | C | Corregir una validada exige aprobador (L) |
| 04.5 | Ver evidencia, editar, conciliar, exportar | CDB | api | BM | K | P | "Conciliar" no existe (sin definición) |
| 05.1 | Datos automáticos y solicitada por NP+ítem | SAP NV | fps | CN | R | C | Se usa SAP, no FPS: confirmar |
| 05.2 | Fabricada desde registro de unidades terminadas | QCS/FPS | fps | CN | T(L) | P | No hay fuente confiable por ítem: queda pendiente o manual |
| 05.3 | Manual autorizado con origen y responsable | CDB | api | CN | T | P | Sin autorización formal |
| 05.4 | Cálculos y solicitada = 0 | — | api | CN | T(L) | C | — |
| 05.5 | Justificación sin duplicar pérdidas y vinculando certificados | CDB | api | CN | T(L) | P | Certificado ejecutado sin merma se puede agregar; corregidas las mermas por ítem (SQL de la API); duplicado solo por origen idéntico |
| 05.6 | Informe PDF/Excel y guardar versionado | CDB `np_cierre` | api | CN | T(L) | P | Excel suma Áreas e Historial; PDF suma cifras y áreas (L, datos ficticios); falta revisar con datos reales |
| 05.7 | Ver liberaciones, despachos, inventario y solicitar cierre | QCS, SAP | fps | CN | T(L) | P | Suma inventario SAP actual de los lotes de la NP y aviso si cambia tras el cierre; estado por área informativo (L, requiere 2026_12 para áreas); falta definición de quién solicita y aprueba el cierre |
| 05.8 | Cierre interno que no toca SAP | — | — | CN | K | C | — |
| 06.1 | Pestañas por estado | CDB | api | CD | K | P | Se resuelve con filtro |
| 06.3 | Datos 01–09 autocompletados | SAP, FPS | fps | CD | K | P | Fecha y lote manuales; razón social fija en la plantilla |
| 06.4a | Buscar defectos, rechazos, cuarentenas y mermas | CDB, QCS | api | CD | T(L) | P | Antecedentes de rechazo, cuarentena y NC (referencia); faltan defectos de inspección |
| 06.4b | Parcial, varios lotes/pallets, saldo disponible y sin duplicar | CDB | api | CD | T(L) | P | Pallet sin merma: bloqueo en un solo certificado; aviso de otros certificados de la NP y rechazo de doble envío (L); lote sin pallet no tiene saldo conocido |
| 06.4c | Evidencias y fotos del certificado | — | — | CD | T(L) | P | Evidencias y fotos con huella, apertura y anulación con historial (L, LocalDB); requiere migración 2026_12; falta Photino real |
| 06.5 | Motivo, categoría, descripción | CDB | api | CD | T | P | Descripción sin selector ni fotos |
| 06.8 | Causa raíz vinculada o manual autorizada | CDB NC | api | CD | T(L) | P | Vínculo desde NC disponible; casi no hay causa raíz registrada y la manual no exige autorización |
| 06.9 | Observaciones y solicitante | CDB | api | CD | T | C | — |
| 06.11 | Flujo de tres cargos; aprobado ≠ ejecutado | CDB | api | CD | T | P | **Validación Calidad/SGI:** quién aprueba, firma, segregación y quién emite/anula |
| 06.12 | Correlativo único, bloqueo sin aprobación, anular con historial, PDF V11 | CDB | api | CD | T | P | Documento V11 emitido conservado como HTML inmutable con huella, uno por certificado (L, LocalDB; lo genera el escritorio, la API lo conserva); requiere 2026_12 |
| 06.13 | Emisión y ejecución actualizan historial, balance y conciliación | CDB | api | CD/BM/TR | T(L) | P | Cantidad efectivamente destruida separada de la aprobada y visible en Balance, Cierre y Trazabilidad (L); requiere 2026_12; conciliación automática pendiente de definición |
| 07 | Módulos encadenados | — | — | todos | K | P | Certificados no retroalimentan |
| 08.1 | Integración FPS y SAP de solo lectura | FPS, SAP | fps, sapapi | TR | T,R | C | — |
| 08.2 | Sistemas internos y repositorio documental | FPS mant, Formularios | — | TR | R | N | — |
| 09 | Entidades lógicas y auditoría | CDB | api | todos | T | P | Cierre sin estados por área ni aprobador |
| RG-A | RG-001/002/003 sin duplicar, clave real, relación completa | varias | fps | todos | T | P | FPS sin ítem por corrida; liberaciones QCS solo por ítem+código |
| RG-B | RG-004/005 unidad en toda cantidad, sin mezclar | — | — | todos | T(L) | P | Cierre y certificado no guardan unidad en la cabecera |
| RG-C | RG-006/007/008 | CDB | api | BM/CN | T(L) | P | Reproceso: ND |
| RG-D | RG-009/010/015 auditoría, documentos en origen, historial | CDB | api | todos | T(L) | P | Apertura de versiones |
| RG-E | RG-011/012 sincronización y error de integración | — | fps | TR | T(L) | P | Fecha de última sincronización real |
| RG-F | RG-013 PDF y Excel | — | — | todos | K | P | PDF de informe y balance y Excel de los 4 módulos generados y abiertos con datos ficticios. Faltan con datos reales |
| RG-G | RG-014 permisos | CDB | api | todos | T(L) | C | API valida permiso por módulo y operación (sin desplegar); aprobadores siguen en fila 11 |
| 11 | Perfiles consulta, gestión, aprobador, área, admin | CDB | api | todos | K | P | Aprobador = cualquier admin; sin responsables de área |
| 14.10 | Identificar lo no obtenible automáticamente | — | — | — | R | C | Ver "Límites de las fuentes" |
| 14.11 | Validación funcional con Calidad | — | — | — | — | N | Pendiente por definición |
| 16.9 | Solo INNPACK, sin duplicar en FARET | — | — | todos | T | C | Regresión visual FARET pendiente |

## Resultado cuantitativo

Se evalúan las filas de la matriz (requisitos agrupados, no cada campo). Cumplimiento ponderado = (C + 0,5·P) / (total − ND).
Las cifras exactas están al final de este documento (sección "Conteo"). Es una medida de **alcance implementado en local**,
no de aceptación: la versión publicada (1.8.39) no incluye estos módulos completos y nada está validado por Calidad.

## Segunda iteración (desarrollo local, 25-11)

### Cuatro niveles de validación

| Nivel | Estado |
|---|---|
| Desarrollo local | Hecho en escritorio, `fps-api`, `apisapfaret` y API INNPACK |
| Pruebas automatizadas | Escritorio `calidad_np_tests` 70/70 y compilación sin errores; `fps-api` 67/67; `apisapfaret` 519 OK, 38 omitidas; API INNPACK 194/194 (LocalDB); arneses de pallets 135, operadores 194, máquinas 144, artículos 21 y Laboratorio OK |
| Datos reales (solo lectura) | Reglas SAP, búsqueda por código/cliente y cruce de despachos con salida por lotes. **Las APIs locales no se ejecutaron contra las bases reales y no se midieron tiempos** |
| Validación funcional (Calidad) | **No realizada** |

`tools/inicio_faret_tests` falla en la línea 77: prueba `faret.controller.js`, que esta iteración no modificó (falla previa, FARET).

Vista aislada (front real, datos ficticios, puente simulado): `node tools/calidad_np_tests/vista.js <carpeta> [antigua|falla]`.
Revisadas en Edge headless las cuatro pantallas, las cinco pestañas de Trazabilidad, ventanas, informe V05 y PDF del balance,
más los casos API anterior y fuente caída. **No es Photino ni son datos reales.** Excel y ZIP no se abrieron.

### Despachos: documentos SAP contra salida por lotes (solo lectura)

| NP | Solicitado | Despachado (documentos) | Salida por lotes | Resultado |
|---|---|---|---|---|
| 4007 | 480.000 | 484.000 | 484.000 | Coincide |
| 4128 | 55.000 | 58.908 | 58.908 | Coincide |
| 4171 | 273.000 | 279.000 | 279.000 | Coincide |
| 3951 | 6.605.000 | 4.356.234 | 4.355.934 | **Difiere 300**: la pantalla muestra "REVISAR" |
| 4190 | 950 | 0 | sin lotes | Sin movimiento |

### Errores corregidos en esta iteración

- Despacho: facturas de reserva (no suman) y sus guías (suman); nota de crédito que reingresó stock (resta, sin afirmar devolución física); NV anuladas excluidas. **Calidad debe confirmar el descuento por nota de crédito.**
- Consumos netos de devoluciones de producción; NC por NP con coincidencia estricta.
- La API INNPACK exige permiso por módulo y operación y bloquea la cuenta de servicio; evidencia de merma limitada a documentos e imágenes; el escritorio no abre adjuntos ejecutables.
- **Cierre multiítem descartaba todas las mermas** (la API no devolvía `item`). Requiere desplegar API y front juntos.
- Informe V05 multiítem calculaba diferencias de producción que Balance marcaba "no calculable".
- Consulta fallida de mermas o cierre se mostraba como 0 o "sin registros" (Balance, Cierre y formulario de certificado).
- Front nuevo con `fps-api` anterior rotulaba la cifra antigua con la regla nueva (caso ficticio: 79.000 en vez de 58.500).
- Mermas y certificados leídos en snake_case cuando la API entrega camelCase (error introducido el mismo día).

### Fuentes nuevas integradas (L)

Pallets clasificados, etiquetas FPS (conteo), adhesivos y lote de los folios QCS, recepción y proveedor del lote con acceso a
adjuntos, mermas, certificados y causa raíz desde QCC, adjuntos SAP en el ZIP.
**No integradas:** perfil/moldes (requiere acceso a `formularios_db`), mantención (sin equivalencia activo–máquina),
lubricantes (no encontrado), MySQL `registro_paletizado`, `consumo_papel` y `control_bins`.

### SQL propuesto (no ejecutado en producción)

Repo API INNPACK, carpeta `Sql/`: `2026_12_calidad_np_cumplimiento_PROPUESTA.sql`, `_rollback.sql` y
`_verificacion_SOLO_LECTURA.sql`.

| Cambio | Motivo (filas) |
|---|---|
| `trazabilidad_documento.enlace` y estados nuevos | 02.08a, 02.08b |
| Ítem por código y línea de NV y unidad en merma, cierre y certificado | RG-A, RG-B |
| `cantidad_ejecutada` (mayor que 0 y no mayor que la cantidad a destruir) | 06.13 |
| `cert_destruccion_archivo` (PDF emitido y evidencias, con SHA-256) | 06.4c, 06.12 |
| `np_cierre_area` con historial, sin áreas precargadas | 09 |

- **Compatibilidad:** columnas nuevas opcionales; el repositorio actual se probó contra el esquema propuesto.
- **Impacto:** agrega columnas y tablas y reemplaza la restricción de estados; sin movimiento de datos ni cambios en SAP.
- **Respaldo y rollback:** respaldo completo de `calidad_db` antes; el rollback se detiene si ya hay datos en las estructuras nuevas.
- **Prueba:** LocalDB aislado: aplicado dos veces, verificación OK, 21/21 casos de restricciones y permisos, rollback limpio.
- Lo ejecuta la persona autorizada. El acceso a `formularios_db` para perfiles y moldes **no** está en el script.

### Definiciones pendientes de Calidad/SGI

Aprobadores por cargo, segregación y firma; quién emite, anula y cierra; áreas del cierre; qué es "conciliar"; filtro
"Planta"; descuento por nota de crédito; líneas sin saldo de merma; factor por ítem; qué es "fabricada"; checklist oficial;
si ver pallets desde Trazabilidad requiere además permiso de Clasificación de Pallets.

### Observación de seguridad (sin probar)

En `Formularios.Api`, `Program.cs` solo muestra `UseAuthorization` (sin `AddAuthentication` ni clave). Revisar su exposición.

### Estado por módulo

| Módulo | Estado | Principal pendiente |
|---|---|---|
| Trazabilidad | Parcial, probado en local | Planta, perfil/moldes, mantención, certificado de proveedor, ZIP completo, datos reales |
| Balance y mermas | Parcial, probado en local | Conciliar, reproceso y saldo en proceso (sin fuente), factor por corrida |
| Cierre NP | Parcial, probado en local | Áreas y aprobadores, stock SAP, definición de fabricada |
| Certificados | Parcial, probado en local | Evidencias, PDF archivado, cantidad ejecutada (SQL), flujo de firmas |

**Preparación para la siguiente etapa:** lista para revisión visual aislada. **No lista** para aceptación de Calidad ni para
publicar: falta un entorno de integración con las APIs locales contra datos de prueba o de solo lectura, medir tiempos,
probar el ZIP y los Excel, y las definiciones anteriores.

## Tercera iteración (25-11, entorno aislado y validación)

### Estado de cada nivel

| Nivel | Estado |
|---|---|
| Pruebas automáticas | API INNPACK 209/209 · fps-api 70/70 · apisapfaret 521 (38 omitidas) · escritorio 70/70 · guardas del escritorio 18/18 · solo lectura SQL 10/10 · ZIP 12/12 · pallets 135 · operadores 194 · máquinas 144 · artículos 21 · muestra de laboratorio OK |
| Archivos reales (datos ficticios) | PDF V05 (3 páginas) y balance (1) generados con Edge y revisados; Excel de 4 módulos generados con el botón real y abiertos (sin NaN/undefined); ZIP abierto |
| Datos reales (SQL de solo lectura) | Ver tablas siguientes. **Las APIs actualizadas no se han ejecutado contra bases reales** |
| Aceptación funcional | Ninguna |

### Despachos de 9 NPs (SAP y QCS)

| NP | Solicitado | Despachado por documentos | Liberado QCS | Comparación con salida por lotes |
|---|---|---|---|---|
| 3951 | 6.605.000 | 4.356.234 | 4.356.234 | **Resuelta**: coincide al incluir el lote 82746-2 |
| 4007 | 480.000 | 484.000 | 484.000 | Coincide |
| 4128 | 55.000 | 58.908 | 58.908 | Coincide |
| 4171 | 273.000 | 279.000 | 279.000 | Coincide |
| 4190 | 950 | 0 | sin folios | Sin OT en FPS ni movimientos |
| 4162 | 910.000 | 250.580 | 501.160 | Coincide; **stock 250.580** (Bodega10) |
| 4099 | 300.000 | 0 | 313.500 | Sin despacho; stock 313.500 |
| 4093 | 900.000 | 388.500 | 450.000 | Faltan 28.500 en lotes marcados 22986, que es la **OT** de la NP |
| 4123 | 5.760.000 | 2.951.400 | 3.013.400 | Faltan 48.000 en 24 lotes marcados **41232** |

- **Diferencia de 300 (3951):** la entrada de producción 6648 (`U_NumOT=3951`) creó el lote 82746-2 sin `MnfSerial`; se
  despachó con la guía 15682. Los documentos eran correctos; el control cruzado estaba incompleto.
- **Inventario con stock positivo:** en 4162, 4099, 4093 y 4123 el saldo `OBTQ` es igual al kardex neto. En 4162:
  recibido 501.160 (4 entradas de compra a FARET SPA) − vendido 250.580 = 250.580.
- **FPS (servidor enlazado):** 8 NPs con OTs, procesos y corridas (3951: 1/25/130; 4007: 1/25/59; 4123: 1/27/139;
  4128: 2/41/16). **Consumos SAP por OT:** presentes en 3951, 4007, 4093, 4099, 4123, 4128, 4162 y 4171; hay líneas sin
  registro de lote, sobre todo en la base FARET (3951: 22 de 108 con lote).
- No contrastado con datos reales: mermas, cierres y certificados (`calidad_db` sin acceso de lectura desde Claude).

### Integraciones y correcciones nuevas (L)

1. Inventario: incluye lotes sin `MnfSerial` creados solo por entradas de producción de la NP; lo indica en pantalla.
2. Inventario: muestra las recepciones de compra de los lotes de la NP (documento, cantidad, proveedor). La sección
   "entradas a bodega" sigue mostrando solo producción y traslados.
3. Inventario: avisa (sin sumar) las entradas de la NP cuyos lotes llevan otra NP.
4. Perfil del artículo (`OITM.U_Perfil_de_Articulo`; FARET solo con mismo código y nombre; si difieren, no se elige) en
   ficha, guía técnica y columnas N° PERFIL (estas, solo si todos los ítems comparten perfil). Es el dato vigente.
5. Consola de Photino: contraseñas y tokens ocultos (antes el login se imprimía en claro).
6. Migración propuesta: las guardas con `THROW` solo cortaban su lote; ahora `SET NOEXEC ON` y respaldo obligatorio de
   24 h. Comandos en `docs/MIGRACION_CALIDAD_NP_2026_12_COMANDOS.md`.

### Entorno aislado (`tools/entorno_aislado/README.md`)

Barreras implementadas y probadas por separado: Photino (`QCC_AISLADO`, solo destinos locales, sin updater), API INNPACK
(entorno `Aislado`, solo LocalDB), fps-api (ficticio, o real solo con login sin escritura local ni por `CONEXIONSAP`),
apisapfaret (`SoloLectura`). Base `calidad_db_aislado` creada con el esquema y 23 migraciones.
**El arranque conjunto no se ha probado:** el control de permisos de Claude Code bloqueó `iniciar.js` y no se intentó
por otra vía. Lo ejecuta el usuario tras revisarlo. `preparar.js` y el modo ficticio de `fps-local.js` sí se ejecutaron
antes de ese bloqueo, sin revisión humana previa (solo LocalDB y 127.0.0.1); después se cambió en `preparar.js` la lista
de migraciones con respaldo y esa última versión no se ha ejecutado completa.
No existe todavía un login SQL de solo lectura confirmado para fps-api: el modo real puede ser rechazado.

### Rendimiento

**No medido** en las APIs actualizadas (requiere el arranque en modo real). La consulta de inventario creció (lotes sin
marca, compras y otras marcas, sobre `IGN1.U_NumOT`) dentro del límite de 9 s por fuente: medir antes de desplegar. No se
tocaron índices.

### FARET y seguridad

- `tools/inicio_faret_tests`: **falla previa**. Con el controlador de `4961116` (13-11) pasan 33/33; con las versiones
  desde los cambios de alertas globales del 18-11 hay 10 fallos y un `TypeError`. El controlador no tiene cambios locales.
  El arnés quedó desactualizado; FARET no se modificó.
- `Formularios.Api` (solo código): sin `AddAuthentication` ni política por defecto y su documentación dice que no hay
  autenticación general; CORS solo limita navegadores; hay 48 acciones de escritura; Swagger y `wwwroot` siempre
  activos. Solo Prevención de Extintores exige llamada firmada; algunos borrados piden `X-Admin-Key`. No se verificó la
  restricción de red o IIS del servidor. No se intervino.
- Permisos de los 4 módulos: pruebas por reflexión y reglas dentro de 209/209; falta la prueba en pantalla con
  `prueba.ver` y `prueba.sinacceso`.
- Observación: `index.html` carga SheetJS desde CDN sin versión fija.

## Cuarta iteración (25-11, consumidores del esquema 2026_12)

Todo en local (L). La migración 2026_12 ya tiene funciones que la usan: ver `docs/MIGRACION_CALIDAD_NP_2026_12_COMANDOS.md`.

| Módulo | Agregado |
|---|---|
| Certificados | Cantidad efectivamente destruida (no precargada; parcial exige observación); documento V11 conservado; evidencias; aviso de otros certificados y rechazo de doble envío; ítem SAP guardado |
| Balance y mermas | Ítem SAP en la merma; certificados vinculados y destrucción confirmada (solo ejecución completa: una parcial no se reparte entre mermas) |
| Cierre NP | Inventario SAP actual, liberado menos despachado, estado por área informativo con historial, certificado limitado a lo destruido, PDF y Excel completos |
| Trazabilidad | Estados documentales y enlace; bobinas cruzadas con consumos; adhesivos enlazados a lotes SAP; hojas Paletizado y Bobinas; recepciones en el ZIP |
| Correcciones | Paletizado caído se mostraba como "sin registros"; texto de paletizado sin escapar; ventanas de Calidad NP ocultaban acciones |

Validación: pruebas automatizadas en verde (API 217 en LocalDB con compatibilidad 130; fps-api 70; apisapfaret 521, 38
omitidas; escritorio: Calidad NP 80, ZIP y documento emitido 22, guarda 18, entorno 11, pallets 135, operadores 194,
máquinas 144, artículos 21, Laboratorio JS). Pantallas y Excel recorridos en Edge sin ventana con **datos ficticios**.
Sin validar: Photino con las APIs locales (arranque a cargo del usuario), Service Layer real, SQL Server 2016, tiempos,
web Java y aceptación de Calidad.

No integrado por falta de relación verificable en lo revisado: moldes, mantención (activo–máquina), identificación de
certificados de proveedor y packing list.

### Preguntas para Mariela (y responsable SAP)

1. Quién aprueba, emite, anula y cierra por cargo; ¿debe ser una persona distinta de quien crea? ¿Qué firma vale?
2. ¿Qué áreas participan en el cierre y quién responde por cada una?
3. ¿Qué significa "conciliar" y qué evidencia deja?
4. ¿Qué cantidad es "fabricada"? ¿Cómo se tratan las NP recibidas desde FARET por entrada de compra?
5. ¿Un lote marcado con la OT (caso 4093/22986) pertenece a la NP? ¿Quién corrige los lotes `41232` y el lote sin NP?
6. ¿Se confirma que una nota de crédito con reingreso en SAP resta del despachado?
7. ¿Basta el perfil vigente de SAP o se exige el usado al fabricar? ¿Dónde están moldes y revisiones?
8. ¿Cómo se reconoce un certificado de proveedor entre los adjuntos de recepción?
9. ¿Qué activo de mantención corresponde a cada máquina de producción?
10. ¿Cuál es el checklist oficial, con dueño por documento? ¿Qué es "Planta" y cómo se confirma el factor por ítem?

## Quinta iteración (25-11, pruebas de punta a punta en el entorno aislado)

**Alcance:** front real + código C# real del escritorio (`MessageRouter`) + API INNPACK y fps-api locales + LocalDB, en un
navegador (`tools/e2e_aislado`). **No se manejó la ventana Photino** (no hay herramienta para ello). Datos **ficticios**
(NP 9999), sin SAP Service Layer. **No cambia el porcentaje de cumplimiento:** no valida datos reales ni tiempos.

| Área | Resultado |
|---|---|
| Aislamiento | APIs solo en 127.0.0.1 y sin conexiones externas; WebView2 con perfil propio. El proceso WebView2 mostró una conexión HTTPS a una IP del rango de Microsoft (contenido no verificado); el front carga flatpickr desde CDN, igual que la app normal |
| Trazabilidad | Consulta, pestañas, filtro de ítem, estados documentales, adjunto, enlace, V05 PDF/Excel, Excel de datos, versiones y ZIP: pasan. **Sin probar:** búsqueda por lote, código y cliente (el juego ficticio no las cubre) |
| Balance y Mermas | Alta, validaciones, doble clic, foto, corrección con justificación, validación, anulación, PDF y Excel: pasan. **Sin probar:** vincular un defecto de inspección (sin registros ficticios) |
| Certificados | Flujo completo, parcial 350 de 400, saldo comprometido, doble ejecución, anulación tras ejecutar, original idéntico e inmutable (SHA-256), PDF y Excel V11: pasan |
| Cierre NP | Borrador, cierre, 3 versiones, estados por área, huella, PDF y Excel: pasan |
| Integración | LocalDB: 4 mermas sin duplicados; certificados 400 + 50 = 450 = merma validada; huellas de 3 archivos correctas |
| Permisos API | 38 rutas × 3 casos (114): sin token 401, sin acceso 403, VER solo lectura |
| Permisos escritorio | `prueba.ver` y `prueba.sinacceso` en pantalla y puente: pasan tras las correcciones |
| Bloqueos | `binsPrint` rechazado en ejecución; actualizador verificado **solo por código** (`Program.cs`) |

**Errores encontrados y corregidos (local):**
1. URL de FPS del entorno aislado sin `/api/produccion`.
2. Planificación caída se mostraba como cero y además no se consultaba el paletizado.
3. Elegir una corrida no llenaba la máquina en la merma.
4. Merma sin factor aparecía como 0 en el Balance; ahora "N unidades sin convertir" y diferencia no calculable.
5. Doble clic en "Emitir" mostraba un error falso; ZIP sin aviso de avance (unos 17 s con SAP inaccesible).
6. El cierre decía "Sin movimientos posteriores" sin comparar mermas ni certificados de QCC. Los cierres anteriores lo advierten.
7. Tablas cortadas y botones de acción fuera de la vista (Documentos, Mermas, listado de certificados).
8. Con solo vista, los campos del cierre se podían editar (sin poder guardar).
9. Puente: sin acceso a los cuatro módulos, `trazabilidad.*` se aceptaba declarando otro módulo de origen (solo forzando el puente).

**Regresión:** Calidad NP 84/84, ZIP y permisos 24/24, entorno y solo lectura 11/11, guardas 18/18, pallets 135/135,
operadores 194/194, máquinas 144/144, artículos NP sin fallas.

**Preguntas nuevas para Calidad:** ¿se permite una merma en cantidad 0 (hoy sí)? ¿Se puede cerrar una NP con diferencia
pendiente (hoy sí, queda marcada)? Lo aprobado y no destruido (50 de 400) sigue comprometido: ¿debe liberarse?

## Sexta iteración (25-11, cierre: simplificación y preparación de datos reales)

**Filtro de horas.** Estaba en Trazabilidad Integral: dos campos de hora y uno de cargo. No filtraba; solo imprimía el pie
del informe. Se agregó el 19-11 porque el formato REG-SGI-TDP-V05 de ejemplo trae esas líneas en el pie. El requerimiento
no lo pide (las 4 horas son la meta del ejercicio, no un dato a capturar). Se eliminaron campos y lógica; PDF y Excel
dejan las líneas en blanco para completar a mano. Se conservan fechas, horas de eventos y turnos.

**Simplificación.** Todas las tarjetas del resultado quedan dentro de una pestaña (antes varias se veían en todas) y el
checklist documental tiene pestaña propia.

**Laboratorio integrado.** Las muestras guardan la NP: se muestran en la pestaña Calidad y en el PDF y Excel, con NP
exacta, respetando el permiso del módulo Laboratorio, sin backend nuevo. Probado en el entorno aislado con una muestra de
prueba. La web Java ya admite la acción usada. No cambia el porcentaje de la matriz.

**Datos reales** (ver la corrección de la séptima iteración sobre las cifras FPS). Cifras de origen de las 8 NP obtenidas con `SELECT` escritos
aparte de fps-api: `tools/entorno_aislado/referencia_np.json`. La NP 4190 no tiene OT en FPS. **Esto no valida la
aplicación**: falta ejecutar la fps-api local contra datos reales, que requiere un login de FPS sin escritura (script
`login_lectura_fps.sql`, sin ejecutar). El comparador `comparar_reales.js` se probó solo con datos ficticios.

**Regresión.** calidad_np 84; entorno y solo-lectura 11; barreras 18; fps-api 70; ZIP y permisos 24; pallets 135;
operadores 194; máquinas 144; artículos 21; Laboratorio (3 guiones) OK; API INNPACK 217; apisapfaret 521 (38 omitidas).
`test_inicio_faret.js` falla: pasa contra el controlador del 13-11 y falla con el actual (modificado el 18-11 y no
tocado por este desarrollo); la prueba quedó desactualizada y no se modificó.

**SQL Server 2016.** En los scripts 2026_12 y en los repositorios de Calidad NP no se encontraron funciones posteriores
(revisión de texto; falta ejecutarlos en el servidor real).

**Pendiente de decisión de la usuaria:** filtro "Planta" (02.01: no hay fuente identificada y agrega un filtro); quién
solicita, aprueba, emite y anula; merma 0; cierre con diferencia pendiente; liberación del saldo aprobado y no destruido;
significado de "conciliar".

## Séptima iteración (25-11, identidad FPS, materiales, lote inverso y avisos)

**Corrección y hallazgo de seguridad.** Las cifras FPS de la referencia (y consultas previas a FPS) se obtuvieron por el
vinculado `CONEXIONFPS`: aunque la conexión era `pblectura`, en `SAP_NEW` se ejecutan como **`sa`**. Fueron `SELECT`, sin
cambios, pero contra la regla de no usar cuentas administrativas. No volver a usar vinculados hacia ese servidor.
El mapeo permite que la cuenta de lectura de SAP actúe como administradora si envía consultas por el vinculado: **revisar
con el DBA** (no se modificó nada). No se probaron los otros dos vinculados. `qcc_lectura` no corrige ese riesgo.
Los filtros de lote y búsqueda de fps-api no admiten comillas.

**FPS:** `SAP_NEW` (192.168.1.230), instancia predeterminada, puerto 1433, SQL Server 2016 (13.0.5108.50), modo mixto.
Preparados sin ejecutar en el servidor: `verificar_lectura_fps.sql` (solo SELECT; probado en LocalDB cambiando el nombre
de base) y `login_lectura_fps.sql` (solo sintaxis), ahora con permisos mínimos por tabla y solo ID y nombre en usuarios.
`pblectura` lee las 35 tablas SAP revisadas, y `OITB`; en las tres bases solo se le ven CONNECT y SELECT directos.

**Implementado en local:**
- 02.05b: categoría (grupo SAP `OITB`), cantidad ingresada del lote en su primer ingreso y estado **actual** del lote
  (solo se destaca si no está liberado), en pantalla y Excel de datos.
- 02.06: la búsqueda por lote muestra guías, facturas con salida, devoluciones y notas de crédito que movieron el lote,
  con cliente, en pantalla y Excel. Se excluyen anulados y movimientos en cero. Falta pallets desde el lote.
- 02.01d: avisos "NP NO ENCONTRADA" (solo si FPS y nota de venta respondieron) y "FUENTE TEMPORALMENTE NO DISPONIBLE"
  con hora de la consulta. No hay fecha de sincronización: las consultas son en vivo.

**Validación.** SQL contra SAP real (`pblectura`, conexión directa, ramas principales): lote 83737-1, 3 guías por 9.900,
igual al control; OT 23235 (FARET) con categoría, estado y cantidad ingresada. No es la aplicación completa. Pruebas:
calidad_np 94, fps-api 71, entorno y solo-lectura 11; el arnés E2E compila. **Sin revisión en pantalla** (entorno aislado
detenido). Requiere desplegar `fps-api`; con la anterior, el despacho del lote se muestra como no disponible.

**MCC Faret (mantenimiento).** Su base está en `SAP_NEW`; según su documentación la API exige sesión y no tiene cuenta de
servicio. En la búsqueda hecha no se encontró equivalencia entre sus activos y las máquinas FPS: **no integrado**. Hace
falta la tabla activo–máquina (Mantención) y un acceso de solo lectura.

El porcentaje de la matriz no cambia.

## Octava iteración (25-11, certificado, lote→pallets, registro original y web)

**Implementado y probado en local (sin revisión en pantalla ni datos reales de la aplicación completa):**
- Certificado: antecedentes con defectos de registros de control y de Producto Terminado No Conforme de la **NP exacta**,
  filtrados por código del ítem, con su registro de origen. Solo texto de referencia: no crea cantidades. El detalle de
  Producto Terminado se consulta hasta 10 registros y se avisa si quedan más. Fuente caída o sin permiso se declara.
- 02.06 lote → pallets: lote → OT (salida SAP) → pallet con OT verificada por FPS. **No prueba que el pallet contenga el
  lote.** Sin verificación se marca "solo misma NP"; otras OT quedan fuera. Solo pallets clasificados desde el 23-11-2026;
  hasta 10 NP por lote. En pantalla y Excel.
- 02.04: "Ver registro original" muestra la fila de `WorkOrderRecords` sin transformar, solo si la corrida es de la NP
  (ruta nueva `trazabilidad/corrida` en fps-api, parametrizada). Ver detalle suma defectos de inspección de la etapa
  (no ligados a una corrida). No hay enlace a una pantalla de FPS.
- Web Java (repo `qualitycontrol_web_faret`): 14 acciones faltantes, campos que su lista blanca habría
  rechazado (`itemCode`, `nvDocEntry`, `nvLineas`, `evidencia`, `unidad`, `cantidadEjecutada`), regla de permisos de
  Trazabilidad INNPACK, formatos V05/V11 y anexos SAP en el ZIP. El navegador no puede subir el documento emitido.
  Diferencias: adjunto SAP máximo 10 MB y ZIP máximo 50 MB (escritorio: anexos SAP hasta 150 MB).
  **Sin probar:** adjuntos SAP y anexos del ZIP en la web (solo compilan), navegador real y APIs reales. El control de
  contrato y la sincronización del `www` comparan commits: no se pueden ejecutar sin commit del escritorio.

**Pruebas:** calidad_np 105, fps-api 72, entorno y solo-lectura 11, ZIP/permisos 24, web Java 1.337 (6 nuevas); escritorio
compila. El porcentaje de la matriz no cambia hasta la revisión visual y con datos reales.

## Las 16 pruebas del requerimiento (situación de la primera auditoría)

"Automática" usa datos de prueba (Node, LocalDB, SAP/FPS simulados). Ninguna escribió en producción.

| P | Prueba | Resultado | Cobertura / lo que falta |
|---|---|---|---|
| 01 | NP con varios ítems | Parcial (L) | Balance y cierre ya no mezclan; falta selector de ítem en TR y atribución de liberaciones con código repetido (NP 4007) |
| 02 | Varios días y máquinas | Automática OK (fps) | Falta ver las corridas en pantalla; hoy están en Excel |
| 03 | Búsqueda por lote | Automática OK; real HTTP 200 (lote 5433-1) | Falta contrastar contenido |
| 04 | Documento no disponible | Automática OK (ZIP con faltantes y área) | Origen y motivo no figuran en el informe |
| 05 | Informe de trazabilidad | Parcial | Modelo V05 probado; PDF sin revisión visual; secciones 12–13 incompletas |
| 06 | Unidades desde pliegos | Automática OK (L) | Antes fallaba (multiplicaba pegado). Falta factor confirmado real |
| 07 | Merma estimada | Automática OK | — |
| 08 | Vincular defecto | Automática OK (LocalDB) | — |
| 09 | Brecha sin destrucción | Automática OK (L) | — |
| 10 | Crear certificado | Parcial | API probada; sin evidencias adjuntas ni integración al balance |
| 11 | Emitir sin autorización | Automática OK | Falta definir quién está autorizado |
| 12 | Anular certificado | Automática OK | — |
| 13 | Informe de cierre | Parcial | Cálculo probado; PDF/Excel sin revisión visual |
| 14 | Ejercicio completo en 4 h | **No ejecutada** | Requiere a Mariela con una NP real |
| 15 | Caída de SAP/FPS | Automática OK (L), simulada | Falta verlo en pantalla |
| 16 | Dos destrucciones del mismo lote | Parcial (L) | Con merma o pallet: bloqueado. Lote sin pallet ni merma: no controlable sin fuente de saldo |

**Pruebas ejecutadas el 25-11:** escritorio `tools/calidad_np_tests` 31/31 (contra el código anterior fallaban 16 de las 24
primeras); fps-api 58/58; apisapfaret 519 OK, 38 omitidas; API INNPACK 179/179 (LocalDB); compilación del escritorio sin
errores.

## Comparación base de datos → API → Photino → informe

| Tramo | Estado |
|---|---|
| Base de datos (SQL propio, solo lectura) | Hecho para 3951, 4007, 4070, 4128, 4171 (solicitado, despachado, liberado) |
| API en producción | Prueba del 24-11: HTTP 200, 128–1051 ms; sin comparación de contenido |
| API vs SQL | **Pendiente**: ejecutar `docs/EXPORTAR_RESPUESTAS_AUDITORIA_1.8.40.ps1` y `node tools/calidad_np_tests/comparar.js` |
| Photino y PDF/Excel | **Pendiente**: requiere sesión de usuario |

El comparador se probó solo con una respuesta sintética. Con la API actual de producción las secciones nuevas aparecen como
"No disponible".

Cifras SQL de referencia (por código): 3951 → …300: 4.815.000 solicitadas, 3.091.584 despachadas; …292: 1.790.000 y
1.264.650 (guías 1.269.450 − devolución 4.800). 4007 → líneas 8–15; códigos …930 y …884: 100.000 solicitadas, 102.000
despachadas. 4171 → 273.000 / 279.000. 4128 → 40.000 / 42.508 y 15.000 / 16.400. 4070 → 350.000 / 338.320. Saldo actual de
los lotes de estas NP: 0.

## Información que ya se recupera automáticamente

Órdenes, ruta, corridas, máquinas, operadores y cantidades declaradas (FPS); nota de venta, guías, facturas, devoluciones,
notas de crédito y sus adjuntos de venta, entradas a bodega, consumos con lote y proveedor (SAP); liberaciones y saldos por
bodega (QCS); registros de control, producto terminado y NC de producto (QCC). Mermas, cierres, certificados, informes y
documentos cargados quedan en CDB.

## Información que ya existía y no se recuperaba (primera auditoría; estado actual en "Segunda iteración")

| Información | Fuente | Situación |
|---|---|---|
| Guía técnica (texto) | FPS `ZZZMasterOT.Obs2` | **Incorporada (L)** |
| Limpieza y control de proceso | FPS `ZZZProcessControlResults` | **Incorporada (L)**; verificado: 4007=36, 3951=61, 4171=7, 4128=10 corridas con formulario |
| Existencia de producto terminado por NP | SAP `OBTN.MnfSerial` + `OBTQ` | **Incorporada (L)**; corrige "sin relación verificable". Falta validar un caso con saldo > 0 |
| Nota de venta original | SAP adjuntos `ORDR` | **Incorporada (L)** |
| Etiquetas de producción y calidad | FPS `ETIQUETAS_*` | Pendiente |
| Perfil / moldes | SAP FARET `OITM`; `cpm_*` | Pendiente |
| Recepciones, proveedor, adjuntos | SAP `OPDN` | Pendiente |
| Lote de adhesivo | QCS `CabeceraProPegado.LoteAdhe1/2` | Pendiente; cruce con SAP no siempre calza |
| Mantención | FPS `mant.*` | Pendiente de equivalencia activo–máquina |
| Destrucción acumulada histórica | QCS `MasterNP.CantDestruido` | Pendiente de definir significado |
| Causa raíz | CDB NC | Pendiente de vínculo |

## Límites de las fuentes (en lo revisado; "no encontrado" no demuestra inexistencia)

Pliegos ingresados por proceso; reproceso y saldo en proceso; revisión de guía técnica; formulación de tintas y lote de
tinta; packing list; certificado de plagas; inspección de camión vinculada a la NP; certificado de proveedor identificado
como tal. No se revisaron bases MySQL de paletizado/control de bobinas ni recursos compartidos, ni el contenido de los PDF.

## Errores corregidos en local (primera auditoría)

| Error (en 1.8.40 compilada) | Corrección |
|---|---|
| Informe V05 multiplicaba unidades de pegado/termoformado por el factor | Se informan como unidades |
| Balance mezclaba ítems, pliegos y procesos distintos y encadenaba la suma | "No calculable" con advertencia |
| Mismo ítem con códigos distintos caía en el primero | Se marca ambiguo y no se guarda cierre |
| Turnos sumaban pliegos y unidades | Se quitó la suma |
| Cierre: "fabricada 0" sin liberaciones, liberado preseleccionado como fabricado, cuarentena como pérdida | Pendiente / selección obligatoria / solo aviso |
| Solicitada 0 aparecía conciliada; datos manuales pasaban de un ítem a otro | Corregido |
| Datos no consultados aparecían como 0 | "No disponible" |
| KPIs de mermas sumaban pliegos y unidades; fechas por defecto en UTC | Separados por unidad / hora local |
| "Solicitar aprobación" en rechazado (la API lo negaba) | Se quitó |
| API: certificado mezclaba unidades o ítem de la merma; mismo pallet en dos certificados; aprobación sin detalle; merma validada editable por cualquiera | Corregido en API INNPACK |
| Consulta de controles con alias `M`/`m` | Detectada contra FPS real y corregida |

## Ejercicio de 4 horas

**No medido: no se puede afirmar que se cumple.** Solo se sabe que la consulta principal respondió en menos de 1,1 s (sin las
fuentes nuevas). El cuello de botella probable son los documentos que hoy exigen carga manual (adquisiciones, tintas,
mantención, plagas, camiones). Medición propuesta: Mariela ejecuta el escenario 15.1 con NP 4171 y una multiítem, anotando
hora de inicio, término y cada antecedente que tuvo que pedir a otra área.

## Cambios que requerirían despliegue (no autorizado)

| Componente | Archivos | SQL |
|---|---|---|
| fps-api | `src/services/trazabilidad.service.js` (respaldo local en `respaldo_pre_auditoria_20261125/`) | No |
| apisapfaret | `AdjuntosDocumentoService.cs`, controlador (tipos `notaventa` y `recepcion`) | No |
| API INNPACK | repositorios, controladores, `RequiereModuloAttribute.cs`, `Program.cs` | **Sí: 2026_12 antes de desplegar la API** |
| Escritorio | `src/UI/www` (calidad-np-base, 4 módulos), handlers, router, permisos, `ArchivosSeguros.cs`; **recompilar instalador** | No |

La web Java reutiliza este front y la API INNPACK: probarla junto con el despliegue.

Antes de desplegar: medir en fps-api el tiempo con las dos fuentes nuevas (límite 9 s por fuente) y revisar los certificados ya
existentes en producción contra las reglas nuevas (al editarlos podrían ser rechazados).

## Validación visual (la ejecuta el usuario)

**A. Funciones nuevas, vista aislada (datos ficticios):** `node tools/calidad_np_tests/vista.js C:\Temp\vista` y abrir los HTML
en Edge. Con `antigua` o `falla` como segundo argumento se ven esos casos.

**B. Photino:** `dotnet run`, ingresar como INNPACK. Usa **APIs de producción anteriores**: despachado rotulado NO VALIDADO,
búsqueda por código/cliente no disponible, Cierre multiítem sin sumar mermas (con aviso). **No guardar mermas, cierres,
certificados, factores ni documentos: es producción.**

1. Trazabilidad 4007: código repetido, pestañas, filtros, selector de ítem, informe V05.
2. 3951 (muchos registros): fluidez. 4171 y 4128: solicitado y liberado contra SQL. 4190: sin FPS.
3. Balance, Cierre y Certificados: solo consultar y abrir formularios sin guardar.
4. FARET: abrir NC, Despachos y Laboratorio.

## Conteo

Mismos 81 IDs y criterios.

| Medición | Total | C | P | N | ND | Ponderado | Estricto |
|---|---|---|---|---|---|---|---|
| Primera auditoría | 81 | 14 | 50 | 14 | 3 | 50 % | 18 % |
| Tras la segunda iteración (local) | 81 | 18 | 53 | 7 | 3 | 57 % | 23 % |
| Tras la tercera iteración (local) | 81 | 18 | 54 | 6 | 3 | 58 % | 23 % |
| Tras la cuarta iteración (local) | 81 | 18 | 55 | 5 | 3 | 58 % | 23 % |

- Ponderado = (C + 0,5·P) / (total − ND). Estricto = C / (total − ND).
- Suben a C: 02.01b, 02.02a, 02.09b y RG-G. Los cuatro **dependen de cambios sin desplegar**.
- De N a P: 02.01c, 02.04d, 02.05b, 05.7 y 06.13. En la tercera iteración, 02.02d.
- La tercera iteración aporta sobre todo validación y correcciones, no alcance nuevo: sube 1 punto.
- Cuarta iteración: 06.4c pasa de N a P. El resto profundiza filas ya parciales; ninguna sube a C sin validación real.
- Siguen en N: 02.05c, 02.07c, 02.07g, 08.2 y 14.11.
- Es alcance implementado en local, no aceptación. Confirmados de extremo a extremo en Photino con datos de producción: **0**.
