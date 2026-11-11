# 09 — Resumen ejecutivo

**Estado:** análisis y propuesta; nada implementado, desplegado ni modificado.

## Respuestas directas

1. **¿Viable técnicamente?** Sí, **con condiciones**. Todos los datos necesarios existen en algún sistema, pero la unión es débil en el lado de Calidad.
2. **¿Qué existe y qué falta?** *Existe (CONFIRMADO):* producción por sesión con operador (RUT) y máquina al 100 % en FPS; NC con nivel, operador, máquina y fecha de fabricación (campos opcionales); autenticación, permisos y patrón de módulos. *Falta:* clave común operador/máquina entre QC y FPS, fecha de fabricación obligatoria, ponderación por nivel, auditoría de cambios, endpoint de sesiones de FPS, y la **cobertura real de NC no está medida** (sin acceso a BD de calidad desde esta sesión).
3. **¿Se puede relacionar de forma confiable operador–producción–NC?** **Solo parcialmente.** Sesión→operador/máquina/NP es directa y verificada. NC→NP es determinística. NC→sesión→operador es **inferida**; el 90 % de las OF tiene varios operadores, así que la atribución unívoca solo es posible en una parte de los casos. Las NC internas no son atribuibles.
4. **¿Dónde vive la lógica?** En un módulo de la **API INNPACK** (cálculo único, proyección materializada), no en JS ni en FPS.
5. **¿Dónde se administran las ponderaciones?** En tablas versionadas del mismo módulo, con aprobación de Calidad, vigencia, simulación y sin alterar meses oficiales.
6. **¿Dónde se visualiza?** En Quality Control (Photino y Web, vista JS compartida). FPS no es host viable (VB legado/estaciones).
7. **¿Qué se modifica?** QC Desktop/Web: sí (módulo). API INNPACK: sí. fps-api Node: un endpoint de lectura nuevo. FPS-Python/estaciones: **ninguno**. Recomendado en orígenes: auditoría y captura con ID.
8. **¿Servicio intermedio?** Lógico sí, físico no: arquitectura E (extraíble a servicio independiente si crece).
9. **¿Fórmula?** Presentar a Calidad **F3 (penalización por 1.000 unidades) + F4 (NC por 100 OF)**, con F5 (0–100) opcional una vez aprobado el tope; inicialmente un **panel indicativo** F1/F4 sin ranking individual. Puntuación de arquitectura: E 4,10 / A 3,54 / D 3,45 / C 2,73 / B 2,31.
10. **Riesgos principales:** cobertura de datos, atribución ambigua, fórmula sin aprobar, uso sobre personas, edición retroactiva sin auditoría, seguridad de endpoints FPS.
11. **Desarrollo concreto:** tablas `eval_*`, ingesta/atribución/cálculo, endpoints, endpoint en fps-api, handlers Desktop/Web, vista compartida, mapeos de alias y máquinas.
12. **Fases:** 0 verificación de datos → 1 decisiones de Calidad → 2 fundamentos → 3 endpoint FPS → 4 motor → 5 panel provisional → 6 Web/Faret → 7 piloto → 8 oficialización.
13. **Decisiones de Pedro y Nicolás:** doc 08 (12 + 5 preguntas; las críticas: fecha de fabricación nula, reparto entre operadores, umbrales, para qué se usará el resultado).
14. **Solución más mantenible:** arquitectura E con un solo cálculo, una sola vista y captura en origen mejorada.

## Estimación

≈ **43–57 días-persona** (±30 %), tras una Fase 0 de 2–3 días. Complejidad media-alta, riesgo técnico bajo-medio; el riesgo real es de **datos y gobierno**, no de tecnología.

## Hallazgos que condicionan todo

- `operador` y `máquina` son texto libre sin ID en QC; `fecha_fabricacion` opcional; sin historial por campo.
- El denominador solo existe en FPS (sesión = grano; `PlRed/Green/Blue` son texto).
- FPS no tiene "fecha de fabricación" ni QR de máquina.
- "Críticas" en INNPACK se cuenta por `severidad`, no por `nivel`; no hay ponderación hoy.
- Documentación del Desktop desactualizada (NC en MySQL; hoy SQL Server).

## Confirmado vs. pendiente

| Confirmado | Pendiente |
|---|---|
| Arquitectura real de Desktop/Web/APIs; cardinalidades de FPS (90 d); operador/máquina/NP en sesiones FPS 100 %; ausencia de auditoría de campos; opcionalidad de operador y fecha de fabricación | **Cobertura real en NC** (Q1–Q6); valores reales de `nivel`; match NP→OF en muestra; `API_KEY` y exposición de red; columnas exactas de `importacion_pnc` para auditoría; quién mantiene el puente de máquinas; fórmula y umbrales aprobados |

## Recomendación única

Aprobar la **arquitectura E** y ejecutar de inmediato la **Fase 0** (consultas de solo lectura por una persona autorizada) para medir la cobertura real. En paralelo, que Calidad responda P1–P4 y que TI evalúe la captura con ID y la auditoría en origen. Hasta entonces, no publicar rankings individuales; solo un panel indicativo agregado por máquina/proceso. **Próximo paso: autorizar Fase 0 y reunión con Pedro y Nicolás con el doc 08.**
