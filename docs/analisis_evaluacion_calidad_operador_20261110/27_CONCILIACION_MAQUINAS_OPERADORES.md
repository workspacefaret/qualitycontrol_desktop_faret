# 27 — Conciliación de máquinas, operadores y trazabilidad Calidad ↔ FPS (10-11-2026)

Continúa la Fase 26 sin reconstruir nada. Solo lectura; sin cambios en BD, permisos, servicios ni seguridad; sin despliegue, commit ni push; sin guardar credenciales. **Toda propuesta es provisional; la responsabilidad confirmada sigue en 0** (solo Calidad puede confirmar).

## 1. Verificación del estado heredado (contra los archivos reales)
| Dato de la Fase 26 | Verificado |
|---|---|
| 7 NC de producto vigentes (12 de ámbito producto en total, 5 eliminadas o de prueba) | ✔ `nc_producto_completo.csv` |
| NC 6, 7, 14 individuales; 11–13 discrepancia; 15 sin equivalencia; 15 puntos provisionales; 0 confirmados | ✔ snapshot `auditoria_fps_f26b.json` |
| Pruebas | Python 60/60 ✔ (ejecutadas de nuevo); C# 75/75 ✔ |

## 2. Hallazgo clave: el código de producto es una llave más fuerte que el nombre del operador
La NC registra `codigo_producto` y las sesiones FPS de Pegado/Termoformado traen el **mismo código** en `ARTICULO`. Cruzarlo permite saber *quién fabricó realmente ese producto* en esa máquina, sin depender de fechas ni del nombre escrito.

| NC | Código de la NC | ¿Figura en FPS (documento)? | Quién lo fabricó en la máquina/proceso de la NC |
|---|---|---|---|
| 6, 7 (NV 3813) | …045331 | Sí, 7 sesiones en Discover Cilíndrica (Termoformado) | **Una sola persona** (la declarada por Calidad) |
| 14 (NV 3909) | …042792 | Sí, 8 sesiones en Discover Ovalado | **Dos personas** (la declarada y un operador del turno de madrugada) |
| 12 (NV 3687) | …519344 | Sí, 5 sesiones en Diana 8 (Pegado), 11–17 feb | **Una sola persona, distinta de la declarada** |
| 11, 13 (NV 3687) | …519346 | **No** figura en las sesiones del documento | — |
| 15 (NV 3760) | …520870 | **No** figura; el NV 3760 no tiene sesiones de Pegado/Diana (solo mar–abr: dimensionado, off-set, corrugado, emplacado, troquel) | — |

## 3. Capa de conciliación (motor `motor_responsabilidad.py`)
Estados por dato: **Confirmada / Probable / Discrepancia / Información insuficiente**, con procedencia (Calidad declara · FPS registra); ninguna fuente sobrescribe a la otra.

- **Producto**: si el código de la NC figura en la máquina/proceso emparejados, las sesiones elegibles se acotan a quienes fabricaron *ese* código.
- **Operador declarado**: ya no excluye por sí solo a los demás cuando el producto ya acota (NC 14: la persona declarada es una de las dos que lo fabricaron → reparto compartido provisional 2,50/2,50). Si no hay evidencia de producto y la propuesta se apoya solo en el nombre, se **indica expresamente** y la confianza baja a BAJA.
- **Estados nuevos del declarado**: `FUERA_DE_PRODUCTO` (operó la máquina pero no fabricó el código).
- **Variantes de nombre**: `VARIANTE_ORTOGRAFICA` (≥0,8 de similitud por palabra) y `APELLIDO_COINCIDE` (otro nombre de pila). **Nunca corroboran**: solo se informan.
- **Alternativa FPS**: cuando el declarado contradice a FPS, se muestra la hipótesis «si Calidad aceptara la evidencia FPS», **fuera de los totales** (`cuentaEnTotales = false`).
- **Máquina**: un nombre igual tras normalizar (p. ej. *Diana VIII* = *DIANA 8*) es **Probable** salvo que el mismo código de producto se haya fabricado en esa máquina (entonces Confirmada) o una persona valide el alias. Sin identificador común, nunca definitiva.
- Los puntos nunca superan la severidad, un operador cuenta una vez por NC, reparto en centésimas sin pérdida.

## 4. Catálogo de equivalencias de máquinas (`27_catalogo_equivalencias_maquinas.csv`)
| NC | Máquina Calidad | Máquina FPS (IdMaquina · proceso) | Estado | Evidencia |
|---|---|---|---|---|
| 12 | Diana VIII | DIANA 8 (SFM) (65 · PEGADO) | **Confirmada** | Nombre normalizado + el código de producto se fabricó ahí |
| 11, 13 | Diana VIII | DIANA 8 (SFM) (65 · PEGADO) | Probable | Nombre normalizado; producto no verificado; sin identificador común |
| 6, 7 | Discover Cilíndrica 1 | DISCOVER CILINDRICA (SFM) (93 · TERMOFORMADO) | Probable | Nombre parcial único; el producto se fabricó solo ahí |
| 14 | Discover Cónica/Ovalada | DISCOVER OVALADO (SFM) (78 · TERMOFORMADO) | Probable | Ídem |
| 15 | Diana VIII | — | No demostrada | El documento nunca usó DIANA |

**`dbo.ZZZListaMaquina`**: la cuenta `fps_historico_ro` solo ve 3 objetos (verificado en la Fase 25) y **no se puede confirmar su existencia ni permiso** sin credenciales superiores; no intenté concederlo. Preparado el mínimo para quien esté autorizado: `27b_GRANT_MINIMO_ZZZListaMaquina_NO_EJECUTADO.sql` (verifica existencia, un solo `GRANT SELECT`, verificación de que no hay INSERT, reversión). Una vez concedido: `Invoke-FpsOt.ps1 -Fase26 -ListaMaquina` descarga el catálogo. Mientras tanto se usa el catálogo anterior.

## 5. NC 11, 12 y 13 (declarado ≠ FPS)
1. **Operadores reales en las OT del documento (NV 3687, 54 sesiones, 10 OT)**: un solo operador de Pegado (Diana 8, 11–17 feb, 5 sesiones), más los de dimensionado, off-set, corrugado, emplacado y troquel.
2. **Producto**: el código de la NC 12 sí corresponde a esas sesiones de Pegado; el de las NC 11 y 13 no figura en las sesiones del documento.
3. **Variantes de nombre**: no hay ninguna variante del declarado entre los operadores del documento. Existe un operador de **Corrugado** (otro proceso, 29-ene a 3-feb) que *comparte apellido* pero tiene otro nombre de pila: se informa como posible homónimo, **sin corroborar**.
4. **Historial del declarado** (consulta previa): 160 sesiones desde el 15-05-2026 (Pegado/Diana 8 y troquel), ninguna del documento de estas NC; trabajó Diana 8 en junio con otros NP.
5. **Fechas**: la NC dice fabricación 10-mar / 31-mar; FPS registra el Pegado del documento entre el 11 y el 17 de febrero; los registros se hicieron en junio y agosto. Las fechas de la NC no tienen significado verificado, así que **no se usan para descartar**; se muestran como discrepancia.
6. **Detección vs. producción**: la NC solo tiene un campo de operador; no distingue entre el que fabricó, el que detectó y el que se declara. Es posible que Calidad haya anotado al operador habitual de la máquina o al que detectó el defecto. **No hay evidencia para afirmar un error de Calidad.**
7. **Relación documento–OT–máquina**: correcta (documento y máquina coinciden; el mapeo NV→NP Faret→OT está completo).
8. **Vacíos/cambios de identificación**: ninguno hallado en la vista (WorkOrderRecords y la vista tienen exactamente las mismas 220 sesiones; no hay eventos de turno anteriores al 05-08-2026).

Resultado: **discrepancia entre fuentes**; 0 puntos propuestos. Informativo (no suma): si Calidad aceptara la evidencia FPS, NC 12 → 1,00 al operador de Pegado del documento (producto verificado); NC 11 y 13 → 1,00 c/u con confianza baja (único operador de esa máquina/proceso, producto no verificado).

## 6. NC 15
La máquina «Diana VIII» corresponde a DIANA 8 (id 65) en FPS, pero el NV 3760 **no tiene sesiones de Pegado/Diana** (el código de producto tampoco aparece). No hay evidencia de que el defecto se originara en operadores de este documento: se conserva solo la trazabilidad contextual (15 operadores de otros procesos), **0 puntos**. La NC dice fabricación 2-jun, posterior al término de las sesiones del documento (14-abr); en esa fecha Diana 8 operó con otros NP. Pendiente (requiere credencial): buscar el código de producto y las sesiones de Diana 8 en jun en todo el historial (sección 9).

## 7. Reevaluación de NC 6, 7 y 14
| NC | Documento/OT | Máquina/proceso | Producto | Identidad del operador | Resultado |
|---|---|---|---|---|---|
| 6, 7 | ✔ | Probable (Termoformado coincide) | ✔ 7 sesiones, una sola persona | Declarado **y** producto coinciden | Individual, MEDIA (no ALTA: la máquina no tiene identificador común) |
| 14 | ✔ | Probable | ✔ 8 sesiones, **dos** personas | Declarado coincide, pero no es exclusivo | **Pasa de individual a compartido provisional** (2,50/2,50), BAJA; antes dependía solo del nombre declarado |

## 8. Cifras antes/después
| Indicador | Fase 26 | Fase 27 |
|---|---|---|
| Individuales / compartidas / sin atribución | 3 / 0 / 4 | **2 / 1 / 4** |
| Puntos provisionales | 15,00 | 15,00 (NC 14 repartido en dos personas) |
| Puntos confirmados | 0 | 0 |
| NC con producto verificado en FPS | no medido | **4 de 7** (6, 7, 12, 14) |
| NC con discrepancia declarada y registrada | 3 | 3 (11, 12, 13), ahora con alternativa informativa y posible homónimo |
| Equivalencias de máquina | 3 exactas, 3 sugeridas, 1 ninguna | **1 confirmada, 3 probables (5 NC), 1 no demostrada** (más estricto: nombre igual ya no es definitivo) |
| Pruebas Python / C# | 60 / 75 | **77 / 83** |

## 9. Interfaz (Photino)
Al abrir una NC, tabla **Comparación Calidad ↔ FPS** (Dato · Calidad declara · FPS registra · Estado · Por qué) con documento, producto, máquina, proceso y operador; chip global; avisos de «depende únicamente del nombre declarado», posibles variantes y la hipótesis informativa que no suma a los totales; luego propuesta, sesiones, participación incluido/excluido/contexto con motivo, OT y evidencia pendiente. Separadores en todas las tablas; sin desborde a 1366/1000/800 px; sin nombres propios. Validado en la ventana Photino real: 13/13.

## 10. Validaciones
Python 77/77 (nuevas: producto acota/confirma/ausente/en otra máquina; declarado corroborado/no exclusivo/solo por nombre/sin sesiones; variantes; sesiones fuera de fecha; simultáneos sin duplicar puntos; máquina ambigua; sin máquina; documento no encontrado). C# 83/83 (lectura segura de los campos nuevos, estados desconocidos, la alternativa nunca cuenta). Build Release 0 errores.

## 11. Consulta con credenciales administrativas — ejecutada y analizada
Ejecutada por una persona (solo lectura, vista de hechos, sin Rut); resultados en `C:\Users\dcarrasco\fps_historico\ot_20261110_164456\` (contienen nombres; fuera del repo). Trajo: 77 sesiones de los 3 códigos de producto en todo el historial, 61 de Diana 8 (feb–jun) y 325 de las personas con «ESPINOZA».

**Hallazgos**
1. **Los códigos de las NC 11–13 se fabricaron muchas veces en Diana 8** (…346: 42 sesiones, sep-2025 a feb-2026, NV 3463 y 3598; …344: 23 sesiones, incluidas las del NV 3687), por al menos 4 operadores. **Ninguna de esas sesiones es del operador declarado**; él opera Diana 8 desde el 15-may-2026. Entre el 18-feb y el 15-may-2026 Diana 8 solo registra una sesión de otro NP (23-mar). Las «fechas de fabricación» de marzo de la NC no coinciden con ninguna fabricación de esos códigos en FPS.
2. **Patrón consistente con «operador de turno al registrar»**: el día del registro de las NC 11 y 12 (22-jun) y de la NC 13 (6-ago), el operador declarado era quien operaba Diana 8 (OT 22401 y 22629). Es una **hipótesis no verificada**: el nombre podría ser el de quien detectó o estaba de turno, no el de quien produjo el lote. No prueba nada sobre la producción de febrero.
3. **NC 15**: el código …520870 **no se fabricó en el NV 3760**; figura en el **NV 3840 (NP 22274), Pegado/Diana 8, 6–15 jul-2026**, por el mismo operador que declaran las NC 11–13, y en nov-2026 en otro NV. La NC 15 se registró el 14-ago y no declara operador. Indicio (no confirmación) de que el NV anotado en la NC 15 podría no ser el del lote real; lo debe confirmar Calidad con el lote físico.
4. **Variantes de nombre**: las personas con «ESPINOZA» son dos: el declarado (160 sesiones) y un operador de Corrugado (165 sesiones) que comparte apellido pero no nombre. No hay variantes de escritura del declarado.
5. **Diana 8 feb–jun**: feb: dos operadores de Pegado en otros NP y el del NV 3687 (11–17 feb); mar: una sesión; may–jun: solo el declarado y una sesión suelta.
6. Sin vacíos ni cambios de identificación en la vista.

**Efecto en el motor/UI** (`--extra` en `generar_snapshot_v2.py`): nueva sección «Historial FPS fuera del documento» (otros documentos donde se fabricó el código; operadores de la máquina el día de registro; lectura prudente) y una dimensión informativa «Operador al registrar». **No cambia propuestas ni puntos**: NC 11–13 siguen en discrepancia y 0 puntos; NC 15 sigue en contexto y 0 puntos.

## 12. Decisiones pendientes de Calidad
1. ¿Qué significa el operador de la NC (quien fabricó, quien detectó, quien se declara)? Hoy no se puede distinguir.
2. NC 14: ¿se acepta el reparto compartido provisional con quien fabricó el mismo código?
3. NC 11–13: ¿prevalece lo declarado o lo registrado por FPS? Hay indicio de que el nombre sea el del operador de turno al registrar; no se confirma nada sin su decisión.
5. NC 15: confirmar con el lote físico si corresponde al NV 3760 o al NV 3840.
4. Validar equivalencias de máquina (o conceder lectura de `ZZZListaMaquina`).
