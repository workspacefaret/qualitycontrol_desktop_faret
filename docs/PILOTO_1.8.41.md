# Piloto Quality Control Center 1.8.41 (INNPACK)

26-11-2026. Las casillas "Resultado" las completa quien ejecuta. **En blanco = no probado.**
En producción el piloto es **solo de consulta**; mermas, cierres, certificados, aprobaciones y destrucciones se prueban
en el entorno aislado, salvo autorización expresa de TI.

## 0. Producción hoy

Informado por TI: migración 2026_12, API INNPACK `6c95fb8` y fps-api desplegadas; apisapfaret sin cambios (`ee3ce6e`);
escritorio publicado **1.8.39**; `latest.json` sin cambios.
Comprobado sin credenciales: ambos `health` 200; una ruta exclusiva de la API INNPACK nueva responde 401 y una
inventada 404 (la API nueva está atendiendo). Rutas de fps-api sin clave: 401. **Nada de esto valida el funcionamiento.**

**Aviso para usuarios de 1.8.39:** "Confirmar destrucción ejecutada" **falla** con "Debes indicar la cantidad
efectivamente destruida" (esa versión no envía el dato que la API nueva exige; resultado del contraste de código). Se
rechaza antes de escribir. No confirmar ejecuciones desde 1.8.39; esperan a 1.8.41. No justifica revertir la API.
La API nueva además puede rechazar, con mensaje: corregir una merma validada sin ser aprobador; certificado que mezcla
unidades, repite lote y pallet, usa un pallet ya certificado o se envía a aprobación sin detalle. Es esperado.
En Trazabilidad, una no conformidad solo se vincula si su campo NP/NV contiene el número o una lista de números.

## 1. Datos reales: comparación de las 8 NP (ejecuta TI, solo GET)

La herramienta se corrigió hoy (antes marcaba siempre el despacho como no validable). Revisar el cambio antes de
ejecutarla (`git log -p -1 -- tools/entorno_aislado/comparar_reales.js`). Desde la raíz del repositorio:

```powershell
node --use-system-ca tools/entorno_aislado/comparar_reales.js --produccion
```

Pide la URL `https://api.faret.cl/fps/api/produccion` y la clave (oculta; no se guarda). Consulta una NP cada 5 s y
**se detiene ante el primer error o fuente caída**. Deja el detalle en
`%LOCALAPPDATA%\QCC_Aislado\comparacion_<fecha>.json` (sin clave). Con ese archivo se completa el análisis.

| Criterio | Se espera | Si no |
|---|---|---|
| Regla de despacho | "corregida" en todas | Crítico: avisar; recuperación de fps-api |
| `sapDespachos` y `sapConsumos` | Disponibles | Crítico: recuperación (`FPS_API_1.8.41_COMANDOS.md`) |
| `sapEntradas`, `sapInventario`, `fpsControles`, `fpsEtiquetas` | Disponibles | No crítico: informar permisos al DBA |
| Consumos | Cantidad mayor que cero donde hubo producción | Contrastar con SAP |

Referencia: foto SQL del 25-11, y consulta a la **API anterior** del 26-11 a las 10:05. No hay línea base tomada justo
antes del despliegue y la foto no es inmutable: un movimiento posterior explica diferencias, pero hay que demostrarlo.

| NP | Despachado referencia 25-11 | Despachado API anterior | Qué mirar con la API nueva |
|---|---|---|---|
| 3951 | 4.356.234 | igual | Sin cambio, salvo movimientos |
| 4007 | 484.000 | igual | Sin cambio |
| 4093 | 388.500 | igual | Sin cambio |
| 4123 | 2.951.400 | 2.999.400 | Contrastar con SAP. Antes difería además en liberado (+30.000 por ítem), cuarentena (60.000 → 0) y corridas (140 → 149) |
| 4128 | 58.908 | igual | Sin cambio |
| 4162 | 250.580 | **351.080** | **Caso clave.** La regla corregida debería acercarse a 250.580. Revisar `facturadoReserva` y guías contra SAP |
| 4171 | 279.000 | igual | Sin cambio |
| 4190 | 0 | igual | Liberado difería: referencia 0, API 950 |

Facturas de reserva y notas de crédito: la salida muestra por ítem `guias`, `facturadoDirecto`, `facturadoReserva`,
`facturadoDeGuia`, `devuelto`, `notasCredito` y `reingresoNc`. Despachado = guías + facturado directo − devuelto −
reingreso por NC. La fórmula coherente no prueba que los documentos estén completos: contrastar al menos una NP con
reserva y una con nota de crédito contra los documentos en SAP.

| Comprobación | Resultado |
|---|---|
| Comparación ejecutada (hora, coinciden / difieren / no disponibles) | |
| NP 4162 contrastada con SAP | |
| NP con nota de crédito contrastada con SAP (número: ) | |
| Consumos y lotes de una NP contrastados con SAP | |

## 2. Equipo piloto

- Un equipo, sin la variable `QCC_AISLADO`. Instalar a mano `C:\Installers\QualityControlCenter_Setup_v1.8.41.exe`
  (SHA256 empieza `FC792CA5DA47B2AB`). El actualizador solo instala versiones mayores: no vuelve a 1.8.39.
- Volver atrás: instalar `QualityControlCenter_Setup_v1.8.39.exe` (SHA256 empieza `5517136BB2CF74B6`).
- **Usuario con nivel "Ver"** en Trazabilidad, Balance y Mermas, Cierre NP, Certificados, Muestra de Laboratorio y
  Talleres Externos, **sin rol administrador** (lo define TI o ADMIN_TI). Así el escritorio y la API rechazan escrituras en
  los cuatro módulos y se pueden usar consultas y exportaciones. Con un usuario de edición, no pulsar ningún botón que
  guarde.

## 3. Pruebas nativas en Photino, datos reales, solo consulta

| # | Prueba | Se espera | Resultado |
|---|---|---|---|
| P1 | Abrir, elegir INNPACK, iniciar sesión | Versión 1.8.41 y aviso de novedades una vez | |
| P2 | Trazabilidad: NP 4162 y 4007 | Ficha por ítem, indicadores del ítem elegido, sin aviso "regla anterior" | |
| P3 | Línea de fuentes | Todas "disponible"; una caída se ve "No disponible", nunca 0 | |
| P4 | Pestañas, detalle de corrida y registro original | Datos reales coherentes | |
| P5 | Buscar por código o cliente; buscar un lote; NP inexistente | Resultados; "NP NO ENCONTRADA" | |
| P6 | "Continuar con la NP" por los cuatro módulos | Misma NP e ítem, cargados | |
| P7 | Balance y Cierre sin guardar | Cifras iguales a Trazabilidad; diferencia no es merma; fabricada sin confirmar hasta elegir origen | |
| P8 | Certificados: listado, un certificado existente si lo hay | Estados claros; sin botones de escritura | |
| P9 | PDF y Excel de Trazabilidad (V05), Balance, Mermas y Cierre | El diálogo de impresión abre; los Excel abren con las mismas cifras | |
| P10 | ZIP documental | Abre; índice y faltantes. Nota de venta y recepción como NO INCLUIDO (apisapfaret sin actualizar) | |
| P11 | Abrir un adjunto SAP de guía o factura y, si existe, una evidencia o documento | Abre en Windows | |
| P12 | "Elegir inspección" de camión | Lista inspecciones reales sin asociar ninguna | |
| P13 | Escritura (entorno aislado) | Merma con evidencia, cierre, certificado, aprobación, emisión y ejecución | |

Escrituras ya probadas el 26-11 en navegador con datos ficticios; P13 es la comprobación en la ventana nativa
(`CANDIDATA_1.8.41.md`, "Validación en Photino").

## 4. Regresión (solo consulta)

| # | Prueba | Resultado |
|---|---|---|
| R1 | Muestra de Laboratorio: listado, abrir una muestra, "Nueva Muestra" por NP carga artículos (sin guardar) | |
| R2 | Informe o exportación de Laboratorio | |
| R3 | Talleres Externos: listado, filtros, cantidad OF, Excel | |
| R4 | No Conformidades y NC Internas: listado y filtro por operador | |
| R5 | Inicio, Despachos Diarios, Certificados de liberación | |
| R6 | FARET: Inicio, No Conformidades, Despachos, Laboratorio, Trazabilidad | |
| R7 | Con la 1.8.39 (usuarios actuales): Trazabilidad y los tres módulos de Calidad NP consultan sin errores | |

Según el código, la API INNPACK nueva no modifica Laboratorio ni Talleres Externos y fps-api solo cambió dos archivos de
Trazabilidad; igual se comprueban.

## 5. QCC Web Java

Candidata `4b2da32` (Photino `0f9282a`): compuerta completa aprobada el 26-11, 343/343. Su gateway admite los campos
que exige la API nueva (cantidad ejecutada, línea de nota de venta, enlace, nombre de evidencia). **No probada en
navegador contra las API nuevas ni desplegada.** Falta saber qué versión web está instalada: si permite confirmar
destrucciones y no envía la cantidad, tiene la misma limitación que 1.8.39.

| Comprobación | Resultado |
|---|---|
| Versión web instalada | |
| En la web instalada, consultar Trazabilidad y Calidad NP sin errores | |

## 6. Requerimiento original: estado efectivo

"Aislado" = probado con datos ficticios. Nada está aceptado por Calidad.

| Módulo | Aislado | Falta validar con datos reales | Falta del requerimiento |
|---|---|---|---|
| Trazabilidad integral | Ficha, pestañas, documentos, ZIP, V05 y versiones | Fuentes, despachos, consumos, búsquedas, controles FPS, adjuntos | Filtro "Planta"; fuente de limpieza, plagas y tintas; mantención (MCC); guía y molde por versión; certificado de proveedor; lista oficial documental; adjuntos de NV y recepción (apisapfaret pendiente) |
| Balance y mermas | Registro, validación, corrección, anulación, balance y exportaciones | Cifras por etapa; factor | Cantidad fabricada automática; definición de "conciliar"; lista oficial de defectos |
| Cierre de producción | Borrador, cierre, versiones, historial, exportaciones | Cifras de una NP real | Cargos, áreas responsables y aprobaciones |
| Certificados de destrucción V11 | Saldo, aprobación, emisión, ejecución parcial, anulación, PDF y Excel | Autocompletado | Orden y separación de aprobadores, firmas, quién emite y anula |

Medida de desarrollo (matriz, no de aceptación): 59 % ponderado, 23 % estricto.

## 7. Listo para Mariela cuando

1. La sección 1 no tenga fallas críticas y 4162 y la NP con nota de crédito estén contrastadas con SAP.
2. P1 a P11 y R1 a R5 sin fallas bloqueantes.
3. Se le entreguen la sección 6 y `CUESTIONARIO_MARIELA.md`. La demostración de escritura se hace en el entorno aislado.
