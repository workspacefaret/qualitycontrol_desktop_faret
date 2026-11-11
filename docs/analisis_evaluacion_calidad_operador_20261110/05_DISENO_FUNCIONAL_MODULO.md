# 05 — Diseño funcional del módulo "Evaluación de calidad por operador" (PROPUESTA)

No se implementa frontend en esta fase. Nombre de módulo sugerido: `evaluacion-operadores` (INNPACK) y `faret-evaluacion-operadores` (Faret), con **lógica única** en `shared/evaluacion-operadores-base.js` (patrón ya usado en Formularios y Despachos Diarios) para no duplicar réplicas.

## 1. Roles y permisos

| Rol | Acceso |
|---|---|
| ADMIN_TI | Todo, incluida administración de ponderaciones técnicas y reproceso |
| Calidad (jefe/coordinador) | Ver todo, proponer/aprobar ponderaciones, marcar atribuciones, exportar |
| Supervisión | Ver su(s) máquina(s)/proceso(s); detalle de operadores de su área |
| Consulta | Vista ejecutiva agregada (sin nombres) |
| Operador | Sin acceso en v1 (decisión pendiente, doc 08) |

Se registra en `PermisosService.Modulos` con niveles SIN_ACCESO/VER/EDITAR; lecturas nuevas en `AccionesLectura`. Nombres de operadores visibles solo con permiso explícito; por defecto, código anónimo.

## 2. Filtros

Mes y año (por **fecha de fabricación**), rango de meses, empresa, máquina, proceso/área, operador, OF/NP, tipo de NC, nivel (gravedad), estado de atribución (A/B/C/D), volumen mínimo de producción, "solo evaluables", versión de ponderación (oficial/provisional).

## 3. Vistas

**Ejecutiva**: indicador global (con estado de cobertura), operadores evaluados / no evaluables, NC por gravedad (Crítico/Mayor/Menor), tendencia mensual, máquinas con mayor incidencia, % de NC sin atribución, última sincronización.

**Por operador**: identificación (código o nombre según permiso), producción atribuible (sesiones, horas, OF, unidades), NC (por nivel), penalización acumulada, F3/F4/F5 según versión aprobada, evolución histórica, comparación con meses anteriores y con el promedio de su máquina/proceso, indicador de confiabilidad (cobertura y % atribución C/D).

**Ranking**: Mejores / Mayor incidencia. Siempre **dentro de máquina o proceso** por defecto; "volumen mínimo" obligatorio; los operadores bajo umbral se muestran en "No evaluables" sin posición; advertencia visible cuando se mezclan máquinas. Prohibido ordenar con operadores de exposición muy distinta sin normalización.

**Detalle y trazabilidad** (por NC): OF/NP, fecha de fabricación (y si fue fallback), máquina, evento de calidad, clasificación, ponderación aplicada (versión), origen del dato (INNPACK/Faret), **justificación de la atribución** (nivel A/B/C/D, sesiones consideradas, regla aplicada), enlace a la NC.

**Bandeja "Sin atribución"**: NC sin operador resoluble, con propuesta de operador candidato para que Calidad confirme (confirmación queda auditada).

**Administración** (solo Calidad/TI): ponderaciones con versión, vigencia, justificación, simulación, aprobación; mapeo alias de operador→RUT; puente de máquinas.

## 4. Flujos de usuario

1. Calidad abre mes cerrado → ve ejecutiva → filtra máquina → ve ranking con advertencias → abre operador → revisa detalle de cada NC y su justificación → exporta.
2. NC tardía: el sistema marca "Período octubre recalculado (versión 3 → 4)" con diff; Calidad aprueba el recálculo antes de que reemplace el snapshot oficial.
3. Cambio de ponderaciones: Calidad crea versión borrador → **simula** sobre meses históricos (sin guardar) → compara contra la oficial → solicita aprobación → activa con fecha de vigencia futura. Los meses ya aprobados conservan su versión.

## 5. Responsive y exportación

Layout con grid adaptable (breakpoints 640/900/1280 px; el ancho real útil es ventana/0,9 por el zoom 90 % de Photino). Filtros colapsables en móvil. Exportación Excel (ya existe `ExcelExporter`) y PDF/impresión (`PrintExporter.printReport`) con filtros y versión de ponderación en el encabezado y la leyenda "indicativo/oficial". Justificada porque Calidad necesita evidencia para revisión; la exportación nominal exige permiso.

## 6. Mensajes de estado obligatorios

"No evaluable", "Datos insuficientes", "Evaluable con reservas", "Indicativo — no oficial". Nunca mostrar porcentaje sin su estado.
