# Plan de correcciones Photino 1.8.28 (REG-LAB-04 v2)

Origen: `docs/AUDITORIA_REGLAB04_V2_20261103.md` (IDs A1–A6, M7–M11). Procedimiento de despliegue: `docs/OPERACION_DESPLIEGUE_QCC.md`.
Reglas (CLAUDE.md): un paso a la vez, plan + aprobación antes de implementar, sin refactor general, sin dependencias nuevas, estilo actual. **No asumir que 1.8.28 necesita otra migración SQL**: se decide con los cambios reales (A3 y A6 sí podrían: columnas de auditoría en `muestra_laboratorio_ensayos` y ancho DECIMAL del promedio → si se necesitan, SQL aditivo e idempotente ejecutado por el DBA ANTES de la API).

## Alcance por componente (qué se despliega)
| Cambio | Desktop (`www`/C#) | API INNPACK | SQL | fps-api |
|---|---|---|---|---|
| A1 consolidado BCT | — | sí (`Muestras.cs`) | no | no |
| A2 XSS | sí (`controller.js`) | no | no | no |
| A3 auditoría de anulación | opc. (mostrar) | sí | **probable** (columnas `anulado_por`, `fecha_anulacion`) | no |
| A4 atomicidad de corrección | no | sí | no | no |
| A5 doble envío | sí | opc. | no | no |
| A6 rangos / 500 | opc. (mensaje) | sí | **probable** (promedio DECIMAL(18,6)) | no |
| M7 sustrato obligatorio | sí | sí | no | no |
| M8/M8b FPS al cambiar NP | sí | no | no | no |
| M9 antecedentes >4000 | sí | opc. | no | opc. |
| M9b fps-api (`@procesos`, índice) | no | no | índice a pedir al DBA FPS | sí |
| M10 Excel/PDF | sí (C#) | no | no | no |
| M11 roles API / duplicados | no | sí | no | no |

## Fase 1 — Seguridad y datos (primero)
1. **A2 XSS** (`muestra-laboratorio.controller.js`): agregar `_escAttr` (escapa `"` y `'`), usar `_esc`/`_escAttr` en `abrirDetalle`, `cargarLista`, `renderEnsayos` (`:1616`, `:1625`, `:1630`), datos FPS (`:998`, `:1048`), `generarInforme` y todas las `_tablaXxx`, incl. títulos. Prueba: observación `"><img src=x onerror=window.__x=1>` y "humedad < 5%": no ejecuta y no rompe el informe.
2. **A1 BCT**: `Comparabilidad: true` en `tipoOnda` (o consolidado NULL con >1 onda). Prueba: onda B 100 + C 300 → sin consolidado de mezcla.
3. **A3 anulación**: `UPDATE … WHERE estado <> 'Anulado'`, registrar usuario/fecha, no pisar el texto "Reemplazado por"; migración aditiva si faltan columnas.
4. **A5 doble envío**: flag `_guardando` con `try/finally` en `guardarNuevaMuestra`, `_guardarEnsayoMuestras` y guardados legados. Prueba: doble clic = 1 POST.
5. **A6 rangos/500**: `Maximo` por entrada, validar rango también en determinaciones inválidas, `Pi>0` en Cobb, capturar `ArgumentException`/`SqlException 8115` con mensaje 400; ancho del promedio.
6. **A4**: correcciones y reemplazo en una transacción con `UPDLOCK`.

## Fase 2 — Integraciones
7. **M8/M8b**: limpiar datos FPS al volver a "-- Seleccionar orden --" y al editar la NP; token anti-respuesta vieja en `_consultarNp`.
8. **M9**: truncar/resumir antecedentes a 4000 en el desktop (o dejar el campo editable al excederlo).
9. **M7**: sustrato obligatorio cuando el ensayo define lista de sustratos (API + mensaje en pantalla).
10. **M11**: validar rol/permiso de módulo en la API para crear/anular/eliminar; evitar `AnalistaNombre` desde el body (usar claims); aplicar parámetros fijos del método en `/calcular`.
11. **M9b (opcional, requiere autorización aparte de fps-api)**: `DISTINCT`/`IS NOT NULL` en `@procesos`; pedir índice en `NotaVentaInnpack`.

## Fase 3 — Excel/PDF
12. Filtrar a `Finalizado` (o marcar "En ensayo") en `RegLab04Excel.cs:49-51`; incluir Cartulina/Complejo/Pliego en Sustratos o avisar explícitamente; corregir la casilla de Higrómetro (`:251`); truncar texto a 32.000 y limitar altura de fila a 409 pt estimando por ancho; mover el promedio de gramaje complejo a la API o rotularlo.
13. Pruebas de regresión: 40.000 caracteres, 300 líneas, 45 inválidas, ensayo "En ensayo" y "Finalizado" mezclados.

## Fase 4 — Validación
14. E2E (arnés en LocalDB) ≥ 188/0 + casos nuevos de cada hallazgo; cliente 1.8.26 contra la API nueva (compatibilidad).
15. Re-matriz de los 25 requisitos con evidencia; validar con datos reales en la app (NP 22924/4062 sin guardar) y abrir el Excel en Microsoft Excel y "Guardar como PDF" en Photino.
16. Pendientes de Mariela (ver auditoría §7).

## Fase 5 — Despliegue (solo lo que cambió)
17. Subir versión en las 3 propiedades + `.iss` + sidebar + novedades (ID 1.8.28). Comparar con `latest.json` real.
18. Orden: SQL (si hay) → API → (fps-api si cambió) → instalador → `latest.json` al final, con el runbook. Autorización expresa del responsable; Seguridad TI sigue pendiente para el instalador sin firma / `Bypass` heredado.

## Estado de avance (04-11-2026)
- **A2 (XSS) — implementado y probado localmente** (solo `muestra-laboratorio.controller.js`): `_escAttr` único (escapa `& < > " '`), escape en lista, detalle, ensayos, FPS, adjuntos, NC, Monotapa, opciones ECT/Espesor e informe (`_escaparTablaInforme`; `_tablaEnsayoMuestras` va marcada `preescapada` para no duplicar el escape). Arnés Node con datos hostiles: 19/19. Pendiente: E2E en LocalDB y prueba en ventana real (Fase 4).
- **A1 (consolidado BCT) — CERRADO sin corrección de datos históricos.** Cambio: `tipoOnda` con `Comparabilidad: true` (`MuestraLaboratorioRepository.Muestras.cs:1328`); 10/10 casos en arnés (B+C → sin consolidado; "b"/" B " = misma onda; todas sin onda → consolida). El consolidado se calcula solo al guardar; la lectura devuelve `resultado_valor` almacenado. **Evidencia de producción (confirmada por el responsable directamente en SQL Server, `calidad_db`, 04-11-2026): total de ensayos = 20; ensayos BCT = 0.** No hay histórico afectado.
- **A3 (auditoría de anulaciones) — implementado y probado localmente, NADA ejecutado en producción.**
  - SQL aditivo/idempotente: `QualityControlInnpack.Api/Sql/2026_11_muestra_laboratorio_ensayos_auditoria_anulacion.sql` (+ `_rollback.sql`, que se detiene si ya hay datos): `anulado_por NVARCHAR(150) NULL`, `fecha_anulacion DATETIME2 NULL` en `muestra_laboratorio_ensayos`. Sin GRANT nuevo (columnas de tabla ya concedida). Orden obligatorio: **SQL (DBA) → API → instalador**; la API 1.8.28 sin el SQL falla al leer detalle.
  - API: `AnularEnsayo` y `ReemplazarEnsayo` con `UPDATE` condicional atómico (`estado <> 'Anulado'` / `estado = 'Finalizado'`) que guarda usuario (claim `unique_name` del JWT, fallback `sub`; nunca del body), fecha UTC y `revision + 1`; ensayo inexistente → 404 (antes 500); ya anulado → 400 sin pisar motivo/usuario/fecha; `GET detalle` devuelve `anuladoPor`/`fechaAnulacion`. `IHttpContextAccessor` registrado en `Program.cs`.
  - Desktop 1.8.28: la columna Estado de la tabla de ensayos muestra "Anulado por X el F" (nada extra para anulaciones anteriores).
  - **Autorización por roles: se mantienen los roles actuales a propósito (no romper a los analistas, rol `operador`). Pendiente de M11:** validar en la API el permiso del módulo del usuario (SIN_ACCESO/VER/EDITAR) para crear/anular/eliminar; hoy la restricción efectiva está solo en el desktop (`PermisosService`).
  - Pruebas locales (arnés fuera del repo, LocalDB `QCC_A3_TEST`, copia de `QCC_LAB_TEST`; código real de repositorio/servicio/controlador/`JwtHelper` en Kestrel con la validación JWT de `Program.cs`): 36/36 (migración 3 veces, 912 ensayos conservados, 119 anulados históricos en NULL, rollback protegido, compatibilidad con las sentencias de la 1.8.27, 25 anulaciones simultáneas → 1 gana/24 reciben 400/0 errores 500, 8 correcciones simultáneas → 1 reemplazo, identidad desde JWT con body suplantado, sin `unique_name`→`id:N`). Frontend: arnés Node 22/22. Regresión: arnés antiguo del laboratorio 80 OK/1 excepción, **idéntico contra el código `HEAD`** (el arnés está desactualizado respecto del código actual; no hay diferencia por A3).
  - Hallazgo que confirma A4: con correcciones simultáneas, las perdedoras dejan ensayos nuevos "Finalizado" sin vínculo (6 de 8 en la prueba).
- **A4 (corrección atómica, solo modelo nuevo de muestras) — implementado y probado localmente, nada en producción.** `GuardarEnsayoMuestras(r, cfg, usuarioToken)` (`Repository.Muestras.cs`) ahora, cuando viene `EnsayoOriginalId`: bloquea el original con `UPDLOCK` y lo valida (misma muestra, mismo tipo, `Finalizado`) ANTES de crear el ensayo nuevo, y lo anula (con "Reemplazado por ensayo #N", usuario del JWT, fecha, `revision+1`) y vincula el nuevo EN LA MISMA `TransactionScope`/conexión (no abre otra conexión: evita MSDTC). El servicio ya no llama a `ReemplazarEnsayo` en este camino. Pruebas (arnés `QCC_A3_TEST`, 44/44 en total): 8 correcciones simultáneas → 1 ensayo nuevo, 0 huérfanos, 7 reciben 400 (antes quedaban 6-7 huérfanos); corrección con dato inválido → original intacto y 0 ensayos nuevos; fallo inyectado (trigger temporal local) tras crear el nuevo y anular el original → rollback completo (original Finalizado sin auditoría, 0 nuevos; HTTP 500 por excepción SQL no controlada: se trata en A6); original de otra muestra / inexistente / ya anulado → 400 y 0 nuevos; guardado normal sin corrección sin cambios. Regresión del arnés antiguo del laboratorio: 80 OK / 1 excepción, idéntico a `HEAD`.
  - **Riesgo documentado, NO corregido (flujos históricos):** los guardados antiguos (`GuardarHumedad`, `Gramaje`, `Cobb`, `Espesor`, `Resistencia` RCT/FCT, `Ect`, `BctMedido`, `BctTeorico`, `Viscosidad`, `Ph`, `Solidos`, `Filtracion`, `Lugol`) terminan en `FinalizarGuardado`: guardan el ensayo nuevo (confirmado) y recién después llaman a `ReemplazarEnsayo` en otra conexión, sin transacción. Si el original ya no está Finalizado (corrección simultánea o ya anulado), el ensayo nuevo queda Finalizado sin vínculo (huérfano) y el usuario recibe un error. `ReemplazarEnsayo` ya es atómico por sí mismo (A3: un solo `UPDATE` condicional; solo el primero gana), así que el daño se limita a ese huérfano, no a doble reemplazo. Alcance: ensayos con tipo solo histórico (BCT teórico, Viscosidad, pH, Sólidos, Lugol, Filtración) y clientes 1.8.26 que usen los formularios antiguos. Evaluar después: o transaccionalizar cada `Guardar<Tipo>` (intrusivo: 13 guardados con SQL propio) o pre-validar/bloquear el original antes de guardar (parche más chico).

### A5 — Doble envío (04-11-2026) — IMPLEMENTADO LOCAL, probado
- Mecanismo común `_conGuardado(btn, fn)` en `muestra-laboratorio.controller.js`: un solo guardado a la vez (`this._guardando`), deshabilita el botón y libera SIEMPRE en `finally` (también ante errores); `destroy()` reinicia el bloqueo. Envuelve los 21 botones de guardado (nuevos e históricos, incluidos borradores, método, especificación y fecha efectiva). Anular/eliminar/adjuntos no se envolvieron.
- Pruebas locales (Node, controlador real): doble clic = 1 llamada en los 21 botones; botón deshabilitado durante el guardado y liberado después; tras un error se libera y se puede reintentar; un guardado en curso ignora otro guardado distinto; botones que no guardan siguen activos. Regresión A2 (22/22) y A3 (44/44) OK.
- **RIESGO ABIERTO — resolver ANTES de publicar 1.8.28:** correcciones concurrentes en formularios históricos (13 `Guardar<Tipo>` → `FinalizarGuardado`) pueden dejar un ensayo nuevo huérfano (ver A4). El bloqueo de A5 solo protege dentro de una misma ventana; no cubre dos usuarios/equipos ni clientes 1.8.26.

### A6 — Validaciones numéricas y errores 400 (04-11-2026) — IMPLEMENTADO LOCAL (solo API), sin SQL
- `CalcularDeterminacion` (API, `MuestraLaboratorioRepository.Muestras.cs`): ahora, ANTES de mirar `valida`, rechaza (a) valores bajo el mínimo físico ya declarado (peso negativo, etc.) y (b) valores que no caben en la columna (`MaxEntradaAlmacenable` = DECIMAL(18,6)). El máximo físico (p. ej. humedad 100 %) solo se exige en determinaciones válidas (una lectura fuera de rango puede ser el motivo de descarte). Tras calcular, el resultado redondeado debe caber en el promedio DECIMAL(14,4) (`MaxPromedioAlmacenable` = 9 999 999 999,9999).
- División por cero: Humedad por horno ya exigía peso inicial > 0 (verificado con prueba). Cobb no divide (fórmula (Pf−Pi)×100): no se agregó regla Pi>0.
- Servicio: `EsErrorNumericoDeEntrada` (Overflow/DivideByZero/Argument, SqlException 8115/220/8114) → 400 con mensaje, en guardar y en `/calcular`. Red de seguridad: con la validación previa hoy no es alcanzable por entradas normales.
- **Los valores válidos caben en DECIMAL(14,4): NO se necesita ampliar la columna.** Los límites de arriba son de ALMACENAMIENTO, no físicos; no se inventaron máximos físicos.
- **PENDIENTE DE ESPECIFICACIÓN (laboratorio):** máximos físicos por magnitud (peso de probeta, espesor mm, fuerzas lbf de RCT/FCT/ECT/BCT, resistencias, largo/ancho/alto, gramaje/espesor del complejo) y si Cobb exige peso inicial > 0. Hoy solo humedad (0–100 %) tiene máximo físico.
- Pruebas locales (LocalDB, API real en Kestrel): 60/60 (44 de A3 + 16 de A6: negativo válido/inválido, división por cero, 1e12, 3e10×400, 5e12 en inválida [antes SqlException→500], límites exactos que SÍ guardan, JSON 1e30/texto → 400, `/calcular` sin 500). Regresión: A3 incluida concurrencia A4 (25 anulaciones → 1 gana; 8 correcciones → 1 reemplazo, 0 huérfanos), A1 BCT 10/10, laboratorio viejo 80 OK (1 excepción preexistente idéntica en HEAD), A2 22/22.
- Sin cambios en el desktop ni SQL. Riesgo abierto sin cambio: concurrencia de correcciones en formularios históricos (resolver antes de publicar 1.8.28).

## Alcance de cierre de 1.8.28 (04-11-2026, decisión del responsable)
Solo lo necesario para cumplir REG-LAB-04 v2 y la integridad de datos. Implementado en LOCAL, sin desplegar:
- **M7** (API, `Muestras.cs`): al FINALIZAR, toda muestra de un ensayo con sustrato/material debe traerlo (400 «indica el sustrato de la muestra N.º x»). El borrador "En ensayo" sigue permitiendo vacío. Probado en LocalDB: 6 comprobaciones (suite API 66/66).
- **M8** (controller.js): sin orden FPS elegida se borran cliente (si no lo editó el analista), formato y antecedentes y se rehabilitan los campos.
- **M8b** (controller.js): cambiar el NP tras consultar descarta la consulta/registro FPS y los datos autollenados; token anti-respuesta vieja (también para consultas en curso); guardar con un NP distinto al del registro elegido se rechaza en el cliente. Prueba Node 11/11.
- **M10, 2 correcciones** (`RegLab04Excel.cs`): las hojas de formato REG-LAB-04 llevan solo ensayos Finalizados (borradores y anulados quedan en «Resultados del sistema» con su estado); la fila de método de la Humedad del complejo marca Higrómetro por separado (antes marcaba Termobalanza). Prueba con el código real (HTML/Excel): 9/9.
- **Unidades en español** (solo presentación): ya aplicado en Paso 104 (`_u()`, `U()` del Excel/PDF); se completó en las tablas de administración de métodos y especificaciones. Prueba `_u`: 12/12; BD/API/cálculos sin cambio.
- **M9 (antecedentes FPS > 4000 caracteres): NO VERIFICADO.** La consulta de solo lectura no fue posible con el acceso disponible (la herramienta SQL solo ve SAP `FARET_PRODUCCION`; FPS_PRODUCCION no es accesible desde ahí, y no se leen credenciales de fps-api). Pendiente: ejecutar en FPS `SELECT MAX(LEN(Obs3)), MAX(LEN(Obs2)), SUM(CASE WHEN LEN(Obs3)+LEN(Obs2)>3500 THEN 1 ELSE 0 END) FROM dbo.ZZZMasterOT`. Si el máximo es < 4000 el hallazgo se descarta; si no, truncado de una línea al enviar.
- **RIESGO CONOCIDO, FUERA DE ALCANCE, NO RESUELTO:** correcciones concurrentes en formularios históricos (13 `Guardar<Tipo>` → `FinalizarGuardado`, ver A4) pueden dejar un ensayo nuevo huérfano si dos usuarios corrigen a la vez el mismo ensayo finalizado de BCT teórico/Viscosidad/pH/Sólidos/Lugol/Filtración.
- Fuera de alcance (no implementado): M9b, M11, resto de M10 (layout), Cobb/RCT mínimo (a confirmar con Mariela).
