# Procedimiento para regenerar el histórico

> **Línea base informativa.** El histórico no es una estadística oficial de cantidades de pallets. Regenerarlo es opcional y **nunca debe sobrescribir** esta línea base: usa una carpeta nueva.

## Requisitos
- Python 3 con `pymysql` y `openpyxl` (`pip install pymysql openpyxl`).
- Microsoft Edge instalado (imprime el PDF; ruta por defecto `C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`, cambiable con la variable de entorno `EDGE`).
- El `config.json` del proyecto (ya contiene los accesos; **los scripts solo lo leen en ejecución y no imprimen ni guardan credenciales**).
- Red corporativa con acceso a MySQL `calidad`, a la API INNPACK y a `https://api.faret.cl/calidad`.

## Pasos
```bash
# 1) Extracción y clasificación (SOLO LECTURA). La carpeta de trabajo debe estar FUERA del repositorio.
python -I regenerar/01_extraer_clasificar.py <ruta>/config.json <carpeta_de_trabajo>

# 2) Entregables (no consulta nada). La carpeta destino debe ser NUEVA.
python -I regenerar/02_generar_entregables.py <carpeta_de_trabajo>/step1.json <carpeta_destino_nueva>
```

## Qué hace cada paso
1. **`01_extraer_clasificar.py`**: `SELECT` en sesión `READ ONLY` sobre MySQL (`registros_control`, fallas visuales, adjuntos, observaciones de bobinas), login con la cuenta de servicio y solo `GET` paginados a la API (ventana `API_DESDE`/`API_HASTA`, editable al inicio del script), clasificación por color/certeza, agrupación en eventos y verificación de fotos con `HEAD`. Escribe `step1.json`.
2. **`02_generar_entregables.py`**: a partir de `step1.json` genera `EVIDENCIAS_PALLETS.csv`, `HISTORICO_PALLETS_INNPACK.xlsx` e `INFORME_HISTORICO_PALLETS_INNPACK.pdf`.

## Reglas
- No versionar `step1.json` ni `informe.html` (contienen datos de inspecciones); manténlos en la carpeta de trabajo.
- Los criterios de clasificación y deduplicación están en `../DICCIONARIO_DATOS.md`; si se cambian, actualizar ese documento.
- Para otro corte de fecha, ajustar `API_DESDE`/`API_HASTA` (paso 1) y las fechas `d0`/`d1` de cobertura (paso 2).
- Los textos del informe (cobertura, limitaciones) son de la línea base 2026-11-20; revisarlos si se regenera con otro corte.
- Verificación mínima: el CSV debe tener 34 columnas, el XLSX 6 hojas y el total de registros del resumen debe coincidir con las filas del CSV.
