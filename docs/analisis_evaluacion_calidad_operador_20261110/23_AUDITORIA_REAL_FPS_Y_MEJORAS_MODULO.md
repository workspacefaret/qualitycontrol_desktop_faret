# 23 — Auditoría real FPS ↔ Calidad y mejoras del módulo (10-11-2026)

Fuente de las cifras: ejecución real del 10-11-2026 con `tools/fps_historico` (Kerberos a SAP_NEW, `fps_historico_ro` y `qcc_audit_ro`, solo lectura). Resultados crudos en `C:\Users\dcarrasco\fps_historico\resultados_20261110_152520` (fuera del repo; contienen nombres). Sin cambios en BD, permisos, servidores ni servicios; sin despliegue, commit ni push.

## 1. Cifras reales
**Historial FPS (`[plan].[vw_FactProduccion]`)**: 2024-01-02 → 2026-11-10, **35 meses**, **71.224 sesiones**, 46–84 operadores distintos por mes. **0 sesiones sin operador, 0 con usuario genérico, 0 duplicadas** (filas = sesiones en todos los meses). Solo 8 sesiones con fechas invertidas.
**Calidad (`dbo.no_conformidades`)**: 202 filas = 11 eliminadas (excluidas) + 191 analizadas: **7 NC de producto** y **184 internas**.

| NC de producto (7) | Resultado |
|---|---|
| NP/NV presente en FPS | **7 / 7** (todas por `NVInnpack`; ninguna coincide por NP Faret) |
| Con operadores asociados al NP (participación general) | 7 / 7 (10–15 operadores distintos por NP) |
| Máquina de la NC coincide con una del NP (tras normalizar nombres) | 3 / 7 |
| Fecha de fabricación dentro del período del NP | 2 / 7 (4 fuera, 1 sin fecha) |
| Máquina y fecha coinciden en una sesión | 0 / 7 |
| **Atribución CONFIRMADA** | **0** |
| Probable (solo contexto, sin puntos) | 4 |
| No atribuible | 3 |
| Puntos penalizados a operadores | **0** |

**NC internas (184)**: 183 con NP válido, 164 presentes en FPS (llave NP Faret). Ninguna registra máquina, operador ni fecha de fabricación; mediana de 7 operadores y 5 máquinas por NP (solo 12 NP con un único operador) ⇒ **no atribuibles a personas**. No se incorporan a la evaluación de producto.

## 2. ¿Por qué `con_participantes_identificables` era 0? (limitación de datos Y del algoritmo)
1. **Algoritmo (corregido):** la primera versión usaba la llave NP, pero las NC de producto guardan el **NV Innpack** (3687, 3760, 3813, 3909), que en FPS es la columna `NVInnpack`; el NP Faret es 21582+. Con la llave correcta, 7/7 aparecen en FPS.
2. **Algoritmo (corregido):** solo contaba participantes dentro de la máquina+fecha de la NC y exigía igualdad exacta de nombres de máquina. Los nombres no coinciden entre sistemas (`Diana VIII` ↔ `DIANA 8 (SFM)`; `Discover Cilíndrica 1` ↔ `DISCOVER CILINDRICA (SFM)`; `Discover Cónica/Ovalada` ↔ `DISCOVER OVALADO (SFM)`). Ahora se normalizan sufijos entre paréntesis, acentos y números romanos (Diana → 3 NC coinciden) y se informan por separado los **operadores asociados al NP** (participación general, no atribuible).
3. **Datos (real, no corregible por código):** de las 7 NC, 4 tienen una fecha de fabricación fuera del período en que FPS fabricó ese NV (p. ej. NV 3687: FPS lo fabricó 22-ene → 17-feb-2026 y la NC dice 10/31-mar; NV 3760: FPS mar–abr y la NC dice 2-jun, en una máquina que FPS no usó), una NC no tiene fecha y 2 nombres de máquina siguen sin equivalencia automática (Cilíndrica 1, Cónica/Ovalada → requieren alias validados). Probable explicación: el campo "fecha de fabricación" de la NC se usa como fecha de detección. **Hay que confirmarlo con Calidad.**

## 3. Qué información falta para atribuir correctamente
- Operador y máquina **como selección de catálogo** (no texto libre) con el mismo código que FPS (`IdMaquina`/Rut), o un campo "sesión FPS / OT" en la NC.
- Fecha y **turno** en que ocurrió el defecto (no la de detección).
- **Proceso/etapa donde se originó** el defecto (las sesiones de un NV cubren corte, troquel, pegado… con operadores distintos).
- Tabla de **alias de máquinas** validada por Producción/Calidad (`--alias` del analizador; solo filas `validado=SI`).
- Criterio aprobado de atribución (una persona vs. equipo/turno) y tratamiento de NC con varias personas.
- Más volumen: 5 NC evaluables no sustentan estadística (umbral provisional: 30).

## 4. Cambios en el módulo Photino (solo lectura; sin API, SQL ni servicios nuevos)
- **Sin penalización personal:** etiquetas ahora dicen "Puntos de severidad (no penaliza)" y "Operador declarado en la NC (no confirmado)"; aviso fijo "Ningún operador está penalizado". Solo una atribución CONFIRMADA podría aportar puntos y hoy hay 0.
- **Sección "Auditoría histórica FPS"** (acción `evaluacionOperadores.auditoria.resumen`, lectura por sufijo): lee `%ProgramData%\QualityControlCenter\auditoria_fps.json` (snapshot agregado generado por `analizar_cruce.py --exportar-modulo`; **sin nombres de personas**, validado y acotado en backend: versión, tamaños, campos permitidos, puntos forzados a 0 si no es CONFIRMADA). Muestra cobertura FPS y, por NC de producto, los tres pasos **1 coincidencia de NP/NV → 2 participación → 3 responsabilidad**, con motivos legibles. Si el archivo no existe, el módulo funciona igual y lo indica.
- **Privacidad:** con permiso VER los operadores salen como `OP-xxxxxx` (SHA-256 con sal fija, estable); los nombres solo con EDITAR o ADMIN_TI. El filtro por operador usa el seudónimo mostrado; vacíos/genéricos/múltiples conservan su clasificación.
- Archivos: `EvaluacionOperadoresAuditoria.cs` (nuevo), `EvaluacionOperadoresHandler.cs`, `MessageRouter.cs` (1 línea), calculador (2 textos), vista/controlador/CSS del módulo. La respuesta de `resumen` ahora es `{nombresVisibles, resultado}` (el controlador acepta ambas formas).
- **Para cargar un snapshot nuevo:** correr el analizador con `--cobertura` y `--exportar-modulo` y copiar el JSON (sin nombres) a `C:\ProgramData\QualityControlCenter\auditoria_fps.json`. Hoy el archivo **no está desplegado en ProgramData**; la prueba visual lo simuló con la salida real del lector.

## 5. Pruebas ejecutadas
| Prueba | Resultado |
|---|---|
| `tools/fps_historico/tests` (analizador) | **29/29** (duplicados de sesión/NC, varios operadores, sin fecha, mismo NP en 2 empresas, ambigüedad NP/NV, alias solo validados, romanos/paréntesis, snapshot sin nombres, participar ≠ responsable) |
| `tools/evaluacion_operadores_tests` (backend) | **59/59** (43 previas + 16: seudónimos estables, nombres ausentes de la salida, filtro por seudónimo, lector de auditoría, campos no permitidos descartados, 0 puntos sin CONFIRMADA, archivo ausente/inválido, permisos de la acción nueva) |
| `dotnet build` de la app | 0 errores |
| Ventana Photino real (CDP) con el lector/calculador reales y puente simulado | 13/13 propias OK: sección visible, cobertura y cifras reales (35 meses, 71.224 sesiones, 7/7, 3/7, 2/7), 4 Probable + 3 No atribuible + 0 Confirmada, sin nombres, aviso de nombres ocultos y su desaparición con permiso, etiquetas sin "penalización", sin desborde, auditoría ausente/con error no rompe el módulo. 1 falla ajena: errores de consola "inicio: stub" por navegar a Inicio con el puente simulado (artefacto de la prueba). |

## 6. Pendiente para producción
1. **Sesión INNPACK real** para verificar con la app los datos en vivo y la ocultación del ítem/seudónimos con permisos reales (sin sesión no pude).
2. Decidir cómo se **distribuye el snapshot** (copia manual a ProgramData vs. otro canal); hoy es una carga manual periódica.
3. Calidad: confirmar el significado de `fecha_fabricacion`, validar la tabla de alias de máquinas, aprobar criterio de atribución y ponderaciones, y decidir si 7 NC es el volumen real.
4. Mejora de captura (sección 3) antes de pensar en cualquier penalización real.
5. Subir versión/instalador solo con autorización (candidata local 1.8.29 intacta; esta iteración no se empaquetó).
6. Revisión final del código nuevo y regresión manual de NC/Trazabilidad/Laboratorio.
