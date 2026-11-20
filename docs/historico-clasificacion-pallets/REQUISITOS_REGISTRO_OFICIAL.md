# Requisitos mínimos del futuro registro oficial de pallets (azul / rojo / verde)

Documento de requisitos, **no de diseño**. Se reutilizará el sistema actual de Inspecciones Calidad INNPACK y su infraestructura; este documento no define módulos, tablas ni pantallas nuevas.

| # | Requisito | Detalle mínimo | Referencia histórica |
|---|---|---|---|
| 1 | **Fecha y hora** | Fecha y hora del evento, generadas por el sistema (no editables sin auditoría) | `fecha`, `hora` |
| 2 | **NP y producto** | NP obligatorio; código y descripción del producto (hoy opcionales y a veces vacíos) | `np`, `codigo_producto`, `producto` |
| 3 | **Proceso y máquina** | Del catálogo existente (Troquelado, Emplacado, Corrugado, Paletizado...) | `proceso`, `maquina` |
| 4 | **Clasificación** | Valor cerrado: `AZUL`, `ROJO` o `VERDE`. Definir en el negocio qué significa cada color (el histórico usa azul = segregado/observado, rojo = no conforme; verde no tiene uso histórico) | `color_pallet` |
| 5 | **Cantidad de pallets** | Número entero obligatorio y explícito. Hoy solo consta en texto libre (8 eventos) | `cantidad_pallets_declarada` |
| 6 | **Motivo u observación** | Motivo estructurado (catálogo de defectos existente) + observación libre opcional | `defectos_registrados`, `observacion_original` |
| 7 | **Responsable** | Usuario que clasifica; si es otra persona quien autoriza o libera, registrarlo aparte | `inspector`, `usuario_validacion` |
| 8 | **Evidencia fotográfica** | Una o más fotos cuando corresponda (obligatoria para ROJO; a definir para AZUL) | `fotos_url` |
| 9 | **Trazabilidad del registro** | Vínculo a la inspección de origen, identificador único del registro, usuario/fecha de creación y de cada cambio, anulación lógica con motivo (nunca borrado), sin duplicados accidentales (el histórico tuvo 41 repeticiones) | `id_original`, `evento_id`, `eliminacion_logica` |

## Decisiones pendientes (negocio)
- **Fecha de corte** a partir de la cual rige el registro oficial.
- Significado oficial de cada color y si un pallet puede cambiar de color (ej. azul → liberado/rojo) y cómo se registra el cambio.
- Obligatoriedad de la foto según el color.
- Quién puede registrar, cambiar o anular una clasificación.

## Reglas de convivencia con el histórico
- El histórico (`HISTORICO_PALLETS_INNPACK.xlsx`, `EVIDENCIAS_PALLETS.csv`) es una **línea base informativa**, no una estadística oficial de cantidades de pallets.
- No se suma a los indicadores del registro oficial ni se importa como si fuera un registro oficial; solo es consultable como referencia anterior a la fecha de corte.
- Los eventos `probable` y `ambiguo` no se usan como cifras.
