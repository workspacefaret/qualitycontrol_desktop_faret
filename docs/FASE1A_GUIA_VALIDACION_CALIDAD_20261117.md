# Trazabilidad integral (Fase 1a) — Guía de validación para Calidad

Módulo **Trazabilidad** (INNPACK). Solo consulta: no registra ni modifica nada.
Requisito: la versión de fps-api con los endpoints de trazabilidad debe estar desplegada (ver `contex.md` Paso 141).

## Cómo leer la pantalla

- **Confirmado**: dato registrado en SAP, FPS, QCS o QCC.
- **Registrado en FPS**: cantidad declarada por el operador; no es inventario confirmado.
- **Estimado**: cálculo de QCC (por ejemplo, "Pendiente despacho"). Nunca es definitivo.
- **No disponible**: la fuente no respondió o no tiene el dato. No significa cero.
- Una diferencia entre cantidades **no** es automáticamente merma.

## Casos a revisar (valores verificados con datos reales el 17-11-2026)

| NP | Qué comprobar | Esperado |
|---|---|---|
| 4002 | Liberaciones con cuarentena que pasó a destrucción | Liberado PT 1.600 · Cuarentena 0 · Destrucción 1.900 · 5 folios sin cerrar (no suman) |
| 3951 | NV con dos líneas del mismo ítem y código, guías y devolución | Ítem 1 con líneas "0, 2" y aviso de que no se pueden separar las liberaciones · devolución de 4.800 restada del despachado · facturas de guía informativas, no suman |
| 4007 | Mismo código en ítems distintos, facturas directas | Ítems 3 y 5 (y 4 y 6) por separado · el despachado coincide con las facturas directas |
| 4128 | NP con 2 OT | OT 23090 sin consumos SAP: debe decir "sin salidas registradas", no cero |
| Lote 5433-1 | Búsqueda por lote | Origen "Entrada de mercancía" (sin proveedor) · consumos de la OT 22811 → clic en NP 4007 abre su trazabilidad |

## NP 3951 en detalle (caso principal del piloto)

Valores verificados en SAP/FPS el 17-11-2026 (pueden crecer si hay movimientos nuevos):
- FPS: 1 OT (22651, ingreso 20-07-2026), 25 procesos, 130 corridas.
- SAP: 42 guías (46 líneas, 4.361.034 un.) y 42 facturas emitidas sobre esas guías (informativas, no suman); 1 devolución de 4.800.
- Ítem 2: guías 1.269.450 − devolución 4.800 = **despachado 1.264.650** (coincide con lo facturado).
- Ítem 1 aparece en las líneas 0 y 2 de la NV con el mismo código: se muestran juntas y con aviso; las liberaciones no se reparten entre ellas.
- Consumos SAP de la OT: 107 líneas FARET y 215 INNPACK (la mayoría con lote y proveedor).

Preguntas para Calidad: ¿el despachado por ítem coincide con lo que ustedes controlan? ¿Las liberaciones en cuarentena/destrucción son las esperadas? ¿Qué significan los pallets verde/azul/rojo de FPS (hoy se muestran como "registrado en FPS")?

## Qué reportar

Para cada NP: si las cifras coinciden con lo que Calidad conoce, y cualquier dato que falte o que no se entienda. Exportar el Excel de la NP y revisar la hoja "Resumen" (estado de cada fuente) y la columna "Referencia origen" de cada hoja.
