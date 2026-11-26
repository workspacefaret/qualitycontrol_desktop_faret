# Cumplimiento del requerimiento original (INNPACK)

26-11-2026. Referencia única: `TRAZABILIDAD-DESTRUCCIÓN.txt` (leído completo ese día). Reemplaza como documento de
trabajo a la matriz de auditoría, que queda como historial.

- **Terminado** = construido y probado con datos ficticios o pruebas automáticas.
- **Por validar** = construido; falta probarlo con datos reales o en la ventana Photino.
- **Mariela** = falta una definición de negocio; no se inventa la regla.
- **Fuente** = el dato no tiene hoy una fuente utilizable.

Nada está aceptado todavía por Calidad. El escritorio 1.8.41 no está publicado.

## 1. Trazabilidad Integral

| Pide | Hay | Falta | Sistema | Estado | Solución más simple |
|---|---|---|---|---|---|
| Buscar NP / código / cliente, ítem, limpiar; no mezclar ítems; NP no encontrada y fuente caída (02.01) | Todo, con hora de la consulta | — | FPS, SAP | Por validar | Piloto |
| Filtro "Planta" | No | Qué es "planta" y qué filtra | FPS (solo paletizado la trae) | Mariela | Preguntar |
| Ficha NP+ítem (02.02) | NV, cliente, cantidades, factor confirmado, guía (texto FPS), perfil SAP, fechas, estado | Revisión de guía y molde; perfil usado al fabricar | FPS, SAP | Fuente | Mostrar "No disponible" hasta identificar dónde se registra |
| Historial y detalle por proceso, registro original, exportar (02.03–02.04) | Todo; hoy se agregaron columnas pedidas y **Exportar datos** | "Pliegos ingresados": FPS no lo registra; turno es estimado | FPS | Por validar | Piloto |
| Materiales y lotes, "vínculo de lote no confirmado" (02.05) | Consumos SAP por OT, proveedor, recepción, categoría, estado; aviso literal agregado hoy | Cuál adjunto es el certificado del proveedor | SAP | Por validar / Mariela | Ver adjuntos de la recepción; Bodega define cómo se identifica |
| Trazabilidad inversa por lote (02.06) | Lote → consumos, OT, NP, clientes, ventas y pallets; desde cada NP se ve el resto | Probar con un lote real | SAP, FPS | Por validar | Piloto |
| Checklist SGI y estados (02.07–02.08) | Carga manual con versiones; **hoy:** lo que FPS, SAP, QCS o QCC ya entregan se ve "Disponible en origen" con Consultar y no figura como faltante; Error de integración y Sin permiso | Lista oficial PRO-SGI-TDO-V04 | CDB y fuentes | Por validar / Mariela | Confirmar la lista y qué registros bastan como documento |
| Sala de tintas y control de plagas | Lotes de tinta SAP; formulación y certificado de plagas por carga manual (el requerimiento lo permite) | — | SAP, manual | Terminado | — |
| POES y control de proceso | Controles y limpieza de FPS por corrida | Cobertura real por proceso | FPS | Por validar | Piloto |
| Mantención y lubricantes | Carga manual | Consulta automática | MCC Faret | Fuente | Se requiere equivalencia máquina FPS ↔ activo MCC (Mantención) y un acceso de lectura en MCC |
| Camiones | Persona elige la inspección (formularios no registra NP) | — | Formularios | Por validar | Piloto |
| ZIP por área con índice y faltantes | Sí. El ZIP lista archivos: un registro en origen sin archivo sigue en FALTANTES.txt | Adjuntos de nota de venta y recepción en producción | SAP vía apisapfaret | Por validar | Publicar la candidata de apisapfaret (sección 5) |
| Informe REG-SGI-TDP PDF/Excel, guardar sin sobrescribir (02.09) | Secciones, balance, mermas, calidad, anexos, faltantes, versiones | Sustrato y medidas de Corte: sin dato estructurado | FPS | Por validar | Se muestra "Registro no disponible" |

## 2. Balance y Mermas

| Pide | Hay | Falta | Sistema | Estado | Solución más simple |
|---|---|---|---|---|---|
| Tabla por proceso, provisional, diferencia ≠ merma, varias corridas (03) | Sí, con detalle, calidad, PDF y Excel | Reproceso y saldo en proceso: nadie los registra | FPS, QCS | Por validar / Fuente | Se muestran "No disponible" |
| Factor unidades/pliego por ítem y corrida | Factor por NP+ítem que una persona confirma | Fuente confiable por corrida | Guía técnica (texto) | Mariela | ¿Basta por ítem y quién lo confirma? |
| "Conciliar diferencia" | No | Qué hace: ¿justifica, cierra, requiere aprobación? | — | Mariela | Hoy se justifica en Cierre de NP |
| Registro de merma completo, vincular defecto sin duplicar, método, evidencia (04.02–04.03) | Sí | Lista oficial de defectos | CDB | Terminado / Mariela | Lista actual hasta recibir la oficial |
| Acumulados separados por certeza; estados, historial, anulación con motivo (04.04–04.05) | Sí; retenida desde QCS; reprocesada sin fuente | — | CDB, QCS | Terminado | — |

## 3. Cierre de Producción NP

| Pide | Hay | Falta | Sistema | Estado | Solución más simple |
|---|---|---|---|---|---|
| Solicitada, diferencia, cumplimiento y casos 0 / negativo (05.01–05.04) | Sí | — | SAP | Terminado | — |
| Cantidad fabricada automática | Pendiente de confirmación o ingreso manual con origen y responsable (como pide el texto) | Qué registro representa unidades terminadas por ítem | FPS / QCS | Mariela | Definir el registro; mientras, manual |
| Justificar sin duplicar, vincular certificados, informe, PDF/Excel, versiones (05.05–05.06) | Sí; liberaciones, despachos e inventario visibles | Cifras de una NP real | CDB, QCS, SAP | Por validar | Piloto |
| Quién solicita y aprueba el cierre; áreas | Estado por área informativo | Cargos y responsables | — | Mariela | Preguntar |

## 4. Certificados de Destrucción

| Pide | Hay | Falta | Sistema | Estado | Solución más simple |
|---|---|---|---|---|---|
| Pestañas por estado y datos 01–09 (06.01–06.03) | Sí | — | SAP, FPS | Por validar | Piloto |
| Seleccionar registros, saldo, parcial, varios lotes/pallets, sin duplicar, evidencias (06.04) | Sí | Un lote sin pallet no tiene saldo conocido | CDB, QCS | Terminado | — |
| Motivo, categoría, descripción, causa raíz, observaciones, solicitante (06.05–06.10) | Sí; **hoy:** operador elegible desde las corridas FPS | Si la causa manual requiere autorización; jefatura no tiene registro de origen | CDB, FPS | Terminado / Mariela | — |
| Flujo de aprobación (06.11) | Tres cargos, aprobado ≠ ejecutado | Orden, firma, separación de personas. Hoy acepta cualquier orden y que quien crea apruebe los tres | CDB | Mariela | Con la respuesta es una validación en la API |
| Correlativo, bloqueo sin aprobación, anulación, PDF V11, historial, no tocar SAP (06.12–06.13) | Sí | Comprobar el PDF en Photino | CDB | Por validar | Piloto |

## 5. Confirmar destrucción: 1.8.39 y la API nueva

- La 1.8.39 no envía la cantidad destruida; la API en producción la exige y rechaza **antes de escribir**
  ("Debes indicar la cantidad efectivamente destruida"). No se pierde ni se altera ningún dato.
- **Solución más simple: no cambiar la API.** Las ejecuciones se confirman desde un equipo con 1.8.41 (instalación
  manual, decisión de TI) o esperan su publicación.
- Se descartó que la API asuma la cantidad aprobada cuando falta: registraría una destrucción que nadie declaró.

## 6. Pruebas (26-11)

| Prueba | Resultado |
|---|---|
| Reglas de Calidad NP (`tools/calidad_np_tests`) | 155/155 |
| ZIP, anexos y puente (`tools/zip_anexos_tests`) | 24/24 |
| Compilación del escritorio | Sin errores |
| apisapfaret, rama de integración con MCC | 803 pasan, 0 fallan, 38 omitidas |
| QCC Web (compuerta completa) | 343/343 |
| Navegador de punta a punta | Ejecutado antes de los cambios de hoy; **los cambios de hoy no se vieron en navegador** (entorno aislado apagado) |
| Datos reales y ventana Photino | No ejecutado |

De las pruebas funcionales del texto (sección 12), la 14 (ejercicio completo en 4 horas) solo puede medirla Calidad con
datos reales.

## 7. Artefactos locales (nada publicado)

- Escritorio `0d75a36`: `C:\Installers\QualityControlCenter_Setup_v1.8.41.exe`, SHA256 `7ADB7118F21A58EB…`.
- Web `1340b1c`, mismo frontend.
- apisapfaret `d21e2b1` (adjuntos de nota de venta y recepción sobre la rama de MCC). Antes de desplegar, MCC debe
  confirmar los dos commits que su rama tiene sobre la versión productiva (`ee3ce6e`) y TI contrastar la DLL.
- Paquete: `Desktop\Proyectos\_releases\qcc_1.8.41\`.
