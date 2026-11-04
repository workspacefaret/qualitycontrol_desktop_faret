# Publicación 1.8.28 — checklist definitivo (preparado el 04-11-2026)

Estado: **preparado en local. Nada desplegado, ningún SQL ejecutado, `latest.json` sin tocar** (el real del share sigue en 1.8.27).

## 1. Validaciones aprobadas (responsable TI, 04-11-2026)
El responsable TI confirmó haber realizado personalmente, con resultado satisfactorio:
- Integración y trazabilidad FPS (diagnóstico de solo lectura previo: NP 22924 y 4062 resuelven a la OF 22924; ítem 2 devuelve 5 registros de emplacado —4 con producción y 1 con cantidad 0— y 7 de troquelado).
- Comparación con el registro físico REG-LAB-04.
- Generación y apertura de Excel y PDF.
- Funcionamiento general del módulo según los requerimientos de Mariela.

## 2. Pruebas automáticas locales (04-11-2026)
API: build Release 0 errores; suite contra LocalDB 66/66 (A3, A4, A6, M7). Desktop: build 0 errores. JS: XSS 22/22, doble envío OK, M8/M8b 11/11, unidades 12/12. Excel real (M10) 9/9.

## 3. Riesgos conocidos (NO resueltos)
- **Concurrencia en formularios históricos:** si dos usuarios corrigen a la vez el mismo ensayo finalizado de BCT teórico, Viscosidad, pH, Sólidos, Lugol o Filtración (13 métodos `Guardar<Tipo>` → `FinalizarGuardado`), puede quedar un ensayo nuevo sin vínculo (huérfano). Fuera de alcance de 1.8.28.
- **M9 global NO verificado:** solo se midió `Obs2`/`Obs3` de la OF 22924 (máx. 537 caracteres). El máximo de `ZZZMasterOT` requiere la consulta del DBA; no se truncó nada.
- Máximos físicos por magnitud y mínimo Cobb/RCT: pendientes de especificación de Mariela. Los límites de A6 son de almacenamiento, no físicos.
- M9b, M11 y resto del diseño de M10: fuera de alcance.

## 4. Componentes a desplegar y orden
| # | Componente | Qué | Quién |
|---|---|---|---|
| 1 | SQL `calidad_db` | `Sql/2026_11_muestra_laboratorio_ensayos_auditoria_anulacion.sql` (2 columnas NULL en `muestra_laboratorio_ensayos`) | DBA |
| 2 | API INNPACK | DLL + PDB de `QualityControlInnpack.Api` (SRV-API, pool `QualityControlInnpackPool`) | TI |
| 3 | Instalador Photino | `QualityControlCenter_Setup_v1.8.28.exe` al share | TI |
| 4 | `latest.json` | **Al final**, con backup previo | TI |
fps-api, apisapfaret y Java: sin cambios.

### SQL (revisado)
Aditivo e idempotente (`COL_LENGTH ... IS NULL`), 2 columnas NULL sin default, sin GRANT nuevo (grants por tabla). Compatible con APIs 1.8.26/1.8.27 (no las leen). **La API 1.8.28 falla (500) en el listado de ensayos si las columnas no existen: el SQL va antes.** Verificación posterior: `SELECT COL_LENGTH('dbo.muestra_laboratorio_ensayos','anulado_por'), COL_LENGTH('dbo.muestra_laboratorio_ensayos','fecha_anulacion')` (ambos no NULL). Rollback: `..._rollback.sql` (se detiene sin borrar si hay datos de auditoría). Precheck de solo lectura existente: `2026_11_muestra_laboratorio_verificacion_previa_SOLO_LECTURA.sql`.

### API
Archivos cambiados: `Controllers/MuestraLaboratorioController.cs`, `DTOs/MuestraLaboratorio/MuestraLaboratorioModels.cs`, `Program.cs` (AddHttpContextAccessor, parte del framework), `Repositories/MuestraLaboratorioRepository.cs` y `.Muestras.cs`, `Services/MuestraLaboratorioService.cs`. Sin paquetes NuGet nuevos, sin cambios de configuración. Publicar a carpeta de staging **fuera del repo** y copiar solo DLL+PDB. Contrato aditivo (`anuladoPor`, `fechaAnulacion`; `404` al anular un ensayo inexistente): clientes 1.8.26/1.8.27 siguen funcionando.
Respaldo previo: copiar la DLL y PDB actuales de producción a una carpeta con timestamp y registrar sus hashes. Reversión: detener solo el pool, restaurar DLL+PDB respaldadas, iniciar el pool. Las columnas SQL pueden quedar (la API anterior las ignora).

### Photino
Versión 1.8.28 en `.csproj` (Version/AssemblyVersion/FileVersion), `.iss` (AppVersion, AppVerName comentado, OutputBaseFilename), sidebar de `index.html` y `novedades.js`. Publicar con `dotnet publish QualityControlCenter.csproj -c Release -r win-x64 --self-contained true` (proyecto explícito) y luego `ISCC.exe installers/QualityControlCenter.iss`. `QCC.Updater.exe` no cambia (verificar tamaño 67.523.636 bytes). Calcular SHA-256 del instalador y copiarlo al share verificando hash.

## 5. Checklist de publicación (cada paso con autorización expresa)
1. Confirmar que `latest.json` real sigue en 1.8.27.
2. DBA ejecuta el SQL de auditoría; verificar columnas.
3. Respaldo con hash de la API actual; desplegar DLL+PDB; reiniciar solo el pool; probar `GET` autenticado y anular/consultar un ensayo de prueba.
4. Generar instalador; verificar hash local = share.
5. Backup con timestamp de `latest.json`; activar el nuevo (JSON en una sola línea, escrito con `Write`, validado como JSON leyéndolo del share).
6. Confirmar auto-actualización en un cliente real.

## 6. Rollback
- `latest.json`: copiar el backup sobre el actual (los clientes dejan de ver 1.8.28).
- API: restaurar DLL+PDB respaldadas y reiniciar solo el pool.
- SQL: normalmente no se revierte; solo con el script de rollback si no hay anulaciones auditadas.
- Clientes ya actualizados a 1.8.28 con API anterior: funcionan (campos aditivos), sin auditoría de anulación visible.

## 7. Artefactos locales generados (04-11-2026, sin publicar)
- Instalador `C:\Installers\QualityControlCenter_Setup_v1.8.28.exe`: 58.820.661 bytes, SHA-256 `cbcb4dacb13f345dbd982a40f858525863fa7b67805c26a2ce09b00ac9a36986`. `QCC.Updater.exe` incluido: 67.527.732 bytes (single-file correcto; el tamaño difiere del 67.523.636 histórico porque el bundling no es reproducible). Recalcular el hash antes de publicar si se regenera.
- API (staging fuera del repo, carpeta `api_staging_1.8.28` del scratchpad): `QualityControlInnpack.Api.dll` SHA-256 `6fcc1f37…3993f1b`, `.pdb` `5487826c…b19ceb`. Se regeneran en el momento del despliegue; estos hashes sirven de referencia.
