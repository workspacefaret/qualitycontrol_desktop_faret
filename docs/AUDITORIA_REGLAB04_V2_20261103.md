# Auditoría técnica REG-LAB-04 v2 (Photino 1.8.27) — 03-11-2026

Alcance: código fuente (desktop, API INNPACK `9d8db26`, fps-api, SQL, Excel/PDF), solo lectura. Tres auditores independientes (API/cálculos/persistencia; desktop/Excel/PDF; fps-api/integración/permisos/requisitos) + verificación propia del responsable de sesión.
**Método de cada evidencia:** `[PROBADO]` = ejecutado localmente (LocalDB `QCC_LAB_TEST`/generación de Excel); `[LEÍDO]` = por lectura de código/DDL; `[VERIF. PROPIA]` = confirmado además en esta sesión leyendo el código. Números de línea aproximados (±3) salvo los marcados.
Estado de producción: SQL, API y fps-api desplegados el 03-11-2026; Photino 1.8.27 publicado. **La validación funcional autenticada en producción sigue pendiente.**

## 1. Pruebas ejecutadas (evidencia real)
- E2E Edge → handler real → API real → LocalDB: **188 OK / 0 fallas** (incluye Excel, PDF, informe anterior, ensayos históricos pH/Viscosidad/Lugol).
- Cliente **1.8.26 real** (`git archive e78cf36`) contra API/SQL nuevas: abre detalle, renderiza ensayos del modelo nuevo, informe, guardados legados (humedad, gramaje, cobb, espesor, ect, bct-medido), alta y listado: OK (la única falla fue un dato de prueba propio).
- Auditoría API con arnés propio: cálculos, límites (Cobb 21→20 probetas, ECT 4 incompleto), concurrencia (`revision`, dos guardados paralelos: uno OK y uno conflicto), persistencia (reguardar sin muestras no pierde determinaciones), inyección SQL (texto malicioso se guarda literal).
- Excel: "=1+1" se escribe como texto; caracteres de control saneados; 20 probetas × 2 inválidas, 30 muestras sin excepciones.
- Producción (sin sesión): health INNPACK/fps-api 200, hashes = artefactos, 23/23 pools, rutas protegidas 401. Salud y hashes **no** equivalen a validación funcional.

## 2. Cálculos verificados correctos [PROBADO]
Gramaje ×100/×400/×200 (sin probeta → NULL, no asume 10×10); Espesor (6 decimales, promedio 4); Cobb (Pf−Pi)×100 y rechazo de Pf<Pi; Horno ((Pi−Pf)/Pi)×100 con rechazo de Pi≤0 y Pf>Pi; Humedad >100 rechazada; RCT/FCT fuerza y resistencia separadas (resistencia promedia solo si todas la tienen); ECT 5 obligatorias y lb/pulg = /39,3701; BCT 3–5; vacíos = NULL, no 0.

## 3. Hallazgos de PRIORIDAD ALTA

### A1 — Consolidado de BCT mezcla tipos de onda [PROBADO] — ALTO
- `Repository.Muestras.cs` ~1120–1140 (`CalcularConsolidado`) y ~1245 (parámetro `tipoOnda` de BCT sin `Comparabilidad`).
- Dos muestras BCT finalizadas, onda B (100 lbf) y onda C (300 lbf) → `resultado_valor` = 200,0000, estado Finalizado. Un resultado que no corresponde a ningún material, comparado contra especificación.
- Corrección: `Comparabilidad: true` en `tipoOnda`, o consolidado NULL si hay más de una onda.

### A2 — XSS almacenado / HTML sin escapar en pantalla e informe [LEÍDO + VERIF. PROPIA] — ALTO
- `muestra-laboratorio.controller.js:56-59` `_esc` no escapa `"`; `:1616` y `:1630` (`title="${e.motivoAnulacion}"`, `title="${e.observacion}"`) inyectan texto en atributos; `:1625` `e.analistaNombre`/`e.metodo`/`e.cumplimiento`/`e.estado` sin escapar; `:1252-1262` `abrirDetalle` mezcla escapados y no escapados; `:508-517` `cargarLista` (cliente, np, código, origen, `err.message`); `:998-1000`, `:1048-1049` (`_esc` dentro de `value="…"`/`title="…"`); `:1757-1865` `generarInforme` y las `_tablaXxx` pasan texto crudo a `PrintExporter.printReport` (`print-exporter.js:124,139,141,142,163`, `doc.write`); `_tablaEnsayoMuestras` (`:1884`) escapa celdas pero no el título.
- Impacto: una observación `"><img src=x onerror=…>` ejecuta código con acceso a `PhotinoBridge`; y es un bug funcional ("humedad < 5%" rompe el informe).
- Corrección: `_esc` + `_escAttr` (escapa comillas) uniforme; escapar en el llamador de `printReport`.

### A3 — Anulación de ensayo sin auditoría suficiente [PROBADO] — ALTO
- `Repository.cs` ~1694 (`AnularEnsayo`), ~1721 (`ReemplazarEnsayo`). Anular dos veces sobrescribe el motivo; si estaba "Reemplazado por ensayo #N", se pierde la trazabilidad. Sin `anulado_por`/`fecha_anulacion` en `muestra_laboratorio_ensayos` (la migración 2026_09 las agrega solo a `muestra_laboratorio`), no verifica estado previo, no incrementa `revision`, sin control de rol.
- Corrección: `UPDATE … WHERE estado <> 'Anulado'`, columnas de usuario/fecha, rol mínimo.

### A4 — Corrección de ensayo finalizado no atómica / duplicados [LEÍDO] — ALTO
- `Service` ~495–530 + `Repository.cs` ~1721–1765: `GuardarEnsayoMuestras` confirma el ensayo nuevo y luego `ReemplazarEnsayo` corre en otra conexión sin transacción. Dos correcciones concurrentes pasan la validación → dos ensayos vigentes; si falla a mitad, el original queda Anulado sin `ensayo_reemplaza_id`.
- Corrección: una sola transacción con `UPDLOCK` sobre el original.

### A5 — Sin protección de doble envío [LEÍDO] — ALTO
- `guardarNuevaMuestra` (`:1173`), `_guardarEnsayoMuestras` (`:2956`), y guardados legados (Gramaje/Cobb/Rct/Ect/BctMedido/Humedad). Solo `_consultarNp` y `exportarPdf` deshabilitan botón. Un doble clic en una muestra nueva (`ensayoId=null`) duplica ensayos; en "Continuar" lo frena `revision`.
- Corrección: flag `_guardando`/deshabilitar durante el `await` con `try/finally`.

### A6 — Valores fuera de rango y HTTP 500 [PROBADO] — ALTO/MEDIO
- Entradas numéricas solo con `Minimo` (sin `Maximo`); las determinaciones inválidas no validan rango (`CalcularDeterminacion`, `if(!valida) return`). Cobb pesoFinal=1e11 → `ArgumentException`; Gramaje 5×5 peso 5e9 pasa `/calcular` y revienta al guardar (`muestra_laboratorio_ensayo_muestras.promedio` es DECIMAL(14,4), más estrecho que DECIMAL(18,6) de determinaciones). El servicio solo captura `EnsayoMuestrasException` → 500 sin mensaje.
- También: peso −5 se guarda en probeta inválida; Cobb acepta peso inicial 0 (Cobb=120 y cuenta como válida).
- Corrección: `Maximo` realista por entrada, validar rango también en inválidas, `Pi>0` en Cobb, capturar `ArgumentException`/`SqlException 8115`, DECIMAL(18,6) en promedio.

## 4. Hallazgos de PRIORIDAD MEDIA

- **M7 Estados inconsistentes en ensayos incompletos** [PROBADO]: humedad termobalanza con una muestra sin sustrato y otra con Liner queda "Finalizado" con `resultado_valor` NULL sin error; `ValidarParametros` acepta sustrato nulo aunque el ensayo defina lista de sustratos. Corrección: sustrato obligatorio si `cfg.Sustratos != null`.
- **M8 FPS: datos de la orden anterior** [LEÍDO, 2 auditores]: `controller.js:979-985` `_onCambiarOrdenFps` con orden vacía sale sin limpiar: Cliente (deshabilitado), formato y antecedentes quedan y se guardan. Corrección: `_ponerDatosNotaVentaFps(null)` y rehabilitar Cliente.
- **M8b NP editable tras elegir registro FPS** [LEÍDO]: `:299-300`, `:1188`, sin listener sobre `mlbNmNp`; se guarda un `np` distinto del snapshot (`registro_produccion_record_key`/`idProcesoFps`). `_consultarNp` no descarta respuestas viejas. Corrección: limpiar selección al cambiar NP + token de petición.
- **M9 Antecedentes FPS > 4000 caracteres** [LEÍDO]: `produccion.service.js:344-345` devuelve `Obs3`/`Obs2` (nvarchar(max)); el desktop (`controller.js:948-954`, `view.html:284`) arma el texto completo en un textarea `readOnly` sin `maxlength`; la API rechaza >4000 (`Service.cs:53-58`) → no se puede crear la muestra. Corrección: truncar/resumir o dejar editable.
- **M9b fps-api** [LEÍDO, DDL posiblemente desactualizado]: `produccion.service.js:323-330` `@procesos(Id_Proceso bigint PRIMARY KEY)` con columna nulable/no única → 500 posible para una NP; `:321` `WHERE NotaVentaFaret=@np OR NotaVentaInnpack=@np` sin índice en `NotaVentaInnpack` → scan; sin `TOP`/timeout propio. `normalizarMedida` (`:193-196`) reemplaza solo la primera coma.
- **M10 Excel/PDF vs pantalla** [LEÍDO/PROBADO]: `RegLab04Excel.cs:49-51` `vigentes = estado != "Anulado"` incluye borradores "En ensayo" sin marcar (el informe de pantalla filtra `Finalizado`, `controller.js:1829`); Cobb solo LINER/ONDA (`:166`), Cartulina/Complejo/Pliego omitidos en la hoja Sustratos (solo en "Resultados del sistema"); `:251` método "Higrómetro" marca "Termobalanza"; `:281` promedio de gramaje complejo calculado en el Excel (fuera de la API); alturas de fila >409,5 pt (`:341`, `:419`) y texto recortado por contar líneas, no ancho; observación >32.767 caracteres lanza `ArgumentOutOfRangeException` y falla el Excel completo [PROBADO]; formato numérico distinto pantalla/Excel.
- **M11 Autorización y concurrencia:** `MuestraLaboratorioController.cs:15` solo `[Authorize]` (sin roles en crear/anular `:366`/eliminar `:147`); el control por módulo es solo del desktop (`PermisosService.cs:371-375`, `Editar` por defecto a todo rol INNPACK) → cualquier token válido (p. ej. gateway Java) puede crear/anular/eliminar [LEÍDO]. Mismo tipo de ensayo duplicable por muestra con dos usuarios [PROBADO]. Auditoría de ediciones "En ensayo" solo usuario/fecha (sin valor anterior) y `AnalistaNombre` viene del body, suplantable [LEÍDO]. Filtración sin transacción y la API no la restringe a Termoformado (`Repository.cs:1522-1556`) [LEÍDO]. Previsualizar (`/calcular`) no aplica parámetros fijos del método (`Service` ~555) [LEÍDO]. Corrección de ensayo muestra "N.º 3, 4" en pantalla (`controller.js:2574`, `:2699`, `:2970`) mientras la API empieza en 1.

## 5. Hallazgos menores
Redondeo doble en humedad (≤0,005); consolidado promedia promedios sin ponderar probetas (diseño; documentar); RCT/FCT comparan la especificación contra "fuerza" (confirmar si debe ser lbf/m o psi); Gramaje precarga 10×10 como defecto; `decimal.TryParse` con cultura es-CL en el handler (`GetDecimal` :1013, latente); `TryUnwrapApiResponse` pierde `errors[]`; `m.observacion` no tiene campo editable; carreras en `abrirDetalle` (:1239)/`cargarLista` (:471); `_emTimer` no se limpia en `destroy()`; `_emNum` acepta "1e3"; `data-metodo='${JSON.stringify(m)}'` (:581); cerrar modal sin guardar no pide confirmación; la migración tiene `USE calidad_db` fijo y GRANT condicional (idempotente); nombres de hoja ≤22 caracteres OK; falta GRANT: ninguno detectado.

## 6. Matriz de requisitos (25) — re-comprobación
Criterio estricto (CUMPLE solo con evidencia): **18 CUMPLE / 7 PARCIAL / 0 NO CUMPLE → ~86 % local** (el 92 % anterior estaba sobrevalorado). **En producción: no verificado de punta a punta.**
- CUMPLE: estructura NP→registro→control→ensayo→muestras→determinaciones; "+ agregar muestra" correlativa; determinaciones mínimas y borrador; Humedad sustratos; Humedad complejo (horno); Gramaje; Espesor; FCT; ECT; BCT 3–5 (con la salvedad A1); Monotapa; etapa/origen/tipo de control; maestro de métodos (por contex, no revisado línea a línea); vacíos≠0 y promedios; anulación/historial/"Sin especificación"; Paletizado/PT (Mariela: "omitir"); unidades en español (por contex); Filtración (con B1).
- PARCIAL: #8 Cobb y #9 RCT (`DeterminacionesMinimas=1`; regla de Mariela pendiente: 1 lectura por bobina vs 3 probetas); #14 FPS NP→ítem→registros (sin datos reales; M8/M9); #16 datos automáticos del producto (FPS no tiene tipo de onda ni dimensiones nominales); #20 informe/Excel/PDF (sin abrir en Excel real ni diálogo PDF de Photino); #22 pruebas 1–4 (NP 4062 en vivo sin comprobar); #23 Prueba 5 contra el REG-LAB-04 físico (incoherencias del papel).

## 7. Pendientes de confirmar con Mariela Rojas
1. RCT/Cobb: ¿1 lectura por bobina o 3 probetas por muestra? 2. Cobb: ¿cara y tiempo únicos por método o por material? 3. Humedad del complejo: ¿se usa el horno? (Pi/Pf del papel repiten los pesos de gramaje). 4. FCT: cómo se obtuvo 267,12 / 4,14. 5. Fuente de tipo de onda y largo/ancho/alto nominales (FPS no los tiene). 6. Que método de humedad y probeta de gramaje se marquen siempre. 7. Magnitud de la especificación para RCT/FCT.

## 8. Discrepancia detectada
Un auditor afirmó que SQL/API/fps-api "no están desplegados" basado en `contex.md` antiguo: es incorrecto; se desplegaron el 03-11-2026 (hashes verificados en `docs/OPERACION_DESPLIEGUE_QCC.md`).
