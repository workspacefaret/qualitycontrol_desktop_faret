# 25 — OT, sesiones y responsabilidad propuesta con las tablas autorizadas (10-11-2026)

Distinción obligatoria: **participación** (estuvo en el documento/máquina) ≠ **responsabilidad propuesta** (reparto provisional del motor) ≠ **responsabilidad confirmada** (solo la decide Calidad; hoy **0**). Ninguna coincidencia horaria se trata como culpabilidad. Solo lectura con `fps_historico_ro` por Kerberos (el usuario ejecutó el comando e ingresó la credencial); sin cambios en BD, permisos ni servicios; sin despliegue, commit ni push. CSV reales fuera del repo: `C:\Users\dcarrasco\fps_historico\ot_20261110_155600` (con nombres/IDs; no se versionan).

## 1. Qué contienen las dos tablas (verificado)
| Tabla | Filas totales | Recuperadas | Clave / contenido |
|---|---|---|---|
| `dbo.WorkOrderRecords` | 122.251 | **220** (43 OT de las 7 NC) | `WorkOrderKey` = OT de la vista; `RecordKey` = `ID` de la vista; `UserKey` (28 usuarios), `ResourceKey` (14 recursos), `SetupStartDate`, `ProductionStartDate`, `ProductionEndDate`, cantidades, `Comments`, `UpdateUserKey`, `CloseReason*`, microparadas |
| `dbo.ZZZMasterOT` | 8.931 | **4** | `OrdenTrabajo` = NP Faret, `NotaVentaInnpack` = NV Innpack, `EstadoDocumento`, `FechaIngreso/Entrega` |

- **¿Por qué `ZZZMasterOT` devuelve 4 filas?** Es un registro por documento (una fila por NV/NP), no por OT. Las 7 NC corresponden a **4 NV distintas** (3687, 3760, 3813, 3909) → 4 filas. **Cobertura completa: 4/4 NV (7/7 NC) están en el maestro**, mapeadas a NP Faret 21808, 22021, 22194 y 22522.
- **Las 220 filas de `WorkOrderRecords` son exactamente las mismas 220 sesiones de la vista** (220/220 `RecordKey`=`ID`; OT, cantidad, inicio=`SetupStartDate` y término=`ProductionEndDate` idénticos). La tabla cruda **no trae sesiones, turnos ni eventos nuevos**; `Online`=False y `Status`=True en todas; **microparadas: 0** en todas.
- **Información realmente nueva:** el inicio real de producción (separado del setup), el motivo de cierre (111 «PRODUCCIÓN PARCIAL», 18 «TERMINADA», 3 «LEVANTAMIENTO», 88 sin dato), 72 sesiones con comentario, **58 sesiones cuyo registro fue editado por un usuario distinto del operador** (`UpdateUserKey ≠ UserKey`), duración máxima de sesión 125 h (mediana 6,4 h).
- **Ventanas de trabajo:** cada sesión tiene inicio y término exactos, pero **no es el turno**: se abre en el cambio de turno u OT y puede quedar abierta días. Se adoptó una regla: una sesión de más de **16 h** no sirve para ubicar un defecto en el tiempo (se muestra marcada «sesión larga»).
- Mapeo `UserKey`↔nombre en la vista: 1 a 1 (28 de 28).

### Cobertura de datos (verificada sobre los CSV)
| Indicador | Resultado |
|---|---|
| OT pedidas / encontradas en `WorkOrderRecords` | **43 / 43** |
| Operadores distintos en esas OT | **28** (14 recursos/máquinas) |
| Sesiones con inicio y término válidos (término ≥ inicio, producción dentro de la ventana) | **220 / 220**; de ellas **209 ≤ 16 h** (utilizables para ubicar un defecto) y **11 > 16 h** (válidas pero no fiables como ventana) |
| NC relacionables con una máquina | **6 / 7** (3 por nombre exacto, 3 por equivalencia sugerida no validada; la NC 15 no) |
| NC con propuesta individual / compartida / sin atribución | **3 / 3 / 1** |
| Otra fuente que complete relaciones | `ZZZMasterOT` ya cubre los 4 NV (una fila por documento); la relación faltante no es documento→OT sino **defecto→turno/hora**, que ninguna de las dos tablas contiene. Se está catalogando el resto de FPS (ver sección 8) |

## 2. Cruce por NC (cifras verificables)
| NC | Nivel | NV → NP Faret | OT del NV | Sesiones del NV | Participantes del NV | Máquina/proceso emparejado | Horario fiable | Escenario · confianza | Operadores propuestos (sesiones · OT) | Puntos propuestos |
|---|---|---|---|---|---|---|---|---|---|---|
| 11 | Menor | 3687 → 21808 | 10 | 54 | 11 | DIANA 8 / PEGADO (exacto) | no (fecha 83 d antes del registro, fuera de sesiones) | 1 · media | 1 (5 · 1) | **1,00** |
| 12 | Menor | 3687 → 21808 | 10 | 54 | 11 | DIANA 8 / PEGADO | no (104 d) | 1 · media | 1 (5 · 1) | **1,00** |
| 13 | Menor | 3687 → 21808 | 10 | 54 | 11 | DIANA 8 / PEGADO | no (128 d) | 1 · media | 1 (5 · 1) | **1,00** |
| 6 | Mayor | 3813 → 22194 | 10 | 38 | 11 | Cilíndrica / TERMOFORMADO (**equivalencia sugerida, no validada**) | no (sin fecha) | 3 · baja | 3 (21 · 3) | **5,00** (1,67/1,67/1,66) |
| 7 | Mayor | 3813 → 22194 | 10 | 38 | 11 | Cilíndrica / TERMOFORMADO (sugerida) | no (fecha no cae en sesiones) | 3 · baja | 3 (21 · 3) | **5,00** (1,67/1,67/1,66) |
| 14 | Mayor | 3909 → 22522 | 9 | 59 | 10 | Ovalado / TERMOFORMADO (sugerida) | no (fecha 10 d **posterior** a su registro: incoherente) | 3 · baja | 3 (46 · 4) | **5,00** (1,67/1,67/1,66) |
| 15 | Menor | 3760 → 22021 | 14 | 69 | 15 | **ninguno**: el NV no usó DIANA | no | 4 · sin evidencia | 0 | **0,00** |

Totales: **43 OT, 220 sesiones, 28 operadores distintos** en los 4 NV; **3 propuestas individuales, 3 compartidas, 1 sin atribución; 18,00 puntos provisionales distribuidos** (3 + 15), **0 confirmados**.

## 3. Reevaluación (antes → después)
| | Fase 24 | Fase 25 |
|---|---|---|
| Individuales | 3 (NC 11-13) | **3** (NC 11-13, **se mantienen**, pero siguen con fecha no fiable → confianza media) |
| Compartidas | 0 | **3** (NC 6, 7, 14) |
| Sin atribución | 4 | **1** (NC 15) |
| Máquina emparejada | 3/7 | 6/7 (3 exactas + 3 por equivalencia sugerida) |
| Horario fiable | 0/7 | 0/7 |
| Confirmadas | 0 | **0** |

Motivos: (a) las 3 NC individuales se mantienen porque el único operador de DIANA 8 en ese NV sigue siendo el mismo (1 proceso: PEGADO, 1 OT); (b) las NC 6, 7 y 14 pasaron a compartidas por una regla nueva de **equivalencia sugerida** de nombre de máquina: todas las palabras del nombre de Calidad (sin números; «A/B» = A o B) deben aparecer en una única máquina FPS del documento, y la confianza queda limitada a BAJA hasta que Producción/Calidad la valide («Discover Cilíndrica 1» ↔ DISCOVER CILINDRICA, «Cónica/Ovalada» ↔ DISCOVER OVALADO; el «1» de Calidad no se puede confirmar); (c) la NC 15 sigue sin evidencia porque DIANA no participó en el NV 3760; sus 15 participantes quedan solo como contexto; (d) la NC 14 deja de contar con ventana fiable por una regla nueva: **fecha de fabricación posterior al registro de la propia NC = dato incoherente**.

Seguridad: no se reparte entre operadores de máquinas o procesos no relacionados (solo participan los de la máquina+proceso emparejado); cada operador cuenta una vez por NC aunque tenga varias sesiones/OT (NC 14: 46 sesiones, 4 OT, 3 operadores → 3 cuotas); una NC nunca supera sus puntos de severidad.

## 4. Cambios implementados
- `motor_responsabilidad.py`: `alias_sugerido`, sesiones largas, regla de fecha incoherente, detalle de sesiones por operador, `enriquecer_con_raw` (no agrega sesiones, solo datos).
- `analizar_cruce.py`: la sesión ahora incluye proceso, horas de setup/producción y observaciones.
- `generar_snapshot_v2.py` (`--raw`, `--master`): agrega documento (NP Faret, estado, ingreso/entrega), detalle por OT, sesiones por operador.
- `fps_historico_remoto.ps1` / `Invoke-FpsOt.ps1`: modos de solo lectura `esquema_ot` y `tabla_ot` (tablas permitidas fijas, columna validada contra `INFORMATION_SCHEMA`, valores solo dígitos, guarda SELECT-only, sin `Rut`/claves).
- `EvaluacionOperadoresAuditoria.cs`: lee los campos nuevos acotados; descarta el resto (cliente/nombres).
- UI: el detalle de NC muestra NP Faret y estado del documento, aviso de alias sugerido, tabla de sesiones propuestas (inicio setup/producción/término, cantidad, cierre, «sesión larga», «editada por otro usuario», «con comentario») y tabla de las OT del documento.

## 5. Pruebas
| Suite | Resultado |
|---|---|
| Python (analizador + motor) | **50/50** (nuevos: alias sugerido y validado, ambigüedad, alternativas «A/B», sesión larga, fecha posterior al registro, enriquecimiento) |
| Backend C# | **68/68** (3 nuevas: campos de la fase 25, banderas de sesión, descarte de campos no previstos) |
| Build Release | 0 errores |
| Ventana Photino real (CDP, snapshot real de la fase 25) | 10/11 + 1 falso fallo: 7 NC, escenarios 1/3/4, detalle NC 7 con alias sugerido/sesiones/OT/NP Faret, reparto 1,67-1,67-1,66, tablas con separadores, sin desborde a 1366/1000/800 px, sin errores JS. El único «fallo» (nombres) viene del stub sintético del módulo principal; el snapshot real tiene 0 nombres |

## 6. Decisiones pendientes de Calidad
1. Validar o rechazar las equivalencias sugeridas de máquina (Cilíndrica 1, Cónica/Ovalada); sin validar, NC 6, 7 y 14 quedan en confianza baja.
2. Confirmar que `fecha_fabricacion` es fecha de detección, y definir un campo de fecha/turno del defecto (el único modo de lograr horario fiable).
3. Decidir si se acepta el reparto equitativo entre todos los operadores de la máquina cuando no hay horario fiable (hoy 18 puntos provisionales, ninguno confirmado) y si el límite de sesión larga (16 h) es adecuado.
4. Revisar las 58 sesiones editadas por otro usuario (¿correcciones de supervisores?) antes de usarlas como evidencia.
5. Dónde se guarda la decisión de Calidad (indicador C) y cómo se distribuye el snapshot.

## 7. Otras tablas (ver también la sección 8)
No se requieren permisos adicionales para lo logrado. Para ubicar el defecto por turno haría falta, si existe, una tabla de turnos/asignación de personal o de eventos de máquina (microparadas están en 0 en `WorkOrderRecords`); aún no está identificada, y se pedirá solo tras confirmar con Producción cuál es.

## 8. Catálogo de FPS y fuentes adicionales (verificado 10-11-2026)
Se ejecutó el modo de solo metadatos (`sys.objects`/`sys.columns`) con `fps_historico_ro`: **solo ve 3 objetos** (`dbo.WorkOrderRecords`, `dbo.ZZZMasterOT`, `plan.vw_FactProduccion`), porque una cuenta SQL solo ve el catálogo de lo que ya tiene permiso. Por eso las otras fuentes se identifican por la documentación del sistema (docs 01, 02 y 20), no por el catálogo. Las 11 columnas candidatas visibles (`ResourceKey`, `MicroparadaCount/Minutes`, usuarios del maestro, `OPERADOR`, `MAQUINA`, `IdMaquina`) ya están usadas.

| Objeto | Para qué | ¿Resuelve las 7 NC? | Decisión |
|---|---|---|---|
| `dbo.ZZZListaMaquina` (`aplatz_id` = `ResourceKey`, `NombreCorto`) | Validar la equivalencia máquina Calidad ↔ FPS con identificador, no solo por texto | **Sí, es la que más ayuda** (NC 6, 7, 14 y 15) | Solicitar |
| `dbo.ZZZSesionEventos` (turno real LOGIN/LOGOUT) | Ubicar el defecto por turno real | **No**: existe solo desde 2026-08-05 y las 7 NC se fabricaron entre enero y julio | Opcional, para NC futuras |
| `dbo.ZZZUsuarios` | ID de operador ↔ RUT | No (contiene RUT; el nombre ya llega por la vista) | No solicitar |
| `ZZZProcesosWeb`/`ZZZProcesosProductivos` | Proceso | No (la vista ya trae `Proceso`) | No solicitar |

Conclusión técnica: con los permisos actuales ya se agotó lo resoluble; **ninguna fuente de FPS permite ubicar por turno el defecto de las 7 NC actuales**. Lo que las resolvería es un dato de Calidad (fecha/turno real del defecto), no un permiso más.

Script propuesto (solo `GRANT SELECT` por objeto, con verificación y reversión, **no ejecutado**): `25b_PERMISOS_ADICIONALES_PROPUESTA_NO_EJECUTADO.sql`.
