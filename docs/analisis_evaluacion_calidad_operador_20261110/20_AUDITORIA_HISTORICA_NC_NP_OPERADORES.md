# 20 — Auditoría histórica NC / NP / operadores (INNPACK y Faret) — 10-11-2026

**Estado: investigación de fuentes COMPLETA; medición de cobertura PENDIENTE de una cuenta de lectura autorizada.**
Sin cambios en SQL/API/MCP, sin despliegue, sin commits. Instalador 1.8.29 intacto. No se amplió el módulo: ver "Decisión".

## 1. Matriz por fuente

| Fuente | Dónde | Acceso hoy | Período | Campos útiles | Relación verificada (código/docs) | Cobertura de atribución | Limitaciones |
|---|---|---|---|---|---|---|---|
| NC producto INNPACK | `calidad_db.dbo.no_conformidades` (`ambito=PRODUCTO`) | `qcc_audit_ro` (medido) | 7 activas; sin NC en oct-2026 | `np_nv`, `operador`, `maquina`, `fecha_fabricacion`, `nivel` | Es la fuente del módulo | 5/7 evaluables | Operador y máquina son **texto libre**; sin vínculo a empleado |
| NC internas INNPACK | misma tabla, `ambito=INTERNA` | `qcc_audit_ro` (medido) | 183 activas (36 INNPACK) | `np_nv`, `area`, `categoria_defecto`, `proceso` (etapa) | Formulario no captura operador/máquina (`nc-internas.controller.js`) | Ninguna individual | Son desviaciones de pre-producción por **área**; no se suman a penalizaciones de producto |
| NC eliminadas | misma tabla, `eliminado=1` | `qcc_audit_ro` | — | — | La API siempre filtra `eliminado=0` | n/a | Se excluyen; solo auditables por SQL |
| Fabricación por sesión | `FPS_PRODUCCION.dbo.WorkOrderRecords` (~113.527 filas) | **No** (sin cuenta autorizada) | por medir (B1/B2) | `UserKey`, `ResourceKey`, `WorkOrderKey`, `SetupStartDate`, `ProductionEndDate`, cantidades | `UserKey→ZZZUsuarios.ID` (0 huérfanas), `ResourceKey→ZZZListaMaquina.aplatz_id` (0), `WorkOrderKey→ZZZProcesosProductivos.Id_Proceso` (142 huérfanas, 0,125 %) | por medir | Sesión = turno u OT, **no** turno real del operador; 1,45 % fechas fuera de orden; usuario vacío/`admin` en un incidente de oct-2026; solapes de sesiones |
| Vista de hechos | `[plan].vw_FactProduccion` / `vw_HistorialProduccion` | No | por medir | `NP` (= `ZZZMasterOT.NotaVentaFaret`), `OPERADOR`, `MAQUINA`, `FECHA INICIO/TERMINO` | **Llave NC↔fabricación: `np_nv` = `NotaVentaFaret`** (definición leída en `plan_kpi_vw_fact_produccion.sql`) | por medir | `INNER JOIN` con ZZZUsuarios: sesiones sin usuario no aparecen |
| Turnos reales | `dbo.ZZZSesionEventos` (login/logout) | No | desde 05-08-2026 (doc) | operador por turno real | solo máquinas con app de piso | parcial | Historia corta; no cubre antes de agosto |
| Programa de Producción (API) | `api/plan/vista-planificacion` vía API INNPACK | Sí (ya usada por Trazabilidad) | plan vigente | NP, procesos, máquina planificada | Sin operador | Ninguna | Es planificación, no ejecución |
| Faret PNC | `importacion_pnc` (MySQL .70, API qualitycontrolfaret) | Solo con login Faret (no disponible) | por medir | `np_nv`, `area`, `maquina`, `operador`, `supervisor`, `fecha_fabricacion`, `nivel` | Mismo formato de campos que INNPACK (texto libre) | por medir | Empresa **separada**: no cruzar con FPS INNPACK sin confirmar que el NP Faret pertenece al mismo ERP |
| Faret gestión NC | `nc_no_conformidades` (mejora_continua) | Solo API Faret | — | vínculo `sistemaOrigen/origenId` | Gestión, no fabricación | Ninguna | No trae operador |
| Laboratorio / Trazabilidad | `muestra_laboratorio`, `registro_paletizado` | Parcial | — | NP, lote, etapa | NP sí; **operador no** | Ninguna | No aportan atribución individual |

## 2. Modelo de relación y niveles de confianza

`NC.np_nv → ZZZMasterOT.NotaVentaFaret → vw_FactProduccion (sesiones del NP) → MAQUINA + [FECHA INICIO, FECHA TERMINO] → OPERADOR`

- **Confirmada**: NP existe en fabricación **y** la máquina de la NC coincide **y** `fecha_fabricacion` cae dentro de la ventana de **una sola** sesión (un solo operador FPS) **y** ese operador coincide con el de la NC (o la NC no lo trae y la ventana es inequívoca). Única categoría que puede penalizar a una persona.
- **Probable**: NP + máquina o NP + fecha coinciden, pero hay varios operadores/sesiones o falta un dato. Solo contexto (historial por NP, operadores asociados), **sin puntos personales**.
- **No atribuible**: NP inexistente en fabricación, sin máquina/fecha, o usuario genérico/vacío. Solo conteo de cobertura.
- Un match por NP solo **nunca** prueba responsabilidad individual (varios operadores y turnos por NP). Varios operadores en la ventana ⇒ Probable; **nunca** se repite el mismo punto por operador.

## 3. Respuestas a las 6 preguntas (con lo comprobado)

1. **¿Cuántas NC históricas existen?** Comprobado: 7 NC de producto activas (INNPACK, `empresa` NULL) y 183 internas activas (36 INNPACK). Eliminadas y Faret: sin medir (sin acceso autorizado a esos datos).
2. **¿Cuántas vinculan a NP?** No medido para el universo completo; de las 7 de producto, el campo `np_nv` existe pero su validez contra `NotaVentaFaret` no se pudo comprobar (requiere B3).
3. **¿Cuántas NP permiten recuperar operadores?** **No medible hoy**: la fuente (`WorkOrderRecords`/`vw_FactProduccion`) no es accesible con las credenciales autorizadas. Consultas B3/B4 listas.
4. **¿Cuántos meses/años usables?** NC de producto: el historial útil es corto (7 registros, ninguno en oct-2026). Fabricación FPS: la tabla tiene ~113 mil sesiones, pero su rango real no se midió (B1/B2); turnos reales solo desde 05-08-2026.
5. **¿Evaluación histórica confiable o solo descriptiva?** **Solo descriptiva.** Con 5 NC evaluables no hay base estadística y la atribución es texto libre. Aun si FPS permitiera reconstruir operadores, el resultado sería "Confirmada/Probable" por NC, no una calificación.
6. **¿Qué falta?** (a) Cuenta de lectura autorizada a FPS_PRODUCCION para ejecutar B1–B4; (b) sesión Faret autorizada para medir `importacion_pnc`; (c) decisión de Calidad: criterio de atribución, tratamiento de NC internas y pesos; (d) confirmar si 7 NC es el volumen real o subregistro.

## 4. Decisión sobre extender el módulo

**No se implementa la extensión** (historial por NP, NC por operador/máquina con fabricación, penalización solo confirmada): la relación está verificada **en código**, pero **ninguna cifra de cobertura** pudo medirse con acceso autorizado, y no hay dato que valide la atribución. Implementar ahora produciría una vista sin base real. Queda listo: llave de relación, reglas de confianza y consultas `21_consultas_cobertura_historica_SOLO_LECTURA.sql`. Cuando se ejecuten B3/B4 se decide con números; las pruebas requeridas (NP duplicado, varios operadores, sin fecha, cruce entre empresas, atribución ambigua) están definidas por las reglas de la sección 2.

## 5. Próximo paso (una persona con acceso)

Ejecutar las partes A y B del `.sql` con las cuentas autorizadas correspondientes (sin `CONEXIONFPS`/`pblectura`), guardar los CSV **fuera de Git**, y compartir los conteos para definir la extensión.
