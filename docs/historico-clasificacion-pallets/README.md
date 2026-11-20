# Rescate histórico: clasificación de pallets azul / rojo / verde (INNPACK)

**Corte de la línea base:** 2026-11-20 · **Cobertura:** 2026-05-27 (primer registro disponible) a 2026-11-19 · **Operación:** solo lectura

## Qué es esto

Hasta ahora, la clasificación de pallets por color (azul = segregado/observado, rojo = no conforme/retirado) se anotaba informalmente en el texto de las observaciones de Inspecciones de Calidad. Antes de implementar un registro oficial y estructurado, este rescate documenta y conserva esos antecedentes.

> **Línea base informativa.** Este histórico **no es una estadística oficial de cantidades de pallets** ni un indicador de gestión. Es una referencia consultable anterior al registro oficial.

## Contenido de esta carpeta

| Archivo | Para qué sirve |
|---|---|
| `INFORME_HISTORICO_PALLETS_INNPACK.pdf` | Informe ejecutivo: metodología, cobertura, estadísticas, hallazgos, limitaciones, conclusiones |
| `HISTORICO_PALLETS_INNPACK.xlsx` | Libro de trabajo: registros completos, eventos únicos, resumen estadístico, fotografías, ambiguos y probables |
| `EVIDENCIAS_PALLETS.csv` | Exportación íntegra (una fila por inspección) para consultas o importaciones futuras |
| `DICCIONARIO_DATOS.md` | Campos, fuentes, criterios de clasificación y reglas de deduplicación |
| `REQUISITOS_REGISTRO_OFICIAL.md` | Requisitos mínimos del futuro registro oficial de pallets |
| `regenerar/` | Scripts y procedimiento para regenerar el histórico (sin credenciales) |

## Cifras de la línea base

- **111 inspecciones** con mención de color, agrupadas en **70 eventos únicos** (41 inspecciones son repeticiones dentro de un evento).
- Por evento único: **39 confirmados**, 17 probables, 14 ambiguos.
- Por color (eventos): azul 60 (37 confirmados), rojo 9 (2 confirmados), verde 1 (ambiguo, probablemente color de material).
- Fotografías: 57 distintas, **57 verificadas con HTTP 200**.
- Cantidades de pallets escritas en el texto: 8 eventos confirmados (suma declarada: 18). **No son conteos verificados.**
- Registros eliminados lógicamente: 4 (todos en MySQL). Los registros del tramo reciente (SQL Server) figuran como "no verificable".

## Limitación pendiente
Los registros eliminados lógicamente desde 2026-09-09 (SQL Server) no son consultables: la API no los expone (se probó con `incluirEliminados` y `eliminado`, sin efecto) y no existe acceso SQL de solo lectura a la base de Calidad desde este entorno. Para completarlo haría falta que el DBA entregue un `SELECT` de solo lectura de `registros_control` con `eliminado = 1` desde 2026-09-09.

## Qué NO es

- **No es un conteo de pallets.** Una fila es una inspección, y varias filas pueden describir el mismo hecho.
- **No es un indicador oficial.** Es una interpretación por reglas de texto libre.
- **No es cobertura completa.** No se pudo ver registros eliminados después del 2026-09-08 ni cliente/área de los registros leídos solo vía API. Ver "Limitaciones" en el informe.

## Relación con el futuro registro oficial

1. **Separación:** este histórico es una referencia consultable. No debe sumarse a los KPI del registro estructurado ni usarse como línea de tendencia comparable sin advertencia.
2. **Fecha de corte:** el registro estructurado comenzará en una fecha que se definirá después. Los eventos anteriores a esa fecha se consultan aquí; los posteriores, solo en el sistema nuevo.
3. **Consulta recomendada:** filtrar por `certeza = confirmado` y usar `evento_id` para contar hechos únicos. Los `probable` y `ambiguo` sirven como contexto, no como cifras.
4. **Qué se puede recuperar para el nuevo sistema:** color asignado, causa (defecto), NP, proceso, máquina, turno, inspector, estado de inspección/validación, fotografías y la observación textual original. Sirven para validar catálogos de causas y para entender las prácticas actuales de segregación.
5. **Qué NO se puede recuperar:** cantidades verificadas de pallets, números de pallet formales (solo los citados en texto) y trazabilidad de eliminados recientes.
6. **No modificar:** los registros originales permanecen intactos en sus bases; estos archivos son una copia derivada. Si se vuelve a generar, usar un nuevo corte y no sobrescribir esta línea base.

## Cómo se obtuvo

Consultas `SELECT` en sesión `READ ONLY` sobre MySQL `calidad` (histórico) y `GET` paginados a la API INNPACK (SQL Server vigente), con la cuenta de servicio ya configurada en el proyecto (no se muestran credenciales). Las fotografías se verificaron con peticiones `HEAD`. No se modificó ningún dato, API ni sistema.
