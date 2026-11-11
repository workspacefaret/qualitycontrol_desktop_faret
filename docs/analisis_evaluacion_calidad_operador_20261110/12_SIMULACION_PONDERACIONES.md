# 12 — Simulación de ponderaciones 10/5/1 con datos reales (10-11-2026)

Fuente: CSV 08, 11, 13, 17, 18, 19 de la auditoría (operadores seudonimizados). Ponderaciones **provisionales** de Calidad (Crítico 10 · Mayor 5 · Menor 1), **no aprobadas formalmente**. Período = `fecha_fabricacion`. **No hay nota 0–100, porcentaje ni ranking**, y no se interpreta "menos puntos" como "mejor desempeño".

## Reglas aplicadas (idénticas en la auditoría SQL y en el módulo)
- Universo: ámbito PRODUCTO, no eliminadas.
- Nivel por prefijo: CR→Crítico, MAY→Mayor, MEN→Menor; vacío u otro valor → sin clasificar (0 puntos, excluida).
- **Evaluable** = tiene fecha de fabricación + operador identificable (no vacío, no genérico, no varios) + nivel válido. La máquina **no** es requisito (se informa aparte).
- Puntos = suma de 10/5/1 solo de NC evaluables; los puntos de NC excluidas se muestran aparte.

## Resultado por mes (VERIFICADO, CSV 18)

| Mes de fabricación | Registradas | Evaluables | Excluidas (motivo) | Puntos evaluables | Puntos excluidos |
|---|---:|---:|---|---:|---:|
| 2026-03 | 3 | 3 | — | 3 | 0 |
| 2026-06 | 2 | 1 | 1 sin operador | 5 | 1 |
| 2026-07 | 1 | 1 | — | 5 | 0 |
| sin fecha | 1 | 0 | 1 sin fecha de fabricación | 0 | 5 |
| **Octubre 2026** | **0** | 0 | — | 0 | 0 |
| **Total** | **7** | **5** | **2** | **13** | **6** |

Por operador-máquina-mes (CSV 17): tres combinaciones, una NC-grupo cada una; ningún operador aparece en más de un mes ni en más de una máquina. Por tanto **no existe tendencia por operador** ni comparación posible entre personas.

## Sensibilidad (ilustrativa, sobre las 5 NC evaluables)
Con 10/5/1 el total es 13. Si Calidad cambiara los pesos, solo se recalcula `puntos = 10·C + 5·M + 1·m` con C=0, M=2, m=3: p. ej. 10/3/1 → 9; 5/3/1 → 9; 10/5/2 → 16. Con tan pocos datos cualquier peso da conclusiones frágiles.

## Conclusiones
1. **Octubre 2026 no tiene datos**: no se puede analizar el mes pedido por Calidad.
2. **No hay base para comparar**: 5 NC evaluables en ~8 meses; sin volumen de producción ni turnos que normalicen.
3. Los puntos mensuales sirven solo como **cuenta descriptiva**; presentarlos como evaluación sería engañoso.
4. Antes de decidir fórmula, Calidad debe confirmar si el bajo volumen (7 NC de producto) refleja la realidad de planta o un subregistro, y si el operador se captura de forma consistente.

## Decisiones pendientes de Calidad (Pedro Roa / Nicolás)
Validación formal de 10/5/1; umbral mínimo de NC para comparar (el módulo usa 30, provisional); tratamiento de NC sin operador (hoy excluida) y con varios operadores (hoy excluida); si `severidad` debe influir o solo `nivel`; si las NC internas INNPACK entran; criterio de normalización por producción.
