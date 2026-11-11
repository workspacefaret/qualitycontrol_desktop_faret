# Fase 34 — Integración real con FPS: Evaluación de Calidad por Operador (FARET)

Fecha: 11-11-2026 · Estado: **NO TERMINADA** (el endpoint nuevo de FPS no está desplegado; sin él la pantalla no muestra operadores reales). Sin commit, sin push, sin despliegues, sin SQL, sin reinicios, sin instalador publicado.

## 1. Conclusión corta

- El módulo ya **no depende del campo "Operador" de Data**: atribuye contra las **sesiones reales de producción de FPS** (documento → máquina → día → personas).
- Con los datos reales (354 PNC) y el endpoint de laboratorio ya desplegado (cobertura parcial) el motor produce operadores reales de FPS: 35 PNC confirmadas técnicamente, 20 personas involucradas.
- El resultado completo **depende del endpoint nuevo** `GET /api/produccion/sesiones-documentos` (implementado y probado, **sin desplegar**). Hasta desplegarlo, la pantalla muestra "Infraestructura pendiente" y ninguna cifra por persona. No se simula nada.
- Hallazgo de fondo: **el campo Máquina de Data no es confiable como máquina** (un 15 % son sectores como DESPACHO/COMERCIAL) y **la fecha de fabricación de Data suele no coincidir con las sesiones de FPS** (ver §6).

## 2. Origen del dato "Operador" en Data (auditado)

`importacion_pnc.operador` es `VARCHAR(150)` de texto libre: viene de la columna "OPERADOR" del Excel de carga masiva o del formulario Nueva NC (sugerencias de `cat_operadores`). No hay clave a los usuarios de FPS. Por eso no puede ser la identidad del operador: **solo se compara** con lo que dice FPS.

## 3. Flujo implementado

PNC de Data (`npNv`, máquina, área, fecha de fabricación) →
1. **Documento:** `npNv` numérico → órdenes de `ZZZMasterOT` donde `NotaVentaFaret` o `NotaVentaInnpack` coincide. Si coincide como NP Faret **y** como NV Innpack en órdenes distintas → **AMBIGUA** (no se elige). Si no existe o no es numérico → **SIN_ATRIBUCION**.
2. **Máquina:** el nombre de Data se resuelve contra las máquinas del documento por identificador estable (`ResourceKey`): exacta; equivalente (mismos números y mismo prefijo de 3 letras, p. ej. "Iberica 144-2" ↔ "IBE.144-2"); solo número ("104-2") si es el único calce; error de tipeo de 1 letra en nombres largos ("EXPERTFOLD" ↔ "EXPERFOLD") si es único. Valores que no son máquinas (TALLER, DESPACHO, COMERCIAL, COTIZACION, ADQUISICIONES, CARGA DE ARCHIVOS, PRE-PRENSA…) **no son discrepancia**: se evalúan por proceso/área. Máquina que no aparece en el documento → **DISCREPANCIA**.
3. **Fecha:** sesiones de esa máquina cuyo intervalo incluye el día de fabricación. Sin sesiones ese día → **DISCREPANCIA**. Sin fecha → como máximo **PROBABLE**.
4. **Personas:** `UserKey` de FPS. Una persona → **CONFIRMADA_TECNICA** (máquina + día firmes) o **PROBABLE**. Varias → **AMBIGUA** (simultáneas o cambio de turno), **sin asignar a ninguna y sin puntos**.
5. Se ignoran marcas de 0 minutos y 0 unidades cuando hay sesiones reales.

Reglas que se mantienen: confirmación técnica ≠ responsabilidad humana (siempre "pendiente de Calidad"); puntos 10/5/1 **provisionales**, solo en confirmadas de una persona; orden alfabético, sin ranking, sin nota, sin sanciones; no modifica NC ni sesiones; con permiso VER las personas se muestran como `OP-xxxxxx` (también como clave de filtro) y no se envía el operador escrito en la PNC; el turno es **estimado** por la hora de inicio (A 07–15, B 15–23, C 23–07) porque FPS no registra turno.

## 4. Archivos

| Pieza | Archivo |
|---|---|
| Endpoint fps-api (**no desplegado**) | `fps-api/src/routes/produccion.routes.js` (ruta `GET /sesiones-documentos`), `src/services/produccion.service.js` (`obtenerSesionesPorDocumentos`) |
| Cliente desktop | `src/Backend/Services/FpsApi/FpsSesionesApiService.cs` (lotes de 50 NP; 404 → "no desplegado") |
| Motor (puro) | `src/Backend/Modules/EvaluacionOperadores/FaretAtribucionFps.cs` |
| Agregación/privacidad | `.../FaretEvaluacionFpsResumen.cs` |
| Handler | `.../FaretEvaluacionOperadoresHandler.cs` (ya sin el mensaje permanente "no disponible") |
| Cableado | `MessageRouter.cs`, `Program.cs` |
| Pantalla FARET propia | `modules/faret-evaluacion-operadores/*` (INNPACK intacto) |
| Pruebas | `tools/evaluacion_operadores_tests/Program.cs` (**194/194**) |

## 5. Validación con datos reales (solo lectura)

Método: Data completa (354 PNC) leída desde la sesión ADMIN_TI abierta en Photino (puerto 9333, sin extraer credenciales); FPS vía el endpoint **ya desplegado** `GET /laboratorio/registros` (mismas tablas y joins que el nuevo). Ese endpoint **no devuelve** `IdOperador`/`IdMaquina`/`OrdenTrabajo`: el arnés los derivó solo para la prueba (id estable por nombre; categoría y OT desde la lista de procesos). El endpoint nuevo trae los identificadores reales. El motor real (código fuente enlazado) fue el evaluado.

**Correspondencia con FPS**

| Etapa | PNC |
|---|---|
| Total en Data | 354 |
| NP/NV numérica | 349 (5 no numéricas) |
| Documento encontrado en FPS | 349 (323 como NP Faret · 26 como NV Innpack) · 229 órdenes · 3.614 sesiones |
| Máquina resuelta (exacta 43 + equivalente 63) | 106 |
| Valor que no es máquina | 52 |
| Sin dato de máquina | 13 |
| Máquina que no aparece en el documento | 183 |
| Fecha: dentro de sesiones / fuera / sin fecha | 39 / 64 / 251 |

**Estado de atribución (suma 354 = universo, check PASS)**

| Estado | PNC |
|---|---|
| Confirmada técnicamente | 35 |
| Probable | 2 |
| Ambigua | 50 (45 sin máquina identificable + 5 con varias personas) |
| Discrepancia | 247 |
| Sin atribución | 20 |

35 confirmadas = 291 puntos provisionales, **16 personas** confirmadas, **20 personas** involucradas en total. Operador escrito en Data vs FPS: coincide 39 · distinto 3 · taller/externo 6 · no comparable 2 · sin dato 18 · sin personas FPS 286.

**Áreas productivas no cubiertas por el endpoint de laboratorio.** Sus sesiones solo incluyen Pegado (2.348), Troquel (1.138), Emplacado (101), Corrugado (24) y Termoformado (3). Data tiene 178 PNC de **OFFSET** (prensas XL-2, XL-3, KBA, CD 102, 104/106) + Desarrollo (19), Logística, Comercial, Folleto, Dimensionado, Pre-prensa, etc., que ese endpoint **no cubre**. Explica las discrepancias "FPS no tiene sesiones de la máquina XL-3/XL-2/KBA…" (≈ 170 PNC): son un **artefacto de cobertura de la prueba**, no de la lógica. `/sesiones-documentos` trae todas las categorías del documento y debe resolverlas; **esto solo se confirma con el endpoint nuevo desplegado**. El resultado definitivo (más confirmadas, menos discrepancias) se medirá después del despliegue.

**Hallazgos reales que no son artefacto**
1. **Fecha de fabricación**: de las 64 PNC con máquina resuelta pero sin sesión ese día, la sesión más cercana de la máquina está a ±1 día en 6, a 2–7 días en 2, a 8–30 días en 43 y a más de 30 días en 13. La fecha de Data parece reflejar otro hecho (detección/ingreso), no el día de producción. Hoy se informa como discrepancia (honesto, no se fuerza el calce); Calidad debería definir qué significa esa fecha.
2. **El campo Máquina de Data mezcla sectores y máquinas** (52 PNC con sector, 13 vacías).
3. **Typos en FPS** ("EXPERFOLD") y nombres sin prefijo ("104-2") obligan a la equivalencia de nombres; las 63 equivalencias se marcan como tales en pantalla.
4. 251 PNC sin fecha de fabricación solo pueden llegar a "Probable".

## 6. Revisión de la interfaz (con el resumen real en la ventana abierta)

Se sustituyó solo la respuesta del puente por el resumen generado con los datos reales (versión VER, seudónimos) y se inspeccionó el DOM; **no se pudieron tomar capturas** (WebView2 no responde a `Page.captureScreenshot` en esta ventana), así que **la revisión es estructural, no visual**: renderiza sin errores; sin "undefined/NaN/null/[object"; KPIs 354/35/2/50/247/20/20/291; 20 personas, listas 35/52/267 (cuadran con el resumen), filtros con 4 años y 41 máquinas, sin desbordes horizontales; detalle por persona con sesiones y trazabilidad, evidencia por PNC, distribuciones, comparación declarado-vs-FPS; con VER solo se ven códigos `OP-`. **Pendiente: revisión visual por una persona.** Con el endpoint 404 se muestra "Infraestructura pendiente" (estado de infraestructura, no una función terminada).

## 7. Clasificación de los mensajes de funcionalidad incompleta (Fases 31–33)

| Mensaje | Clasificación |
|---|---|
| "Comparación con FPS no disponible" (permanente) | **Eliminado**: reemplazado por integración real; solo queda un estado de error real si el endpoint no está desplegado/FPS falla |
| "Infraestructura pendiente" (endpoint 404) | Estado de infraestructura legítimo, se quita al desplegar |
| Aviso "sin atribución confirmada contra producción" del texto introductorio | **Reemplazado** por el aviso de atribución técnica ≠ responsabilidad |
| Nombres ocultos con VER | Control de privacidad, **se mantiene** |
| Advertencia de ponderaciones provisionales | **Se mantiene** (pendiente de validación de Calidad) |
| Turno estimado | **Se mantiene** (supuesto documentado) |

## 8. Endpoint nuevo: validación y paquete

- Implementación: ruta `GET /api/produccion/sesiones-documentos?np=a,b` (máx. 50 NP, solo dígitos 1–9, deduplicadas; 400 ante entrada inválida **sin consultar la BD**), `x-api-key` heredada del router. SQL de solo lectura con parámetros `Int` tipados; **mismas tablas y joins** que `/laboratorio/registros` (ya en producción con esta misma cuenta SQL) → **no requiere permisos nuevos**. Devuelve nombre del operador que FPS muestra; no devuelve RUT.
- Pruebas: mock del pool, 12/12 (parámetros tipados, sin escrituras, sin RUT, casos 400, 400 no consulta BD); `node --check` OK.
- Dependencias: ninguna nueva.
- Paquete: `scratchpad\f34\paquete_fps\src\routes\produccion.routes.js` (sha256 `d360e68a…47b53`) y `src\services\produccion.service.js` (sha256 `3f507130…f8ca9`). Originales para rollback: `scratchpad\f34\fps-api_original\` (`accb85a3…`, `d3eeabcd…`). (fps-api no tiene git.)

## 9. Propuesta de publicación controlada (cada paso requiere tu autorización)

1. **Preflight (solo lectura, por una persona):** confirmar en SRV-API ruta de la app, hashes actuales = los originales (`accb85a3…`/`d3eeabcd…`), y que la tarea `FpsApi` está en ejecución; espacio y permisos. Si los hashes no coinciden, **detenerse**: alguien cambió el servidor.
2. **Respaldo:** copiar los 2 archivos originales a `…\_backup_<fecha>_sesiones-documentos` con hash.
3. **Copia mínima:** reemplazar solo `produccion.routes.js` y `produccion.service.js` y verificar hashes. Sin `npm install`, sin tocar `.env`.
4. **Reinicio acotado:** reiniciar solo la tarea `FpsApi` (verificar PID/StartTime nuevos).
5. **Pruebas posteriores:** `GET /api/produccion/sesiones-documentos` sin `x-api-key` → 401 · con clave y `np=abc` → 400 · con una NP conocida (22991) → 200 con `ordenes`/`sesiones` · `GET /laboratorio/registros?np=22991` y liberaciones siguen 200 (regresión).
6. **Rollback** (si falla cualquier prueba): restaurar los 2 originales desde el respaldo, reiniciar `FpsApi`, repetir la regresión.
7. **Validación real completa** (yo, con tu sesión): repetir la conciliación con el endpoint nuevo y completar el §5 con las cifras definitivas (incluido Offset). Solo entonces el módulo puede darse por terminado.
8. **Después:** Mejora Continua (paquete de Fase 33), reconstruir Photino 1.8.30 y recién ahí instalador + `latest.json`.

## 10. Estado del instalador 1.8.30

- El instalador anterior (`32162ed3…`) está **obsoleto** (movido a `C:\Installers\_old_f34\`).
- Hoy intenté regenerarlo y **salió con la compilación vieja** porque tu ventana de prueba bloquea `QualityControlCenter.dll` (la publicación falló); ese archivo **se eliminó**: **no hay instalador candidato válido**. Para generarlo: cerrar la ventana de prueba, publicar, compilar con `ISCC.exe` y registrar el hash nuevo en este documento.

## 11. Pendientes

1. Tu autorización para el despliegue de fps-api (§9) → validación real definitiva.
2. Revisión visual de la pantalla por una persona (sin capturas posibles aquí).
3. Decisiones de Calidad: significado de la "fecha de fabricación" de Data; sector vs. máquina en Data; ponderaciones y definición de turnos.
4. Cerrar la ventana de prueba, reconstruir el candidato 1.8.30 y calcular su hash.
5. Mejora Continua y publicación de Photino (Fase 33).
