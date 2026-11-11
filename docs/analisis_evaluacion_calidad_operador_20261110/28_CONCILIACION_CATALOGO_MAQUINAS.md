# 28 — Conciliación con el catálogo real de máquinas (10-11-2026)

Continúa la Fase 27. Con el `GRANT SELECT` ya concedido por una persona autorizada sobre `dbo.ZZZListaMaquina`, se leyó el catálogo real (consulta ejecutada por el usuario con su credencial interactiva; solo lectura, sin Rut, sin guardar credenciales). Sin cambios en BD, permisos ni servicios; sin despliegue, commit ni push. **Toda propuesta sigue provisional; responsabilidad confirmada = 0.**

## 1. El catálogo
99 máquinas (`aplatz_id`, `bez` = nombre, `gruppe` = proceso, `Active`, `NombreCorto`, horarios…). Resultados en `C:\Users\dcarrasco\fps_historico\ot_20261110_165629\lista_maquina.csv` (nombres de máquina, sin datos personales).

**Vínculo por identificador verificado:** las 14 `IdMaquina` distintas de las 220 sesiones del análisis existen en el catálogo y su nombre (`bez`) coincide exactamente con el `MAQUINA` de la sesión. Es decir, `aplatz_id` = `IdMaquina` = `ResourceKey`: el lado FPS queda identificado sin ambigüedad.

**Lo que el catálogo no tiene:** ninguna columna de QR ni código de Calidad. El vínculo con el nombre escrito en la NC sigue siendo por nombre, pero ahora se busca contra **las 99 máquinas** (no solo las del documento) y dentro del mismo proceso (`gruppe`).

## 2. Equivalencias Calidad ↔ catálogo FPS
| Máquina en Calidad | Máquina FPS (id · proceso) | Estado | Por qué |
|---|---|---|---|
| Diana VIII (NC 11, 12, 13, 15) | DIANA 8 (SFM) (65 · PEGADO) | **Nombre exacto** (único en Pegado) | VIII = 8; en Pegado hay, entre otras, DIANA PRO 1/2/3, 3, 4, 5, 6, 7, EXPERFOLD y 8 (SFM): solo una calza con «8» |
| Discover Cilíndrica 1 (NC 6, 7) | DISCOVER CILINDRICA (SFM) (93 · TERMOFORMADO) | **Única en catálogo** | Es la única «Cilíndrica» de todo el catálogo; el «1» del nombre de Calidad **no tiene equivalente en FPS** (solo hay una) |
| Discover Cónica/Ovalada (NC 14) | DISCOVER OVALADO (SFM) (78 · TERMOFORMADO) | **Única en catálogo** | «A/B» = una u otra; no existe «cónica» en el catálogo |

Ninguna quedó ambigua. Una máquina confirmada por esta vía **no** equivale a un vínculo por QR: queda indicado como «catálogo FPS, única/exacta por nombre y proceso». Las dos con sufijo/alternativa son las que Calidad podría validar formalmente.

## 3. Reevaluación de las siete NC
| NC | Máquina | Documento en esa máquina | Operador | Resultado |
|---|---|---|---|---|
| 6, 7 | Confirmada (93) | Sí | Declarado y producto coinciden | Individual, MEDIA, 5,00 (sigue sin ALTA: no hay ventana horaria verificada). Conciliación global: **Confirmada** (antes Probable) |
| 14 | Confirmada (78) | Sí | Declarado + otro operador fabricaron el código | Compartido provisional 2,50/2,50, BAJA. Conciliación: **Confirmada** en los datos, pero la propuesta sigue compartida |
| 11, 12, 13 | Confirmada (65) | Sí (NV 3687 pasó por Diana 8, 11–17 feb) | Declarado no figura en FPS | Discrepancia, 0 puntos. Alternativa FPS informativa sin cambios |
| **15** | **Confirmada (65), antes «sin equivalencia»** | **No: el NV 3760 nunca pasó por Diana 8** | Sin declarar | **0 puntos.** Nueva discrepancia explícita «Documento en la máquina» |

**Lo que cambia para la NC 15:** ya no es un problema de máquina (Diana 8 está confirmada). El problema es el **documento**: el NV 3760 no tiene sesiones de Pegado; el código del producto se fabricó en Diana 8 en el **NV 3840** (6–15 jul-2026, Fase 27). Es un indicio de que el NV anotado en la NC no es el del lote; hay que confirmarlo con el lote físico. No se asigna a ningún operador.

**Lo que no cambia:** NC 11–13. El catálogo confirma que Diana 8 es la máquina correcta; la discrepancia es solo de operador (declarado ≠ quien fabricó, según FPS), con la hipótesis de «operador de turno al registrar» ya documentada. Puntos de las siete NC: 15,00 provisionales (igual), 0 confirmados.

## 4. Cifras antes/después (Fase 27 → 28)
| Indicador | Fase 27 | Fase 28 |
|---|---|---|
| Máquinas de las NC identificadas contra el catálogo real | 0 | **7 de 7 NC** (3 máquinas distintas; 0 ambiguas) |
| Equivalencias confirmadas / probables / no demostradas | 1 / 3 / 1 | **7 confirmadas (3 por nombre exacto o único en catálogo, con id) / 0 / 0** |
| NC con conciliación global «Confirmada» | 0 | **3** (6, 7, 14) |
| NC con discrepancia | 4 | 4 (11, 12, 13 por operador; 15 por documento) |
| Individuales / compartidas / sin atribución | 2 / 1 / 4 | 2 / 1 / 4 |
| Puntos provisionales / confirmados | 15,00 / 0 | 15,00 / 0 |
| Pruebas Python / C# | 77 / 83 | **84 / 87** |

## 5. Motor (`motor_responsabilidad.py`) e interfaz
- `cargar_catalogo` y `resolver_en_catalogo`: búsqueda en todo el catálogo, mismo proceso; estados `EXACTA`/`UNICA`/`AMBIGUA`/`NINGUNA`; una validación humana (`VALIDADA`) sigue prevaleciendo. Se conserva `alias_sugerido` (refactorizado en `alias_candidatos`) para cuando no hay catálogo (sin él, el comportamiento anterior no cambia: probado).
- Nuevo estado de equivalencia `CATALOGO`; la máquina pasa a **Confirmada** en la conciliación. Si el catálogo ubica la máquina pero el documento no tiene sesiones en ella: `SIN_SESIONES`, participantes en **contexto**, 0 puntos y dimensión «Documento en la máquina» = Discrepancia.
- El proceso de la NC se compara también con el proceso del catálogo cuando el documento no aporta sesiones.
- **Interfaz:** tabla **«Equivalencias de máquina verificadas con el catálogo FPS»** (Calidad · FPS · Id · Proceso · Estado · NC · Pendiente) sobre la lista de NC; en el detalle, la dimensión Máquina cita el catálogo, y «Documento en la máquina» aparece como discrepancia para la NC 15. Separadores y adaptación a 1366/1000/800 px conservados.
- `generar_snapshot_v2.py --catalogo <lista_maquina.csv>`.

## 6. Validaciones
Python 84/84 (nuevas: exacta con numeral romano, única con sufijo sin equivalente, «A/B», ambigua/ninguna, catálogo ausente sin cambios, máquina confirmada sin sesiones, proceso por catálogo). C# 87/87 (estados de catálogo/equivalencia desconocidos se normalizan, sin puntos cuando no hay sesiones). Build Release 0 errores. Ventana Photino real: 15/15 (tabla de equivalencias, NC 6 con catálogo, NC 15 con discrepancia, sin nombres propios, sin desborde, sin errores JS).

## 7. Pendiente (decisión de Calidad / evidencia)
1. Validar formalmente que «Discover Cilíndrica 1» y «Cónica/Ovalada» de su registro de máquinas son las máquinas 93 y 78 de FPS (el catálogo solo tiene una de cada tipo; el «1» no existe en FPS).
2. NC 15: confirmar con el lote físico si es NV 3760 o NV 3840.
3. NC 11–13: ¿prevalece lo declarado o lo registrado por FPS?; NC 14: ¿se acepta el reparto compartido?
4. Sin QR en FPS, cualquier vínculo futuro por identificador requeriría capturar el `IdMaquina`/`aplatz_id` en el registro de Calidad (recomendación separada, no requisito).
