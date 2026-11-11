# 26 — Replanteamiento del cruce Calidad ↔ FPS (10-11-2026)

Cambio de enfoque: **la falta de una fecha o turno exacto del defecto no bloquea la trazabilidad**. Las fechas de la NC dejan de usarse para descartar operadores; el cruce se apoya en documento → OT → máquina/proceso → sesiones, y todo lo que no se pueda sostener se muestra como contexto o contradicción, sin inventar nada ni pedir campos nuevos a Calidad. Solo lectura; sin cambios en BD, permisos ni servicios; sin despliegue, commit ni push.

## 1. Qué cambió en el motor (`motor_responsabilidad.py`)
| Antes (fase 25) | Ahora (fase 26) |
|---|---|
| Si la fecha de la NC caía en sesiones de la máquina, solo esas sesiones eran elegibles (suponía que la fecha era de fabricación) | **Las fechas de la NC no acotan** (`FECHAS_NC_VERIFICADAS = False`: su significado no está verificado). Si algún día se verifica, el mismo motor las usa (`fechas_verificadas=True`) |
| Fecha fuera de las sesiones = «horario no fiable» | Se muestra como **contradicción** (p. ej. «fecha 2026-03-31 fuera del período en que FPS fabricó en esa máquina, 11-17 feb; no se usa para descartar operadores») |
| Alias sugerido solo como bandera | **Estado de equivalencia explícito**: EXACTA / VALIDADA (alias de una persona) / SUGERIDA (no validada, confianza máx. BAJA) / NINGUNA, con la máquina de Calidad, la de FPS y el porqué |
| Operadores propuestos y el resto «contexto» | **Cada operador del documento queda Incluido / Excluido / Contexto con el motivo escrito** (misma máquina y proceso; solo operó otra máquina; sin máquina identificable) |
| Sin máquina: sin propuesta | Igual (sin puntos), pero **todos los operadores y OT se muestran como trazabilidad contextual** |
| Documento = sesiones etiquetadas con la NV | Documento = NV **+ sesiones del mismo NP Faret** (vía `ZZZMasterOT`) que FPS no etiquetó con la NV (`--raw/--master` y `Invoke-FpsOt.ps1 -Fase26`; ver sección 5) |

Se mantienen: reparto equitativo en centésimas sin pérdida; un operador cuenta una vez por NC; nunca más puntos que la severidad; NC eliminada/rectificada en revisión; participación, responsabilidad propuesta y confirmada como **tres indicadores independientes** (confirmada = 0).

## 2. Resultado por NC (comparación fase 25 → fase 26)
| NC | Documento (NV → NP Faret) · OT | Máquina de Calidad ↔ FPS | Operadores incluidos / excluidos | Propuesta | Puntos | Cambio |
|---|---|---|---|---|---|---|
| 11, 12, 13 (Menor) | 3687 → 21808 · 10 OT | «Diana VIII» ↔ DIANA 8 (SFM), proceso PEGADO · **EXACTA** | 1 / 10 | Individual (media) | 1,00 c/u | Igual; el motivo ya no depende de la fecha: contradicción mostrada (NC 83/104/128 días antes del registro, fuera de feb) |
| 6 (Mayor) | 3813 → 22194 · 10 OT | «Discover Cilíndrica 1» ↔ DISCOVER CILINDRICA (SFM), TERMOFORMADO · **SUGERIDA** | 3 / 8 | Compartida provisional (baja) | 5,00 (1,67/1,67/1,66) | Igual |
| 7 (Mayor) | 3813 → 22194 | idem · SUGERIDA | 3 / 8 | Compartida provisional (baja) | 5,00 | Igual (antes la fecha era solo «fuera de sesiones») |
| 14 (Mayor) | 3909 → 22522 · 9 OT | «Discover Cónica/Ovalada» ↔ DISCOVER OVALADO (SFM) · **SUGERIDA** | 3 / 7 | Compartida provisional (baja) | 5,00 | Igual; contradicción: fecha de fabricación (31-jul) posterior a su propio registro (21-jul) |
| 15 (Menor) | 3760 → 22021 · 14 OT | «Diana VIII»: el NV nunca usó DIANA · **NINGUNA** | 0 incluidos, 15 **contexto** | Trazabilidad contextual, sin puntos | 0,00 | Igual: no se reparten puntos entre máquinas ajenas |

Totales: 3 individuales, 3 compartidas, 1 contextual; **18,00 puntos provisionales; 0 confirmados**. Las cifras de puntos no cambian respecto a la fase 25 porque en esa fase la fecha ya no estaba acotando en ninguna NC; lo que cambia es la **justificación** (ya no depende de fechas no verificadas) y la **visibilidad** (cada operador incluido/excluido con su motivo, equivalencia y contradicciones). Si en el futuro se verificaran las fechas, el motor las usaría solo para acotar y quedaría documentado.

## 3. ¿Puede `dbo.ZZZListaMaquina` resolver las equivalencias pendientes?
Probablemente **parcialmente**. Documentado (docs 01/02): `aplatz_id` = `WorkOrderRecords.ResourceKey`, más `NombreCorto`; 99 máquinas, y **FPS no tiene código QR** (el QR es de la tabla `maquinas` de Calidad), por lo que no existe una llave común. La tabla sirve para confirmar **nombres alternativos/cortos** de una misma máquina (p. ej. si «Discover Cilíndrica 1» corresponde a «DISCOVER CILINDRICA (SFM)» o a un `NombreCorto`), pero no garantiza el vínculo con el registro de Calidad. **Sin ese permiso** el motor ya cubre 6 de 7 NC (3 exactas + 3 sugeridas con confianza limitada); con él se podría subir las 3 sugeridas a «validadas». **El permiso no se da por concedido** (el GRANT sigue como propuesta no ejecutada, `25b_...sql`). La equivalencia se revisa hoy con un archivo local de alias (`--alias`: `nc_maquina, fps_maquina, validado`); solo se aplican filas con `validado=SI`.

## 4. Modelo de la NC y OT históricas
- La extracción anterior leyó solo 10 columnas de `no_conformidades` (id, ámbito, empresa, eliminado, np_nv, máquina, fechas, nivel, operador). **Para no presuponer qué campos existen** se preparó `Invoke-FpsOt.ps1 -Fase26`, que descarga el **esquema completo** y **todas las columnas** de las NC de producto (con `qcc_audit_ro`) y las sesiones del **mismo NP Faret** (NP 21808, 22021, 22194, 22522) para hallar OT no etiquetadas con la NV. Pendiente de ejecutar por una persona (credencial interactiva); el motor ya integra su resultado con `--fps ..._npfaret.csv`.
- OT ya identificadas por NV: 43 (10, 10, 10, 9, 14 por NC/NV según la tabla); 220 sesiones; 28 operadores; 14 recursos.

## 5. Interfaz
Detalle de cada NC: documento y NP Faret; **equivalencia de máquina** (chip + Calidad ↔ FPS + explicación); **contradicciones/avisos**; propuesta con operadores y sesiones (inicio setup/producción/término, cantidad, cierre, sesión larga, editada por otro usuario); **tabla de participación con Incluido/Excluido/Contexto y el motivo**; OT del documento; criterio aplicado y evidencia que falta (redactada sin exigir campos nuevos a Calidad); indicadores A/B/C. Separadores de columna en todas las tablas.

## 6. Pruebas
| Suite | Resultado |
|---|---|
| Python (analizador + motor) | **55/55** (nuevas: fechas no verificadas no descartan, contradicción en vez de descarte, incluidos/excluidos con motivo, sin máquina = solo contexto, estados de equivalencia) |
| Backend C# | **72/72** (nuevas: estado de equivalencia desconocido → NINGUNA, estado de participante desconocido → CONTEXTO, contradicciones, flag de fechas) |
| Build Release | 0 errores |
| Ventana Photino real (CDP, snapshot real fase 26) | 11/11: 7 NC, escenarios, detalle con equivalencia «Sugerida (no validada)», tabla de participación Incluido/Excluido, reparto 1,67/1,67/1,66, separadores, sin nombres, sin desborde a 1366/1000/800 px, sin errores JS |

## 7. Recomendaciones separadas para futuras NC (no son requisito)
Capturar máquina y operador por catálogo común con FPS (`IdMaquina`/`ResourceKey`), y fecha del defecto separada de la de registro. Mejoran la precisión futura; el cruce actual no depende de ellas.

## 8. Pendientes
1. Ejecutar la extracción `-Fase26` (modelo completo de la NC + NP Faret) y reevaluar; el motor ya está preparado.
2. Aplicar (o no) `GRANT SELECT` sobre `dbo.ZZZListaMaquina` si se quiere validar las 3 equivalencias sugeridas.
3. Calidad decide si acepta el reparto equitativo provisional y la validación formal; sin su decisión, responsabilidad confirmada = 0.

## 9. Actualización final Fase 26 — modelo real de la NC, operador declarado y NP Faret

**Extracción `-Fase26` ejecutada** (credencial interactiva, cuentas de solo lectura): esquema completo de `no_conformidades` (58 columnas, 12 NC de producto, 7 vigentes) y sesiones por NP Faret (NP 21808, 22021, 22194, 22522): **220 sesiones, 0 OT adicionales** → el etiquetado por NV ya cubría todo el documento. No faltaban OT; la mejora viene de otras fuentes.

**Nuevo criterio: operador declarado por Calidad (`operador`) + proceso (`area`).** Si el operador escrito en la NC (≥2 palabras, no genérico ni múltiple) figura en FPS en la máquina/proceso emparejados, se incluye solo a esa persona (estado «Corroborado por FPS», confianza media, también con equivalencia sugerida). Si no figura o operó otra máquina, es una **contradicción**: no se atribuye a nadie y todos pasan a contexto. Las fechas siguen sin usarse.

| NC | Declarado | Proceso NC vs FPS | Propuesta | Puntos (fase 25 → 26) |
|---|---|---|---|---|
| 6, 7 (NV 3813) | Corroborado (Termoformado) | Coincide | Individual, media | 5,00 compartido entre 3 → **5,00 a 1 operador** |
| 14 (NV 3909) | Corroborado (Termoformado) | Coincide | Individual, media | 5,00 compartido entre 3 → **5,00 a 1 operador** |
| 11, 12, 13 (NV 3687) | **No figura en FPS** (el único de Pegado es otra persona) | Pegado/Diana: coincide con máquina | Sin atribución; contradicción, 1 en contexto | 1,00 c/u individual → **0,00** |
| 15 (NV 3760) | Sin declarar | NV nunca usó Pegado/Diana | Contexto (15 operadores) | 0,00 |

Escenarios: 3 individuales, 0 compartidos, 4 sin atribución. **15,00 puntos provisionales; 0 confirmados** (antes 18,00). Cambio de fondo: las NC 11–13 dejaron de asignarse a un operador solo por ser el único de Pegado, porque Calidad declaró a otra persona que FPS no registra.

**Pendiente de verificar:** si el operador declarado en NC 11–13 aparece en FPS en otras NV (modo nuevo `operador_sesiones`: `Invoke-FpsOt.ps1 -Fase26 -ArchivoNpFaret <lista> -Operadores '<nombre>'`; solo vista de hechos, sin Rut). Debe ejecutarlo una persona y revisar el script antes (política Kaspersky).

**Implementación:** motor (`declarado`, `procesoNc`, `procesoCoincide`), lector C# con listas blancas (`CORROBORADO/NO_ENCONTRADO/FUERA_DE_MAQUINA/AMBIGUO`; el nombre nunca sale), interfaz con bloque «Operador declarado y proceso».
**Pruebas:** Python 60/60; C# 75/75; build Release 0 errores; ventana Photino real: 7 NC, bloque de declarado «Corroborado por FPS», separadores, sin nombres, sin desborde a 1366/1000/800, sin errores JS (las dos comprobaciones antiguas de reparto 1,67/1,67/1,66 ya no aplican: no quedan NC compartidas).

**Decisiones pendientes de Calidad:** (1) si el operador declarado en la NC debe mandar sobre la participación por máquina; (2) validar las 3 equivalencias sugeridas; (3) aceptar o no las propuestas provisionales. `ZZZListaMaquina` sigue sin concederse (GRANT no ejecutado). Sin commit, push, despliegue ni cambios en BD/permisos/servicios.

## 10. Verificación del operador declarado en NC 11–13 (consulta `operador_sesiones`, 10-11-2026)
El operador declarado **sí existe en FPS** (160 sesiones, 15-05-2026 → 10-11-2026): 101 en PEGADO / DIANA 8 y 59 en TROQUEL (BOBST). Pero **su primera sesión es del 15-05-2026 y ninguna pertenece a las NV de las NC (3687, 3760, 3813, 3909)**. Conclusión: la contradicción se mantiene (no figura en el documento de las NC 11–13), pero ahora con una explicación plausible, no verificada: la NC pudo referirse a un operador habitual de esa máquina y no al que fabricó ese lote (feb-2026, anterior a su historial en FPS). Por eso **no se le atribuye** nada; las NC 11–13 siguen sin atribución (0 puntos) con contexto. Decisión pendiente de Calidad: confirmar con quién operó Diana VIII en esa fecha. Resultados completos (con nombres) en `C:\Users\dcarrasco\fps_historico\ot_20261110_163024\`.
