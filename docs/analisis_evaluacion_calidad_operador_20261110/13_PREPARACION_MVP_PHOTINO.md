# 13 — Preparación del MVP en Photino

> **ACTUALIZACIÓN 10-11-2026: MVP IMPLEMENTADO y probado localmente (sin desplegar, sin commit).** Ver `18_CIERRE_MVP_EVALUACION_OPERADORES.md`. Diferencias respecto al borrador de abajo, tras la auditoría real (doc 11):
> - **Sin endpoint nuevo en la API ni cambios SQL:** el handler del desktop lee `GET api/no-conformidades` (ámbito PRODUCTO, JWT de sesión) y agrega en C# (`EvaluacionOperadoresCalculator`). Con 7 NC de producto el volumen no justifica tocar ni desplegar la API.
> - Una sola acción: `evaluacionOperadores.resumen` (lectura por sufijo; no hace falta `AccionesLectura`). Devuelve agregados + opciones de filtro, nunca filas crudas.
> - Permisos: módulo `evaluacion-operadores` registrado (sin prefijos de escritura), **SIN_ACCESO por defecto** salvo ADMIN_TI o permiso personalizado VER/EDITAR; el backend exige acceso aunque la acción llegue con otro `_modulo`.
> - Veredicto: **APTO CON RESTRICCIONES / datos insuficientes** (5 NC evaluables).

## (Borrador original, previo a la auditoría)

Estado: preparación técnica que no depende de la auditoría. Las decisiones marcadas **[DEPENDE DE DATOS]** se cierran con el doc 11 completo. No se inventa ningún resultado.

## 1. Módulo independiente en el sidebar principal

- Nombre visible: **Evaluación de Calidad por Operador**. Identificador de módulo: `evaluacion-operadores` (kebab) → `window.EvaluacionOperadoresController`.
- Botón nuevo en `src/UI/www/index.html`, junto al de No Conformidades: `<button data-module="evaluacion-operadores" data-empresa="INNPACK">` (mismo patrón de ícono SVG que los vecinos).
- No se agrega dentro de `no-conformidades` ni de `nc-internas`. Los filtros complementarios en esos módulos son una fase posterior.
- Alcance inicial: solo INNPACK (datos de `calidad_db`). Faret: etapa posterior (datos en `importacion_pnc`).

## 2. Archivos y puntos de cambio (para cuando se apruebe implementar)

| Capa | Archivo / lugar | Cambio |
|---|---|---|
| Permisos | `src/Backend/Services/PermisosService.cs` → `Modulos` | `["evaluacion-operadores"] = new("INNPACK", Array.Empty<string>())` (solo lectura, sin prefijos de escritura) |
| Permisos | mismo archivo, `AccionesLectura` | no hace falta si la acción termina en `.resumen`/`.list`/`.detalle` (ver §3) |
| Router | `MessageRouter.Handle` | rama `evaluacionOperadores` → handler nuevo |
| Handler | `src/Backend/Modules/EvaluacionOperadores/EvaluacionOperadoresHandler.cs` | passthrough a la API INNPACK, mismos helpers `Ok/Error`, `TryGetInt/String` (ojo con `JsonElement` numérico) |
| Cliente API | `InnpackApiClient` (existente) | `GET api/no-conformidades/evaluacion-operadores` |
| Frontend | `src/UI/www/modules/evaluacion-operadores/` (`.view.html`, `.controller.js`, `.css`) | vista nueva; reutiliza Chart.js local, `ExcelExporter.exportTable`, `TableUtils` |
| Release | `.csproj` (3 propiedades de versión), `.iss`, sidebar de versión, novedades | según runbook; comparar contra el `latest.json` real del share |
| API INNPACK | `NoConformidadesRepository/Service/Controller` | filtro por `fecha_fabricacion` + endpoint de agregación (doc 10 §3) |

## 3. Contrato de acciones (propuesto)

- `evaluacionOperadores.resumen` → puntos por operador, conteos por nivel, tendencia 6 meses, cobertura. Termina en `.resumen`: la valida como lectura `PermisosService` sin registrarla.
- `evaluacionOperadores.detalle` → NC origen de un operador y mes (lectura).
- `evaluacionOperadores.opciones` → operadores/máquinas del filtro. **Termina en `.opciones`: debe agregarse a `AccionesLectura`** o quedará bloqueada con permiso VER (error ya ocurrido con `despachosDiarios.sap.categorias`). Alternativa: llamarla `.list`.
- Parámetros: `anio`, `mes`, `empresa`, `maquina`, `operador` (todos opcionales salvo período). Pesos 10/5/1 viajan en la respuesta con etiqueta de versión; no se editan desde el desktop.

## 4. Reglas funcionales confirmadas por el negocio

- Puntos: Crítico 10, Mayor 5, Menor 1. Período mensual por **fecha de fabricación** (`fecha_fabricacion`), no por `fecha_ingreso`.
- Excluidas de los puntos y mostradas como cobertura: sin operador, sin fecha de fabricación, nivel sin clasificar. `eliminado = 0`, `ambito = 'PRODUCTO'`.
- Sin porcentaje de calidad, sin ranking de "mejores", leyenda "indicativo; fórmula pendiente de Calidad".
- Solo lectura y exportación a Excel.

## 5. Pantalla (borrador)

1. Selector mes/año + filtros máquina y operador.
2. Tarjetas: Críticos, Mayores, Menores, Puntaje total, Cobertura (% de NC atribuibles).
3. Tabla por operador (críticos/mayores/menores/puntos, orden alfabético por defecto, no por puntaje).
4. Gráfico de tendencia mensual (6 meses) y comparación con el mes anterior.
5. Detalle por operador con los registros origen.
6. Banner de calidad de datos **[DEPENDE DE DATOS]**.

## 6. Pruebas previstas (sin datos productivos en el repo)

Casos de borde de cálculo (nivel vacío/variantes de mayúsculas, operador nulo, mes sin NC, fabricación en mes distinto al ingreso, `eliminado=1`), con datos sintéticos en pruebas unitarias de la API. Permisos: usuario VER no puede escribir; SIN_ACCESO no ve el botón. Regresión de No Conformidades, NC Internas y Trazabilidad.

## 7. Pendiente / bloqueado por datos

- **[DEPENDE DE DATOS]** Valores reales de `nivel`/`severidad` y su normalización; cobertura de operador y fecha de fabricación; variantes de nombres de operador; caso octubre 2026 (fabricación vs ingreso); simulación 10/5/1 (doc 12).
- **[DEPENDE DE CALIDAD]** Fórmula final, tratamiento de NC sin fecha de fabricación, nombre vs código del operador, uso del resultado.
- **[DEPENDE DE ADMIN .76]** Perfil MCP `calidad-sqlserver` (doc 16).
- Veredicto de desarrollo: **sin emitir** (BLOQUEADO POR DATOS hasta completar la auditoría).
