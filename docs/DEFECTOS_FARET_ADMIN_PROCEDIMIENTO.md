# Administración de defectos y controles FARET — procedimiento de despliegue

Requerimiento de Andrés (Calidad FARET): administrar desde *Administración de planta* los defectos/controles de **Calidad/Producción**, **Control Pallet/Papel** y **Producto Terminado**, solo FARET. **Nada de esto está aplicado en producción**: este documento es el procedimiento para cuando se autorice.

## 1. Qué hace cada formulario y cómo se aísla

| Formulario | Fuente real | Qué se administra | Aislamiento |
|---|---|---|---|
| Calidad/Producción FARET | `calidad_faret_eventos` (010) | Crear (ID `ÁREA-NNN` siguiente, nunca reutilizado), editar nombre/criticidad/orden, dar de baja/reactivar | Tabla ya exclusiva de FARET. Triggers/CK de la 010 intactos: `*_origen` inmutables, sin DELETE, aprobación (un defecto pendiente no se activa desde el panel), bitácora `calidad_faret_catalogo_auditoria` con el usuario del panel (`SESSION_CONTEXT`). |
| Control Pallet/Papel FARET | `calidad_faret_pallet_preguntas` | Crear, editar texto/orden, dar de baja | Tabla exclusiva de FARET. Una pregunta ya respondida no cambia su texto (el histórico se lee por `pregunta_id`); reordenar y dar de baja sí. |
| Producto Terminado FARET | `parametros_control_visual` (**compartida con INNPACK**) | Crear/editar/baja de los defectos **propios de FARET** (Pegado=4, Termoformado=5). Los compartidos se ven como "Compartido con INNPACK" y no se pueden modificar | Nueva columna `empresa` (`NULL` = compartido, `'FARET'` = propio). INNPACK filtra `empresa IS NULL` en todo lugar que enumera defectos; FARET pide `?empresa=FARET`. El servidor además rechaza en el POST de PT un defecto propio de FARET en una inspección INNPACK. |

El único cambio estructural es `parametros_control_visual.empresa`: es imprescindible porque `registro_pt_hallazgo_defectos.defecto_id` tiene FK a esa tabla, así que un defecto propio de FARET **debe** vivir ahí, y la tabla también la lee INNPACK. Ocultarlo en pantalla no habría aislado nada.

## 2. Cambios por repositorio

- **`quality_control` (backend Node + Flutter)** — `backend/migrations/015_admin_defectos_faret.sql` (+ rollback + `migrations/tests/run_015_localdb.sh`); `adminPlanta.controller.js` (entidades `def_calidad`, `def_pt`, `chk_pallet`); `calidadFaretPallet.controller.js` (tolerancia del checklist); `catalogos.controller.js`, `control.controller.js`, `productoTerminado.controller.js` (filtro/validación por empresa); `lib/core/api/catalogos_api.dart` y `producto_terminado_form_page.dart` (piden el catálogo con la empresa elegida y lo recargan si cambia).
- **`qualitycontrolinnpack_sqlserver_port`** — `ProductoTerminadoRepository.ObtenerFiltros`: la lista de defectos filtra por empresa.
- **Desktop (este repo)** — `AdminPlantaHandler.cs`, `shared/admin-planta-base.js`, `modules/admin-planta/admin-planta.css`.

## 3. Pallet/Papel: formularios abiertos durante un cambio

La API exigía responder *exactamente* todas las preguntas activas, lo que rechazaría un formulario abierto antes de agregar una pregunta. Ahora (`validarChecklist`): una pregunta dada de baja mientras se llenaba se acepta; una pregunta creada hace menos de 240 min (`PALLET_PREGUNTA_NUEVA_TOLERANCIA_MIN`) puede faltar; toda pregunta vigente más antigua sigue obligatoria; una inexistente se rechaza. Usa `created_at` (ya existe: sin cambio estructural).

## 4. Orden de despliegue (cada paso con autorización explícita)

1. **Respaldo** de `calidad_db` y de los archivos a reemplazar (hash antes/después).
2. **SQL 015** (cuenta con DDL, la ejecuta el DBA): aditiva e idempotente, no toca filas. Otorga a `quality_control_backend_sql` solo `INSERT` + `UPDATE` por columna donde aplica. Verificar: `SELECT COUNT(*) FROM parametros_control_visual WHERE empresa IS NOT NULL` = 0.
3. **API `calidad`** (`calidad-api`, PM2): copiar los 5 controladores; reiniciar solo ese proceso.
4. **API INNPACK**: DLL+PDB de `ProductoTerminadoRepository` (staging fuera del repo, hash, pool `QualityControlInnpackPool`). **Debe ir después de la SQL 015** (la consulta usa la columna).
5. **Flutter**: web build (`flutter build web --release`) + APK nuevo (la app antigua sigue funcionando: sin `?empresa` recibe solo los compartidos).
6. **Instalador Photino** y `latest.json` al final.

Si se despliega la API antes que la SQL, `adminPlanta` de FARET y la consulta de filtros de PT fallan por columna inexistente; las pantallas actuales de INNPACK solo se ven afectadas en esa lista de filtros.

## 5. Reversión

- SQL: `015_admin_defectos_faret_rollback.sql` (retira permisos; borra la columna solo si no hay defectos FARET, para no perder datos).
- APIs: restaurar los respaldos del paso 1. Los defectos/preguntas creados se dan de baja desde el panel (los eventos no se pueden borrar por trigger).

## 6. Pruebas ejecutadas (sin tocar producción)

- SQL Server real (LocalDB, compat 130, DDL real + 009 + 010): `run_015_localdb.sh` → 29 PASS (migración idempotente, CHECK de empresa, permisos mínimos con `EXECUTE AS`, triggers y bitácora de eventos, UQ, aprobación, rollback con y sin datos).
- Backend Node: 109 pruebas OK (incluye tolerancia del checklist, aislamiento de PT por empresa y una **guarda de código** que falla si alguna consulta que enumera `parametros_control_visual` omite el filtro de empresa).
- Panel (Edge headless, módulo real + puente simulado): `tools/admin_defectos_arnes/run.sh test` → 27 OK; capturas en `tools/admin_defectos_arnes/evidencia/`.
- Flutter `analyze` sin errores nuevos; `dotnet build` desktop y API INNPACK sin errores.

## 7. Pendiente real antes de publicar

- Autorización explícita para los pasos 1–6 (nada se aplicó).
- Prueba en Photino real con sesión FARET ADMIN_TI contra una base de pruebas (el arnés usa un puente simulado).
- Tolerancia de 240 min: confirmar con Calidad.
- Los defectos compartidos de PT no se pueden editar desde FARET: si Calidad quiere renombrar uno, hay que duplicarlo como propio (decisión de negocio).
- Permisos finos: el rol `administrar` de la API admite cualquier rol de escritorio salvo CONSULTA; la restricción real por usuario es la matriz del QCC (limitación ya conocida de la 013).
