# 10 — Plan revisado: MVP incremental en Quality Control (PROPUESTA, nada implementado)

**Reemplaza** la arquitectura E y las estimaciones de los docs 03, 06 y 07 (se conservan como referencia de la etapa futura). Estrategia aprobada: primero Quality Control; FPS como fuente de datos solo cuando haga falta; integración visual con FPS en una segunda etapa.

## 1. Corrección de la estimación anterior

Los 43–57 días (≈ 344–456 h) incluían trabajo que el MVP no necesita. Descomposición:

| Fase original | Días | ¿Resuelto por lo existente? | Veredicto |
|---|---|---|---|
| 0 Verificación de datos | 2–3 | No (lo ejecuta DBA) | **Necesaria**, pero pequeña |
| 1 Decisiones de Calidad | calendario | No | **Necesaria**, no es desarrollo |
| 2 Fundamentos (`eval_*`, alias→RUT, puente de máquinas, normalizador) | 6–8 | Parcial: `no_conformidades` ya trae operador/máquina/nivel/fecha_fabricacion | **Futura** (solo con FPS). Normalizador de nivel: mínimo, va en el MVP |
| 3 Endpoint FPS | 3–4 | Patrón existente (`FpsLiberacionesApiService` → `fps-api`) | **Etapa 2** |
| 4 Motor (ingesta incremental, atribución A/B/C/D, snapshots, recálculo, auditoría) | 12–15 | **Sí en gran parte**: una consulta `GROUP BY` sobre `no_conformidades` basta para puntos | **Descartada para MVP**; snapshots y recálculo son futuros |
| 5 Panel Photino | 8–10 | Sí: patrón de módulo, permisos, Chart.js, `ExcelExporter` | **Necesaria**, más barata |
| 6 Paridad Web + Faret | 4–6 | — | Web: necesaria al publicar; Faret: etapa 2 |
| 7–8 Piloto y oficialización | 8–11 | — | Se reduce a validación con Calidad |

Conclusión: el sobredimensionamiento venía de diseñar un motor de ingesta/atribución/snapshots para un problema que, sin FPS, es una agregación sobre una tabla ya existente. Esa capa solo se justifica si Calidad exige meses oficiales inmutables o atribución por sesión; ninguna de las dos es requisito del MVP.

## 2. Qué se reutiliza (CONFIRMADO en el código)

| Necesidad | Componente existente | Cambio |
|---|---|---|
| Datos | Tabla `no_conformidades` (`ambito='PRODUCTO'`, `eliminado=0`): `fecha_fabricacion`, `nivel`, `maquina`, `operador`, `empresa`, `np`… (`NoConformidadesRepository.cs` líneas 54–61) | Ninguno de esquema |
| Filtros | `AplicarFiltros` (nivel, operador, área, cliente…) | **Hoy el rango de fechas usa `fecha_ingreso`** (líneas 241 y 246). Hay que agregar filtro por `fecha_fabricacion` |
| Valores de filtros | `ObtenerFiltrosOpciones` (ya devuelve `operadores`, desde 1.8.26) | Agregar `maquinas` distintas |
| Handler Desktop | `NoConformidadesHandler.LeerFiltros/HandleResumen` (ya pasa `operador`) | Una acción nueva + método en el cliente API |
| Permisos | `PermisosService.Modulos` / `AccionesLectura` | Registrar módulo nuevo (solo lectura) |
| UI | Patrón módulo (`view.html` + `controller.js`), Chart.js local, `ExcelExporter`, `TableUtils`, selects de filtros de `no-conformidades` | Vista nueva |
| Detalle | `noConformidades.list` | Reutilizado tal cual, con el filtro de fabricación |
| Despliegue | Runbook `docs/OPERACION_DESPLIEGUE_QCC.md` | Sin cambios |

## 3. Qué hay que modificar o crear

**API INNPACK** (`qualitycontrolinnpack_sqlserver_port`)
- `NoConformidadesRepository.cs`: `AplicarFiltros` acepta `fabricacionDesde/Hasta` (sobre `fecha_fabricacion`); nuevo método de agregación `GROUP BY operador, nivel[, mes]`.
- `NoConformidadesService.cs` / `NoConformidadesController.cs`: `GET api/no-conformidades/evaluacion-operadores` que aplica los pesos y devuelve puntos, conteos, tendencia y las categorías "sin operador" y "sin fecha de fabricación".
- Pesos 10/5/1 en configuración (Options) y devueltos en la respuesta con su etiqueta de versión. Sin tabla nueva en el MVP.

**Desktop** (este repo)
- `NoConformidadesHandler.cs` + cliente API: acción `noConformidades.evaluacionOperadores` y `maquinas` en filtros.
- `PermisosService.cs`: módulo `evaluacion-operadores`, acción en `AccionesLectura`.
- `src/UI/www/modules/evaluacion-operadores/` (vista, controlador, CSS), botón de sidebar, `index.html`, novedades y versión (3 propiedades del `.csproj` + `.iss`).

**Web Java**: `BridgeConfig` + handler + `PermisosModulo` (paridad exigida por `release-web.ps1`). Es trabajo separado, posterior a que el Desktop esté validado.

**No se toca**: FPS-Python, fps-api, base `calidad` (esquema), APIs Faret.

## 4. Alcance

**A. Imprescindible para el MVP**
1. Selector de mes/año aplicado a **fecha de fabricación**.
2. Filtros de máquina y operador.
3. Conteo por Crítico/Mayor/Menor y puntaje = 10·C + 5·M + 1·m, por operador y total.
4. Tendencia mensual (últimos 6 meses) y comparación con el mes anterior.
5. Detalle por operador con los registros origen (reutiliza el listado de NC).
6. Marcas explícitas: "sin operador", "sin fecha de fabricación", "nivel sin clasificar". Estos registros **no suman al puntaje del operador** y se muestran como cobertura (% de NC atribuibles).
7. Exportación a Excel.
8. Solo lectura; permisos por módulo.
9. **Sin porcentaje de calidad**, sin ranking de "mejores" en el MVP: solo puntos acumulados y conteos, con leyenda "indicativo, fórmula pendiente de Calidad".

**B. Mejoras posteriores**: pesos editables con versión y aprobación; snapshots mensuales inmutables; PDF; variante Faret (datos en `importacion_pnc`, vía API Faret); NC internas.

**C. Integración con FPS**
- *Datos (etapa 2)*: un endpoint de solo lectura en `fps-api` (sesiones: RUT, máquina, NP, fechas, cantidades) consumido desde la API INNPACK con el patrón de `FpsLiberacionesApiService`. Permite denominadores (OF, unidades) y normalizar por exposición. Es la forma más simple y segura: reutiliza `fps-api`, su `x-api-key` y la ruta ya productiva; sin conexión directa a FPS desde Calidad.
- *Visual (etapa 3)*: ver el módulo dentro de la interfaz FPS. No se diseña ahora.

**D. Dependen de Calidad (Pedro)**: fórmula final y tope; qué hacer con NC sin fecha de fabricación (el MVP las excluye y las cuenta aparte); denominador; umbral mínimo para evaluar; reparto entre operadores; si se ve nombre o código; para qué se usará el resultado (Nicolás).

## 5. Estimación por tareas (horas de desarrollo)

| # | Tarea | Horas | Depende de |
|---|---|---|---|
| T0 | Consultas de cobertura (operador, fecha_fabricacion, valores de `nivel`) — prepararlas y analizarlas; las ejecuta el DBA | 3 | Acceso del DBA |
| T1 | Filtro por fecha de fabricación en repositorio/servicio/controlador + `maquinas` en opciones | 3 | — |
| T2 | Endpoint de agregación (SQL, normalización de nivel y de texto de operador, buckets de no atribuibles, pesos en Options) | 8 | T0, T1 |
| T3 | Pruebas unitarias de cálculo y casos borde (nivel vacío, operador nulo/mayúsculas, mes sin NC, fabricación en otro mes) | 4 | T2 |
| T4 | Acción en Handler/cliente Desktop + `PermisosService` + registro de módulo | 3 | T2 |
| T5 | Vista: selectores, tarjetas por nivel, tabla de puntos por operador, tendencia y comparación (Chart.js), badges de cobertura | 14 | T4 |
| T6 | Detalle por operador (reutiliza listado) y exportación Excel | 5 | T5 |
| T7 | Sidebar, novedades, versión (3 propiedades `.csproj`) | 2 | T5 |
| T8 | Validación con datos reales y revisión de resultados con Calidad | 6 | T6 |
| T9 | Despliegue según runbook (API → instalador → `latest.json`) | 6 | T8 |
| | **Subtotal MVP Desktop** | **54 h (≈ 7 días)** | |
| W1 | Paridad Web (bridge, permisos, `release-web.ps1`) | 7 | MVP aprobado |
| F1 | Etapa 2: endpoint en fps-api + cliente/servicio en API + mapeo operador→RUT mínimo | 24 | Fase 0, decisión P4 |
| F2 | Etapa 2: columnas de producción/normalización en la vista | 8 | F1, fórmula aprobada |
| F3 | Variante Faret | 12 | MVP |

Incertidumbre: ±25 % hasta T0. T0 puede subir T2 si `nivel` u `operador` vienen muy sucios (más normalización) o bajar el valor del MVP si la cobertura es baja. No incluye esperas de Calidad.

Total honesto: MVP **≈ 54 h** (frente a ~350–450 h); con Web, etapa 2 y Faret ≈ 105 h. La diferencia con el plan original es el motor, las tablas `eval_*`, la atribución A/B/C/D y los snapshots, que se difieren porque el MVP no los necesita.

## 6. Secuencia de desarrollo

1. T0: el DBA ejecuta las consultas (doc 02, §6); decide si el MVP tiene sentido por empresa.
2. T1–T3: API y pruebas (sin tocar Desktop).
3. Revisión de resultados reales de la API con Calidad (aún sin UI).
4. T4–T7: Desktop.
5. T8–T9: validación y despliegue (API primero, `latest.json` al final).
6. W1: Web.
7. Etapa 2 (F1–F2) solo si Calidad aprueba fórmula y la cobertura lo justifica.

## 7. Riesgos que persisten

- **Operador es texto libre**: variantes del mismo nombre se contarán como personas distintas. Mitigación MVP: normalizar mayúsculas/espacios y mostrar lista de variantes para que Calidad confirme; el catálogo con ID es mejora futura.
- **Edición retroactiva**: sin snapshots, un mes consultado hoy puede cambiar mañana. Aceptable mientras sea indicativo; debe quedar rotulado.
- **Uso sobre personas**: sin ranking de mejores y con código/nombre según permiso hasta que Nicolás defina el uso.
- **Pesos en configuración**: cambiarlos exige despliegue de la API; aceptable en el MVP.

## 8. Qué pasaría si se necesitara más

Se justifica agregar tablas `eval_*` y snapshots únicamente si Calidad exige (a) meses oficiales inmutables con auditoría de recálculo, o (b) atribución por sesión FPS. Hasta entonces, no.
