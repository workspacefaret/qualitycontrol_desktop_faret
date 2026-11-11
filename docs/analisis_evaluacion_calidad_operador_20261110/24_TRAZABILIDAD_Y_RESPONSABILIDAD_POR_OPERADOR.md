# 24 — Trazabilidad y responsabilidad propuesta por operador (10-11-2026)

Principio: **participar ≠ ser responsable**. Toda asignación es una *propuesta provisional* pendiente de validación de Calidad. Nada se convirtió en penalización confirmada. Sin cambios en BD, permisos, servidores ni servicios; sin despliegue, commit ni push. Datos: los CSV reales ya descargados el 10-11-2026 (`C:\Users\dcarrasco\fps_historico\resultados_20261110_152520`, fuera del repo, con nombres); no hubo acceso nuevo al servidor.

## 1. Inventario de fuentes y campos útiles
| Fuente | Estado | Campos útiles |
|---|---|---|
| `[plan].[vw_FactProduccion]` (única accesible a `fps_historico_ro`) | usada | `NVInnpack`, `NP`, `OT`, `ITEM/PL`, `MAQUINA`/`IdMaquina`, `Proceso`, `OPERADOR`, `FECHA INICIO/TERMINO` (fecha+hora exactas), `TIEMPO SETUP/PRODUCCION`, `CANTIDAD_PRODUCCION/SETUP`, `OBSERVACIONES`, `ENTRADA` (casi siempre 0), `PRIMER_CONTEO` (vacío) |
| `dbo.WorkOrderRecords`, `dbo.ZZZMasterOT`, tablas de sesión/eventos/turnos | **no accesibles** con la cuenta actual (solo la vista) | ver sección 8 |
| `no_conformidades` (Calidad) | usada | `np_nv` (= NV Innpack), `maquina`, `fecha_fabricacion`, `fecha_ingreso`, `nivel`, `operador` (texto libre) |

La sesión FPS **no es el turno real del operador**: se abre en cada cambio de turno (~07:00) o de OT; sirve como evidencia de presencia en máquina/OT, no de hora exacta del defecto.

## 2. Por qué no había coincidencia temporal (interpretación de fechas)
Revisados los 7 NV con todas sus OT (9–14 OT por NV, varios procesos por NV). Hallazgos:
- `fecha_fabricacion` de la NC **no es una fecha de fabricación**: 4/7 caen fuera del período en que FPS fabricó ese NV (p. ej. NV 3687 fabricado 22-ene→17-feb; NC dice 10/31-mar), y el registro de la NC ocurre **73–128 días después**. Es consistente con fecha de **detección** (una NC tiene incluso fecha anterior al registro en −10 días: dato no fiable). → La ventana temporal del defecto **no es fiable** en ningún caso (0/7).
- El problema no es ausencia de sesiones: cada NV tiene decenas de sesiones con horas exactas; falta una fecha/turno del defecto confiable.
- 4/7 NC caen en el mismo proceso de la máquina (Pegado/DIANA 8 → NV 3687) o en Termoformado cuya fecha sí cae dentro del período del NV (NC 7 y 14), pero esas máquinas requieren alias no validados.

## 3. Reglas de identificación implementadas (Pasos A–D)
A. Documento: NV Innpack (o NP) normalizado sin ceros, sin cruces ambiguos (NP compartido entre empresas → sin asignación).
B. Máquina: normalización de nombre (acentos, paréntesis, romanos) + **tabla de alias local y revisable** (`--alias`, solo filas `validado=SI`); no se valida ninguna equivalencia dudosa.
C. Operadores: todos los de la máquina en ese documento, sin duplicar (un operador = una cuota por NC, aunque tenga varias sesiones/OT).
D. Horario: la ventana solo se usa si la fecha de la NC cae dentro de sesiones de esa máquina; la fecha de registro nunca se usa como fabricación.

## 4. Motor de responsabilidad (`tools/fps_historico/motor_responsabilidad.py`)
Determinista, configurable (`PUNTOS_POR_NIVEL`, 10/5/1 provisional), sin nombres (seudónimos):
1 operador único → propuesta individual (confianza ALTA con ventana fiable, MEDIA sin ella).
2 varios + ventana fiable → solo sesiones que cubren la fecha (el resto queda en contexto).
3 varios sin horario fiable, documento y máquina confirmados → reparto equitativo en centésimas **sin pérdida** (5 entre 3 = 1,67 + 1,67 + 1,66).
4 evidencia insuficiente → 0 puntos, participantes solo como contexto («pendiente de investigación»).
Salvaguardas: una NC nunca propone más puntos que su severidad; NC eliminada/rectificada se marca «revisar vigencia» y no suma; **ningún estado «confirmado» sale del motor** ni se lee de archivo (el lector C# lo fuerza a «pendiente de validación»).
Indicadores independientes: **A** participación (NC en que participó), **B** puntos propuestos, **C** puntos confirmados (siempre 0 hasta que exista una decisión explícita de Calidad; no hay almacenamiento para ella).
`generar_snapshot_v2.py` produce el snapshot v2 (`version:2`, sin nombres) con `ncDetalle`, `indicadores`, `escenarios` y nota de vigencia.

## 5. Cifras reales (7 NC de producto; snapshot v2)
| Concepto | Resultado |
|---|---|
| NC con documento (NV) identificable en FPS | **7 / 7** |
| NC con OT identificable | **7 / 7** (9–14 OT por NV) |
| NC con máquina identificable (nombre normalizado) | **3 / 7** (NC 11, 12, 13 → DIANA 8). Las otras 4 requieren alias o la máquina no se usó (NC 15) |
| NC con horario fiable | **0 / 7** |
| Propuestas individuales (escenario 1) | **3** (NC 11-13; confianza MEDIA, fecha fuera de sesiones → misma persona en las 3, 1 punto c/u) |
| Propuestas compartidas (esc. 3) / con horario (esc. 2) | 0 / 0 |
| Sin evidencia suficiente (esc. 4) | **4** (NC 6, 7, 14, 15; 0 puntos) |
| Puntos confirmados | **0** |

Las 3 propuestas individuales son frágiles: la misma persona opera DIANA 8 en ese NV, pero la fecha de la NC no coincide con sus sesiones y 3 NC separadas comparten la misma NV; requieren validación de Calidad antes de cualquier uso.

## 6. Cambios funcionales y visuales
- Backend: `EvaluacionOperadoresAuditoria.cs` lee snapshot v1 **o v2**; valida/acota todos los campos; fuerza estado «pendiente», escenario 4 → 0 puntos, C = 0; sin nombres.
- UI (`evaluacion-operadores`): nueva sección «Trazabilidad y responsabilidad propuesta por NC» (tabla de NC → clic/Enter abre el detalle: documento/OT/sesiones, máquina NC vs FPS, fecha de fabricación vs registro vs horario fiable, operadores propuestos con sesiones/cantidad/período/puntos, todos los participantes como contexto, criterio aplicado, evidencia faltante, estado de Calidad, aviso de NC eliminada/rectificada) y tabla de los 3 indicadores; snapshot rotulado como histórico con fecha de generación. Con permiso VER solo seudónimos `OP-xxxxxx`.
- Tablas: separadores verticales sutiles, cabecera con línea inferior marcada, líneas horizontales entre filas, números alineados a la derecha, scroll horizontal dentro de `.table-container` (aplicado a las tablas nuevas y a las del módulo). No se tocó ningún cálculo.
- Actualización de datos: sigue siendo una carga manual periódica del snapshot (`analizar_cruce.py`/`generar_snapshot_v2.py` → `%ProgramData%\QualityControlCenter\auditoria_fps.json`); sin API, servicio ni infraestructura nuevos.

## 7. Pruebas
| Suite | Resultado |
|---|---|
| `tools/fps_historico/tests` (analizador 29 + motor 16) | **45/45** |
| `tools/evaluacion_operadores_tests` (backend) | **65/65** (59 + 6: lectura v2, nunca confirmada, escenario 4 sin puntos, reparto 5/3 conserva total, C=0, sin nombres) |
| Motor: NP/NV, variantes de máquina y alias, operador único, varios con distintas horas, simultáneos, sin horarios, sin máquina, NC posterior a la fabricación, sesiones duplicadas, varias OT, reparto sin pérdida, eliminada/rectificada, sin nombres, participar ≠ responsable | cubiertas |
| `dotnet build` Release | 0 errores |
| Ventana Photino real (CDP, puente simulado con salida real del lector sobre el snapshot v2 real) | 14/14: 7 NC, separadores en celdas/encabezado/tabla principal, números a la derecha, detalle completo, escenario 4, sin nombres, sin errores JS, **sin desborde de página a 1366/1000/800 px** |

No probado: sesión INNPACK real con permisos reales (sin credenciales de aplicación) ni «NC con múltiples OT en una misma máquina» con datos reales distintos de los 7 NV.

## 8. Objetos adicionales necesarios (no solicitados aún; **requieren autorización**)
Para fiabilizar horarios y validar propiedades: SELECT sobre `dbo.WorkOrderRecords` (columnas `ID, OT, IdMaquina, Rut/IdUsuario, FECHA INICIO/TERMINO, Turno si existe, CANTIDAD_*`), `dbo.ZZZMasterOT` (`OT, NVInnpack, NP, ITEM, PL`) y la tabla/eventos de sesión (pausas, cambio de operador) si existen. Si no se autorizan, la vista actual alcanza para los resultados de este documento.

## 9. Pendiente para Calidad / producción
1. Confirmar que `fecha_fabricacion` es fecha de detección y definir un campo «fecha y turno del defecto».
2. Validar la tabla de alias de máquinas (Discover Cilíndrica 1, Cónica/Ovalada…); captura de máquina/operador por catálogo con el mismo código FPS.
3. Definir el proceso/etapa donde se originó el defecto (un NV pasa por 4–7 procesos).
4. Aprobar el criterio de reparto compartido y las ponderaciones (10/5/1).
5. Decidir dónde se guarda la decisión de Calidad (indicador C) y cómo se distribuye el snapshot; sin eso C permanece en 0.
6. Sesión real INNPACK, empaquetado e instalador solo con autorización (candidata 1.8.29 sin cambiar de versión).
