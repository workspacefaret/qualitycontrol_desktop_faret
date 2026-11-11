# 07 — Plan de implementación (PROPUESTA)

> **SUPERADO por `10_PLAN_REVISADO_MVP_INCREMENTAL.md`** (estrategia incremental, MVP ≈ 54 h). Este plan queda como referencia de la etapa futura.

Las estimaciones son **juicio de ingeniería en días-persona**, con ±30 % de incertidumbre hasta ejecutar la Fase 0. No incluyen esperas de aprobación de Calidad.

## Fases

| Fase | Contenido | Depende de | Esfuerzo |
|---|---|---|---|
| **0. Verificación de datos** | Ejecutar Q1–Q6 y F1–F6 (doc 02 §6) con DBA/TI; medir cobertura de operador, fecha de fabricación, nivel, match NP→OF; decidir si el proyecto es viable por empresa | Acceso de solo lectura por persona autorizada | 2–3 d |
| **1. Decisiones de negocio** | Cerrar P1–P12 del doc 08 (fórmula, denominador, fallback de fecha, atribución C, umbrales) | Fase 0 | calendario de Calidad |
| **2. Fundamentos de datos** | Tablas `eval_*` (SQL + GRANT por DBA); carga y revisión de alias operador→RUT; puente de máquinas; normalizador de nivel | Fase 1 | 6–8 d |
| **3. Endpoint FPS** | `GET /api/calidad/sesiones` en fps-api Node + pruebas contra FPS real acotadas + verificación de `API_KEY` | Fase 0 | 3–4 d |
| **4. Motor (API INNPACK)** | Ingesta incremental, atribución A/B/C/D, cálculo versionado, snapshots, recálculo controlado, auditoría, endpoints | Fases 2–3 | 12–15 d |
| **5. Panel provisional (Photino)** | Handler passthrough, permisos, vista compartida (ejecutiva + operador + detalle), exportación | Fase 4 | 8–10 d |
| **6. Paridad Web + Faret** | Bridge Java, `PermisosModulo`, variante Faret | Fase 5 | 4–6 d |
| **7. Validación y piloto** | Pruebas de aceptación, piloto con 1–2 máquinas y Calidad, ajuste de umbrales | Fases 4–6 | 6–8 d |
| **8. Oficialización** | Aprobación de versión de ponderación, activación de `OFICIAL`, capacitación | Fase 7 | 2–3 d |

**Total orientativo: 43–57 días-persona** (≈ 2,5–3,5 meses con una persona a dedicación parcial), más la Fase 0 y las decisiones.

## Despliegue (respetando la política vigente)

Orden: **SQL (DBA) → fps-api (endpoint) → API INNPACK → Desktop instalador → Web → `latest.json` al final**. Ejecución supervisada por una persona; respaldo con hash antes de tocar producción; reinicio solo del pool/tarea afectado; sin desactivar Kaspersky ni crear exclusiones; sin `-ExecutionPolicy Bypass` ni `c$`. Versionado del instalador: 3 propiedades del `.csproj` + `.iss` + sidebar + novedades; comparar con el `latest.json` real del share.

## Rollback

- Módulo aislado: tablas `eval_*` nuevas y acciones nuevas → revertir = restaurar DLL de la API previa y publicar `latest.json` anterior (backup con timestamp); las tablas pueden quedar sin uso sin afectar el resto.
- El endpoint nuevo de fps-api es aditivo: retirarlo no afecta otras rutas.
- Feature flag: el módulo se registra con permiso `SIN_ACCESO` por defecto; se habilita por usuario.

## Riesgos principales

| Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|
| Cobertura baja de operador/fecha de fabricación en NC | Media-Alta | Alto | Fase 0; mejorar captura (campos obligatorios/catálogo con ID) antes de oficializar |
| Alias de operador ambiguos | Alta | Medio | Mapeo confirmado por Calidad; bandeja de pendientes |
| Fórmula no aprobada / disputa por ranking | Media | Alto | Panel indicativo, sin ranking individual por defecto |
| Uso disciplinario sin garantías | Media | Alto | Política de uso, revisión RR.HH./legal, estados "no evaluable" |
| Seguridad de fps-api / FastAPI abiertas | Media | Medio | Verificar `API_KEY` y exposición antes de conectar |
| Edición retroactiva de NC | Alta | Medio | `hash_fuente`, diff y recálculo aprobado |
| Cambios del Desktop/Web divergen | Media | Medio | Vista JS única y cálculo solo en la API |

## Pruebas y criterios de aceptación (medibles)

| Área | Prueba | Criterio |
|---|---|---|
| Exactitud matemática | Casos de oro (hoja de cálculo independiente) para F1–F6 | 100 % de coincidencia a 4 decimales |
| Correlación | Muestra de 100 NC con atribución revisada a mano | ≥ 95 % de coincidencia en clase A/B; 100 % de C/D correctamente marcadas |
| Fechas | NC con fabricación en mes M y registro en M+1 | Se computa en M; fallback marcado |
| Atribución | OF con 3 operadores y cambio de turno | Reparto C suma exactamente 1,0 por NC |
| Versionado | Cambiar peso Mayor 5→6 | Meses oficiales previos **sin cambio**; simulación muestra diff |
| Recálculo histórico | Editar nivel de una NC de hace 2 meses | Período marcado afectado; snapshot oficial no cambia sin aprobación |
| Duplicados | Par NP+operador+fecha duplicado | Listado en revisión, no doble penalización sin confirmación |
| Anulados | NC con `eliminado=1` | Excluida |
| Máquinas compartidas/varias | OF en 2 máquinas | Atribución por máquina de la sesión |
| Mes sin producción | Operador sin sesiones | "No evaluable", sin porcentaje |
| Sin clasificación | NC con nivel vacío | No suma; cuenta en "pendientes" |
| Datos insuficientes | Operador con < mínimo | Estado "Datos insuficientes" |
| Rendimiento | Consulta de ranking mensual | p95 < 1 s sobre `eval_*`; sync nocturno < 15 min |
| Seguridad | Usuario sin permiso, intento de VER→escribir | 403; sin PII en logs |
| Compatibilidad | Regresión de NC, Trazabilidad, Despachos | Sin diferencias |
