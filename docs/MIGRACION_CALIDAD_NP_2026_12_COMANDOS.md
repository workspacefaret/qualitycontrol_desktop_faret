# Migración Calidad NP 2026_12 — comandos para ejecución supervisada

**No autorizada ni ejecutada en producción.** Los ejecuta una persona, en **SAP_NEW**, con **AD\Administrador**,
sobre `calidad_db`.

## Cuándo ejecutarla

Junto con la versión de la API que usa el esquema nuevo (local, sin desplegar). Orden obligatorio:

1. **Esta migración.** La API desplegada hoy sigue funcionando con ella aplicada (todo lo nuevo admite NULL o tiene DEFAULT).
2. **API INNPACK nueva.** No funciona sin la migración (consulta columnas y tablas nuevas).
3. **Escritorio nuevo** (instalador; `latest.json` al final). El escritorio anterior no envía la cantidad destruida: con la
   API nueva, "Confirmar destrucción ejecutada" le dará error hasta actualizarlo. Probar también la web Java.

Antes de ejecutarla: validar las funciones en el entorno aislado (`tools/entorno_aislado/README.md`).

Funciones que la consumen: cantidad efectivamente destruida, documento emitido y evidencias del certificado, ítem SAP en
mermas, cierres y certificados, unidad y estado por área del cierre, y estados "En revisión", "No digitalizado" y enlace
en los documentos de trazabilidad. Si una versión anterior del script se aplicó en una base de pruebas, recrearla
(`preparar.js --recrear`): cambió el tipo `PDF_EMITIDO` por `DOCUMENTO_EMITIDO`.

Permisos: el usuario SQL de la API tiene permisos **por objeto**. El script da los de las dos tablas nuevas a
`qcc_innpack_api_sql` si ese usuario existe en `calidad_db`; si la API usa otro, el DBA debe darle los mismos.

## Archivos (repo API, `QualityControlInnpack.Api\Sql`)

`2026_11_alertas_0_respaldo_calidad_db.sql` (respaldo) · `2026_12_calidad_np_cumplimiento_PROPUESTA.sql` ·
`..._verificacion_SOLO_LECTURA.sql` · `..._rollback.sql`.

Copiarlos a una carpeta del servidor y **revisarlos** (incluida la ruta del `.bak`). Registrar su hash:

```powershell
Get-FileHash .\*.sql -Algorithm SHA256 | Format-Table Hash, Path -AutoSize
```

## Ejecución (PowerShell en SAP_NEW, desde esa carpeta)

Ajustar `-S` si la instancia no es la predeterminada. Detenerse ante el primer error.

```powershell
# 0. Identidad y base (solo lectura): esperado AD\Administrador, calidad_db
sqlcmd -S localhost -E -C -b -Q "SELECT SUSER_SNAME() AS login_actual, DB_ID('calidad_db') AS id_base"

# 1. Prerrequisito (solo lectura): las 4 columnas con valor distinto de NULL
sqlcmd -S localhost -E -C -b -d calidad_db -Q "SELECT OBJECT_ID('dbo.trazabilidad_documento') d, OBJECT_ID('dbo.np_merma') m, OBJECT_ID('dbo.np_cierre') c, OBJECT_ID('dbo.cert_destruccion') cd"

# 2. Línea base (solo lectura): objetos en FALTA y filas_base de referencia
sqlcmd -S localhost -E -C -b -d calidad_db -f 65001 -i .\2026_12_calidad_np_cumplimiento_PROPUESTA_verificacion_SOLO_LECTURA.sql -o .\antes.txt

# 3. Respaldo COPY_ONLY con CHECKSUM (obligatorio: sin él la migración aborta).
#    ANTES: en la copia del script, reemplazar COMPLETAR_RUTA_COMPLETA (línea @Ruta) y el nombre del .bak.
sqlcmd -S localhost -E -C -b -f 65001 -i .\2026_11_alertas_0_respaldo_calidad_db.sql -o .\respaldo.txt

# 4. Migración
sqlcmd -S localhost -E -C -b -I -d calidad_db -f 65001 -i .\2026_12_calidad_np_cumplimiento_PROPUESTA.sql -o .\migracion.txt

# 5. Verificación (solo lectura): todo OK y las mismas filas_base que en antes.txt
sqlcmd -S localhost -E -C -b -d calidad_db -f 65001 -i .\2026_12_calidad_np_cumplimiento_PROPUESTA_verificacion_SOLO_LECTURA.sql -o .\despues.txt
```

`-f 65001` corresponde al `sqlcmd` ODBC de SQL Server; si el instalado es go-sqlcmd, quitarlo.

Si `migracion.txt` contiene `ABORTADO`, no se modificó nada; los `Msg 207` posteriores son mensajes de compilación
de los lotes anulados. Ante cualquier otro error: no reintentar, conservar los `.txt` y revisar.

## Rollback

```powershell
sqlcmd -S localhost -E -C -b -I -d calidad_db -f 65001 -i .\2026_12_calidad_np_cumplimiento_PROPUESTA_rollback.sql -o .\rollback.txt
```

Se detiene sin cambios (`Msg 50011`) si ya hay datos que usan el esquema nuevo; en ese caso no se revierte el
esquema. La restauración del respaldo es el último recurso y la decide el DBA.

## Probado en LocalDB (25-11-2026)

Sobre el esquema base real más las migraciones 2026_09 a 2026_11: aplicación, reaplicación, rollback, aborto sin
respaldo, aborto en base equivocada, doble aplicación con respaldo y verificación sin objetos faltantes. Después del cambio
de `DOCUMENTO_EMITIDO`, las pruebas de la API aplican el script (guarda de respaldo apagada solo en la prueba) y pasan
217 de 217 con compatibilidad 130; no se repitieron aquí la reaplicación, el rollback ni las guardas.
La revisión del SQL nuevo de la API no encontró funciones posteriores a 2016. **No probado en un SQL Server 2016 real** ni
con datos productivos.

## Publicación coordinada (preparada, no autorizada)

Condiciones de entrada: prueba con datos reales de las 8 NP revisada, validación visual en la ventana Photino y
autorización expresa. Reglas generales en `.claude/DEPLOY_POLICY.md` y `docs/OPERACION_DESPLIEGUE_QCC.md`.

| Paso | Qué | Quién | Criterio para seguir |
|---|---|---|---|
| 1 | Migración 2026_12 (comandos de arriba) | `AD\Administrador` | Verificación todo OK y mismas filas base |
| 2a | API INNPACK (SDK 10.0.404), DLL+PDB con respaldo | Autorizada | DLL de producción = compilación del commit desplegado, antes de copiar |
| 2b | `apisapfaret` (SDK 9.0.318), solo su pool | Autorizada | Igual que 2a |
| 2c | `fps-api`: `trazabilidad.service.js` y demás archivos que difieran de producción; respaldo previo (no tiene git) | Autorizada | Comparar archivo por archivo; esperar ~75 s al puerto |
| 3 | Validar servicios: health, `comparar.js` contra las respuestas de producción, Despachos y Laboratorio sin regresión | Autorizada | Sin diferencias no explicadas |
| 4 | Piloto: escritorio nuevo en un equipo, sin tocar `latest.json` | Informática | Cuatro módulos, permisos VER/SIN_ACCESO y FARET sin cambios |
| 5 | Validación con la usuaria sobre una NP real, midiendo el ejercicio | Calidad | Conforme y definiciones pendientes respondidas |
| 6 | Instalador definitivo. **El 1.8.40 compilado el 24-11 no sirve** (errores de cifras): recompilar desde el commit aprobado y revisar el número contra el `latest.json` del share | Informática | Hash verificado en el share |
| 7 | `latest.json` al final, con respaldo del anterior | Informática | Auto-update confirmado en un cliente |

El commit va antes del paso 2 y requiere autorización. Entre los pasos 2a y 6, el escritorio publicado no puede
confirmar una destrucción (la API nueva exige la cantidad destruida): hacerlo en una ventana corta.

**Web Java:** no sincronizar su `www` con esta versión todavía. Le faltan acciones de documento emitido y evidencias del
certificado, estado por área del cierre, versiones del informe, adjuntos SAP, búsqueda, factor, documentos SGI, NC y
pallets de Trazabilidad. Además, con la API nueva debe probarse su confirmación de destrucción antes del paso 2a.

### Agregado en el Paso 168 (preparado, no autorizado)

- `fps-api` suma `GET trazabilidad/corrida` y datos de materiales/despachos por lote: desplegarla antes del escritorio. Con
  la anterior, el registro original y esos datos se muestran como no disponibles.
- Web Java: **después** del commit del escritorio y de la API INNPACK nueva, ejecutar su sincronización y control de
  contrato (`tools/sync-photino-www.ps1`, ejecución supervisada, sin evadir la política de ejecución), probar en navegador
  los adjuntos SAP, el ZIP, la evidencia de certificado y la confirmación de destrucción, y recién entonces desplegarla.
