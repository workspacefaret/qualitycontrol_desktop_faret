# Diccionario de datos - Histórico de clasificación de pallets INNPACK

Archivo principal: `EVIDENCIAS_PALLETS.csv` (UTF-8 con BOM, todos los campos entre comillas, separador `,`).
La hoja **Registros completos** de `HISTORICO_PALLETS_INNPACK.xlsx` tiene las mismas columnas.

> **Cada fila es una inspección (registro de control), no un pallet.** Varias filas pueden describir el mismo hecho (ver `evento_id`).

## Campos

| Campo | Descripción | Origen |
|---|---|---|
| `id_original` | ID del registro en `registros_control` (se conserva sin cambios; es el mismo en MySQL y SQL Server) | MySQL / API |
| `fuente` | `MySQL historico (calidad)`, `API SQL Server (vigente)` o `MySQL historico + API SQL Server` (IDs presentes en ambas) | Derivado |
| `fecha`, `hora` | Fecha y hora de registro de la inspección | `fecha_registro`, `hora_registro` |
| `np` | Número de pedido (texto, puede incluir sufijos como `3924-1`) | `np` |
| `cliente` | Cliente. **Vacío con la marca `(no disponible via API)` para registros leídos solo desde SQL Server** | MySQL |
| `codigo_producto`, `producto` | Código y descripción del producto (solo si el inspector los capturó) | `codigo_producto`, `descripcion_producto` |
| `area` | Área del registro (`CALIDAD`, `CALIDAD INNPACK`, `PRODUCCION`...). Marca `(no disponible via API)` en registros solo-API | MySQL |
| `proceso`, `maquina` | Proceso (Troquelado, Emplacado, Paletizado...) y máquina | Catálogos |
| `turno`, `inspector` | Turno (A/B) e inspector que registró | `turno`, `usuarios` |
| `color_pallet` | `AZUL`, `ROJO`, `VERDE` (o combinación `A / B`) detectado en el texto | Derivado |
| `certeza` | `confirmado`, `probable` o `ambiguo` (ver criterios) | Derivado |
| `criterio_clasificacion` | Regla que produjo la certeza | Derivado |
| `cantidad_pallets_declarada` | Número escrito literalmente antes de "pallet(s)" (ej. "3 pallet en azul" → 3). **Vacío si no consta. No es un conteo verificado** | Texto |
| `pallets_numeros_citados` | Números/códigos escritos tras "pallet" (ej. `n°2`, `463975-11`). Son identificadores citados, no cantidades | Texto |
| `observacion_original` | Observación íntegra, sin modificar | `observacion` |
| `defectos_registrados` | Defectos asociados (fallas visuales en MySQL; tipo de defecto concatenado vía API) | Fallas |
| `observaciones_de_fallas` | Texto libre de las fallas visuales (solo MySQL) | `registro_fallas_visuales.observacion` |
| `observaciones_de_bobinas` | Observaciones de bobinas del registro | `registro_control_bobinas` |
| `campos_donde_aparece_color` | Campos donde se detectó el color (`observacion`, `fallas_obs`, ...) | Derivado |
| `estado_inspeccion` | Aprobado / Rechazado u otro estado del catálogo | `estados_catalogo` |
| `estado_validacion`, `fecha_validacion`, `usuario_validacion` | Validación del supervisor (`PENDIENTE`, `VALIDADO`, `RECHAZADO`) | `registros_control` |
| `eliminacion_logica` | `SI`, `NO` o `NO VERIFICABLE` (registros leídos solo desde SQL Server: la API no expone eliminados) | MySQL |
| `n_fotos`, `fotos_url`, `fotos_http_200` | Cantidad de fotos, URLs (separadas por ` | `) y cuántas respondieron HTTP 200 en la verificación (HEAD) | `registro_adjuntos` / API |
| `evento_id` | Identificador de evento histórico (`EVT-0001`...) que agrupa duplicados | Derivado |
| `registros_en_evento` | Cuántas inspecciones componen el evento | Derivado |
| `es_duplicado_dentro_del_evento` | `NO` para la primera inspección del evento, `SI` para las repeticiones | Derivado |

La hoja **Eventos unicos** tiene un renglón por `evento_id` con: fechas/horas del primer y último registro, certeza máxima del evento, `ids_registros`, `eliminacion_logica` agregada (`SI (todos eliminados)`, `PARCIAL`, `NO`, `NO VERIFICABLE`) y `fotos_distintas`.

## Fuentes

| Fuente | Cobertura | Acceso | Notas |
|---|---|---|---|
| MySQL `calidad` (histórico) | 2026-05-27 a 2026-09-08 | Lectura (sesión `READ ONLY`) | Incluye eliminados, todas las fallas y todos los adjuntos |
| API INNPACK `GET api/registros-control` (SQL Server vigente) | 2026-09-01 a 2026-11-19 | Solo GET con la cuenta de servicio existente | Una foto por registro, sin cliente/área, sin eliminados |
| Fotos `https://api.faret.cl/calidad/uploads/control/...` | - | Solo HEAD | Sólo se verificó existencia, no el contenido |

Solape 2026-09-01 a 2026-09-08: 167 IDs en ambas fuentes, sin diferencias de observación, estado de inspección ni estado de validación.

## Criterios de clasificación (se aplican por registro, en este orden)

1. Se buscan `azul`, `rojo/roja`, `verde` (palabra completa) en `observacion`, observaciones de fallas, observaciones de bobinas, defectos y tipo de merma. Se descarta el apellido capitalizado **"Rojas"**.
2. **`confirmado` (R1)**: la palabra *pallet/palet(s)* y el color forman una misma expresión: `pallet [hasta 4 palabras] en/a <color>`, `pallet <color>` o `<color> pallet`. Ej.: "pallet n°2 quedará en azul", "pallet azul con descalse".
3. **`probable` (R2)**: aparece *pallet* y aparece un color en el mismo texto, sin ligazón directa. Ej.: "pallet 27 y 28 con film azul", "pallet con reventón... se deja en rojo".
4. **`ambiguo` (R3)**: color sin la palabra *pallet* (material, film, pliegos). No prueba una clasificación de pallet. Ej.: "material en azul", "pliegos rojos".
5. Un registro con varios textos toma la mejor certeza encontrada.

El color y la certeza son una **interpretación del texto libre** hecha por reglas; el texto original se conserva intacto en `observacion_original`.

## Reglas de deduplicación (evento histórico)

- Dos registros pertenecen al mismo evento si coinciden en **NP**, **proceso** y **texto normalizado** (minúsculas, sin signos ni espacios dobles) y están separados por **60 minutos o menos** respecto del registro anterior del grupo.
- El evento toma la certeza máxima de sus registros.
- No se asume que cada evento sea un pallet: un evento puede referirse a varios pallets o a uno solo.
- Ejemplo: NP 4058, 2026-10-08 16:22, 22 registros idénticos → 1 evento.

## Limitaciones relevantes

- Registros eliminados lógicamente posteriores a 2026-09-08 no son visibles (la API no los entrega).
- No se afirma cobertura completa: hay 28 días sin datos en el rango 2026-05-27 a 2026-11-20 (mayormente domingos y festivos; ver informe).
- Las cantidades son declaraciones textuales, no conteos.
