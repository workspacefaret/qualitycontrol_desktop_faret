# QCC Desktop 1.8.30 — cierre, despliegue y decisiones (11-11-2026)

**Estado: DESPLEGADA y APROBADA por TI.** (`CLAUDE.md` y `contex.md` están en `.gitignore`; este archivo es el registro versionado.)

## Qué incluye
- Edición auditada de **Inspecciones Calidad** e **Inspecciones Pallet/Papel** (Faret). ADMIN / ADMIN_TI / INSPECTOR editan; CALIDAD solo ve. Motivo obligatorio, historial, validación en servidor (JWT, siempre modo `exigir`).
- Columnas **ID evento / Criticidad (Crítico, Mayor, Menor) / Criticidad máx.** con filtro; líneas entre columnas; "Última edición".
- **Excel y PDF** de ambos módulos se arman siempre desde los datos completos filtrados (tabla temporal oculta), con filtros en el título y anchos fijos en PDF. *Cambia la regla anterior "con filtros exporta lo visible" solo para estos dos módulos.*
- **Evaluación de Calidad por Operador** (INNPACK y Faret) y protecciones FPS de las Fases 42/43.

## Piezas y contratos
| Capa | Elemento |
|---|---|
| Desktop → API | acciones `faret.inspecciones[.pallet].actualizar / .auditoria / .catalogoEventos` (`FaretHandler`, `FaretInspeccionesApiService`, `FaretInspeccionesPalletApiService`); lecturas registradas en `PermisosService.AccionesLectura` |
| API `calidad` (Node, repo `quality_control/backend`) | `PUT /api/calidad-faret/registros/:id`, `PUT /api/calidad-faret-pallet/registros/:id`, `GET …/registros/:id/auditoria`; listados con `defectosDetalle`, `criticidadMax`, `cantidadEdiciones`, `ultimaEdicionFecha/Usuario/Motivo`; filtro `criticidad` |
| SQL `calidad_db` (SAP_NEW 192.168.1.230) | migración **011**: `dbo.inspecciones_faret_auditoria` (append-only, trigger de inmutabilidad) + GRANT por columna a `quality_control_backend_sql` (UPDATE columnas editables, DELETE solo defectos) |
| Frontend | `shared/inspecciones-edicion.js` (modal + historial), módulos `faret-inspecciones` y `faret-inspecciones-pallet` |

## Despliegue realizado (11-11-2026)
1. Migración 011 ejecutada por TI en SAP_NEW tras respaldo verificado (`C:\SQLBackups\calidad_db_pre011_20261111_144134.bak`).
2. Backend: 7 archivos copiados a `C:\API WEB\api\calidad` (hash origen=destino). Respaldo de los 5 originales en `_backup_20261111_edicion_inspecciones_faret`.
3. **`calidad-api` corre bajo PM2** (app `calidad-api`, cuenta `AD\Administrador`); se reinició solo esa app. La tarea `CalidadApi` está obsoleta. `fps-api` corre como tarea `FpsApi` (SYSTEM) y no se tocó.
4. Instalador `QualityControlCenter_Setup_v1.8.30.exe`, SHA-256 `AAA4D6632EEB37F81BAF108D557191014262F9A9B08BC9E05A61CE62EE88B077`, publicado en el share de updates; `latest.json` → 1.8.30 (respaldo `latest.backup-20261111-144909.json`).

## Reversión
Backend: restaurar los 5 archivos del respaldo, borrar los 2 nuevos, `pm2 restart calidad-api`. Desktop: restaurar `latest.backup-…` sobre `latest.json`. SQL: **no** usar el rollback 011 automáticamente (borra la bitácora); alternativa: restaurar el `.bak`.

## Pendiente de validar en producción
Edición real con ADMIN_TI/INSPECTOR sobre un registro autorizado (+ fila en la bitácora); 403 para CALIDAD/CONSULTA; auto-actualización en un cliente real; pantallas Pallet/Papel e INNPACK en ventana real; exportaciones en la app real.

## Decisiones técnicas a conservar
- Las lecturas (`GET`, incluida `/auditoria`) siguen en modo `observar` (`AUTH_CONSULTAS_MODO`); la edición exige token siempre. Decidir si la auditoría debe exigirlo.
- La cuenta SQL de la app no tiene DDL ni BACKUP: migraciones y respaldos los ejecuta el DBA.
- Nunca usar el rollback SQL de forma automática.
