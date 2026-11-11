# 08 — Decisiones pendientes

## Para Pedro Roa (Calidad)

| # | Pregunta | Alternativas | Recomendación |
|---|---|---|---|
| P1 | ¿Qué fórmula se usa para convertir penalizaciones en un indicador? | F3+F4 (por unidades y frecuencia) / F2 (por 100 OF) / F5 cumplimiento 0–100 | F3+F4; F5 solo si fija el tope T |
| P2 | ¿Qué pasa con NC sin fecha de fabricación? | Excluir y reportar cobertura / fallback a fecha de ingreso marcado | Excluir en el indicador oficial; fallback solo en el panel indicativo |
| P3 | ¿Qué fecha de FPS equivale a "fecha de fabricación"? | Inicio de producción / fin de producción / rango de sesiones | Fin de producción de la sesión |
| P4 | ¿Cómo se reparte una NC si participaron varios operadores? | Reparto proporcional por minutos / al operador de la sesión de mayor duración / "no atribuida" | Proporcional por minutos, con marca "C" |
| P5 | Umbral de evaluabilidad (OF/horas mínimas, % cobertura) | 5 OF o 40 h; 80 % cobertura | Aprobar valores de partida |
| P6 | ¿Cuenta cero NC como 100 %? | Sí / solo si hay cobertura de inspección | Solo con cobertura mínima |
| P7 | ¿Qué denominador es el correcto: OF, unidades producidas o inspeccionadas? | | Unidades producidas; inspeccionadas solo en producto terminado |
| P8 | ¿Qué hacer con reprocesos y NC anuladas/corregidas? | | Anuladas excluidas; reprocesos con exposición única |
| P9 | ¿Quién clasifica el nivel de las NC pendientes? | Quién registra / Calidad | Calidad, con bandeja |
| P10 | Gobierno de ponderaciones: ¿quién propone y quién aprueba? Vigencia, simulación | | Propone Calidad, aprueba jefatura de Calidad, vigencia futura, historial |
| P11 | ¿Los meses oficiales se recalculan ante NC tardías o se preservan? | | Preservar; recálculo solo con aprobación y registro del diff |
| P12 | ¿Se evalúan NC internas (desviaciones) o solo de producto? | | Solo producto en v1 (las internas no capturan operador/nivel) |

## Para Nicolás (solicitante / negocio)

- N1: ¿Para qué decisiones se usará el resultado (mejora, capacitación, bonos, disciplina)? Define el rigor exigible y la necesidad de revisión RR.HH./legal.
- N2: ¿Debe verse el ranking nominal o agregado por máquina/proceso? ¿Quién ve nombres?
- N3: ¿Alcance inicial: INNPACK, Faret o ambas? ¿Qué máquinas piloto (p. ej. AGNATI)?
- N4: ¿El operador podrá ver su propio resultado?
- N5: Periodicidad y fecha de corte mensual (¿cuándo se "cierra" un mes?).

## Definiciones requeridas de FPS

- F-1: Qué estados de OF cuentan como "procesada/finalizada" (motivos de cierre válidos).
- F-2: Equivalencia de unidades entre procesos (pliegos, bandejas, etc.) y política ante el multiplicador ×1/×2/×3.
- F-3: Tratamiento del sobreconteo documentado (`fps-analyzer`).
- F-4: Cómo identificar reprocesos de forma explícita (hoy se infieren).
- F-5: Corrección de 11 RUT repetidos, 6 sesiones con fin<inicio, 18 `FpsStationSystemKey` duplicados.
- F-6: Autorización de lectura para un endpoint `sesiones` y verificación de `API_KEY`.
- F-7: Tabla puente máquinas FPS ↔ QC (quién la mantiene).

## Decisiones de TI

- T1: Confirmar arquitectura E (módulo en API INNPACK) frente a servicio independiente.
- T2: Autorizar acceso de solo lectura a `calidad`/`importacion_pnc` para ejecutar Q1–Q6.
- T3: Exposición de red y autenticación de los GET de FastAPI y de fps-api Node.
- T4: ¿Se agrega auditoría de cambios (nivel/operador/fecha de fabricación) en las NC de origen? Recomendado antes de oficializar.
- T5: Captura en origen: convertir `operador` y `máquina` de las NC en catálogo con ID (RUT/`aplatz_id`) en vez de texto libre, y hacer obligatoria `fecha_fabricacion` en NC de producto.
- T6: Ubicación de las tablas `eval_*` y GRANT por objeto (DBA).
- T7: Política de datos personales: retención, anonimización, acceso.

## Recomendación sobre el punto más delicado

Mejorar la **captura en origen** (T5) tiene más impacto sobre la confiabilidad que cualquier fórmula: sin operador con ID ni fecha de fabricación obligatoria, la atribución seguirá siendo inferida.
