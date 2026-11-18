# Calidad NP (Mariela): preparación de despliegue y matriz de pruebas — 18-11-2026

Estado: **todo en local, commiteado, NADA desplegado ni ejecutado en producción.** Sin instalador ni `latest.json`.
Este documento prepara la aprobación; cada paso de producción lo ejecuta una persona (política Kaspersky/DEPLOY_POLICY) tras autorización explícita.

## 1. Qué hay y dónde (commits locales, sin push)

| Repo | Commit | Contenido |
|---|---|---|
| desktop `feature/laboratorio-reg-lab-04` | `de99093` | Módulos Balance y Mermas, Cierre de NP, Certificados de Destrucción + `CalidadNpHandler` + `calidad-np-base.js` (sin cablear) |
| desktop | `7984c06` | Trazabilidad integral 1a/1b + informe REG-SGI-TDP guardable + cableado (router, permisos, sidebar) + docs/herramientas de Fase 1a |
| API INNPACK `feature/calidad-np-mermas-cierre-destruccion` | `5949d5f`, `5c3e724` | Trazabilidad 1b (documentos SGI + factor), SQL y pruebas |
| API INNPACK | `91952f5` | Calidad NP: mermas, cierre, certificados (controlador, repositorio, SQL + rollback, 10 pruebas) |
| fps-api (sin git) | paquete `paquete_trazabilidad_fase1a_20261117` | 2 rutas aditivas `GET /api/produccion/trazabilidad/np\|lote` (ver `DEPLOY_FPS_API_TRAZABILIDAD_FASE1A.md`) |

**Fuera de los commits a propósito:** bump 1.8.36 (`.csproj`, `.iss`) y novedades (`novedades.js`) — son del instalador, que no se genera; `docs/image (10).png` borrado (ajeno); imágenes sueltas, `.claude/`, `CLAUDE.md.backup-*`, `__pycache__`, `tools/fps_api_despliegue_articulos` (release 1.8.33).
**Alertas Globales:** su worktree solo toca `FaretDashboard*`, `control-documental*.controller.js` y `faret-control-documental*.controller.js`; ningún archivo coincide con estos commits. Sin conflicto.
Verificado: desktop compila (0 errores), API 71/71 pruebas, JS con `node --check`, sin credenciales en lo commiteado.

## 2. SQL (lo ejecuta el DBA; calidad_db en SAP_NEW) — revisado

1. `2026_11_trazabilidad_documentos_factor_verificacion_SOLO_LECTURA.sql` (solo lectura, valida el estado previo).
2. `2026_11_trazabilidad_documentos_factor.sql` (Fase 1b: `trazabilidad_auditoria`, documentos, factor). Rollback: `..._rollback.sql`.
3. `2026_11_calidad_np_mermas_cierre_destruccion.sql` (**depende de 2**, usa `trazabilidad_auditoria`). Rollback: `..._rollback.sql`.

Seguridad/compatibilidad del script 3: solo `CREATE` de 7 tablas + 1 secuencia nuevas, todo con `IF OBJECT_ID(...) IS NULL` (idempotente, probado dos veces en LocalDB); **no toca ni lee ninguna tabla existente** (compatibles con los datos actuales; empieza vacío); semilla del flujo con `WHERE NOT EXISTS`; permisos por objeto a `qcc_innpack_api_sql` solo si el usuario existe, sin DELETE salvo el detalle de un certificado en borrador. Compatible SQL Server 2016 (sin STRING_AGG). Rollback hace DROP: usarlo solo si las tablas están vacías o tras respaldarlas.

## 3. Comparación local vs desplegado (a ejecutar por una persona, solo lectura)

- La rama API es lineal desde `54da0f1` (último despliegue, 17-11-2026, SDK 10.0.404). La diferencia contra producción son exactamente 3 commits: Trazabilidad 1b (2) y Calidad NP (1). No contiene trabajo no desplegado de otras ramas.
- Confirmar que producción es `54da0f1`: construir `54da0f1` con SDK 10.0.404 en carpeta de staging fuera del repo y comparar el hash de `QualityControlInnpack.Api.dll` contra `C:\API WEB\api\innpack\` (runbook §4). Si difiere: **detenerse** y averiguar qué hay en producción antes de copiar nada.
- fps-api: comparar hashes de `src\services\trazabilidad.service.js`, `src\routes\...` contra `respaldo_pre_trazabilidad_20261117`; el paquete 1a solo agrega.

## 4. Respaldos y reversión

| Componente | Respaldo previo | Reversión |
|---|---|---|
| SQL 3 / 2 | respaldo (BACKUP o `SELECT INTO`) si ya hay datos; vacías al inicio | scripts `_rollback.sql` en orden inverso (3 → 2) |
| API INNPACK | `C:\API WEB\_backups\innpack_pre_calidadnp_<ts>` (dll+pdb con hash) | restaurar dll+pdb respaldados; Stop/Start solo del pool `QualityControlInnpackPool` |
| fps-api | `C:\API WEB\_backups\fps-api_pre_trazabilidad_<ts>` | restaurar archivos; reiniciar solo tarea `FpsApi` |
| Desktop | no se instala nada (se prueba con `dotnet run`) | n/a |

Reglas: staging fuera del repo, copiar solo DLL+PDB, nunca `iisreset`, sin `ExecutionPolicy Bypass`, sin `c$`, sin leer `.env`/secretos.

## 5. Orden exacto de despliegue a aprobar

0. Prechequeo solo lectura (§3) y respaldos (§4).
1. **SQL** por el DBA: (1) verificación → (2) Trazabilidad 1b → (3) Calidad NP.
2. **API INNPACK** (pool `QualityControlInnpackPool`): DLL+PDB de `91952f5`. Verificar health 200, 23/23 pools, rutas nuevas 401 sin token.
3. **fps-api** (tarea `FpsApi`): paquete 1a aditivo. Verificar `/api/produccion/trazabilidad/np` (401 sin clave) y que las rutas previas siguen igual. (Sin este paso, balance, cierre y certificados no cargan datos de FPS/SAP: todos usan `trazabilidad.integral`.)
4. **Pruebas reales** con el desktop local (`dotnet run` desde `7984c06`), sin instalador.
5. Recién con las pruebas aprobadas: decisión sobre instalador 1.8.36 y `latest.json` (no autorizado aún).

## 6. Matriz de pruebas funcionales (NP reales)

Usuarios: ADMIN_TI/admin (aprobador), usuario con EDITAR, con VER, con SIN_ACCESO. Elegir NP: una con 1 ítem y proceso completo, una multi-ítem, una con rechazos en QCS (cuarentena/destrucción), una sin factor confirmado.

| # | Módulo | Prueba | Resultado esperado |
|---|---|---|---|
| 1 | Trazabilidad | NP 1 ítem: integral + informe PDF + "Guardar versión" ×2 | PDF "borrador 0" con advertencias; versiones 1 y 2 en `np_informe`, auditoría registrada |
| 2 | Trazabilidad | Fuente caída (apagar FPS en pruebas) | "No disponible", nunca 0 |
| 3 | Balance | NP 1 ítem con factor CONFIRMADO | entrada/salida por proceso; equivalentes = pliegos×factor; "BALANCE PROVISIONAL" visible |
| 4 | Balance | Sin factor / multi-ítem | sin conversiones; advertencia; Calidad/Despacho por ítem |
| 5 | Balance | Diferencia positiva | "POR CONCILIAR", no se clasifica como merma |
| 6 | Mermas | Crear CONTADA, MEDIDA, ESTIMADA con evidencia; vincular defecto de Calidad | KPIs separan confirmada/estimada; duplicado de defecto vinculado rechazado |
| 7 | Mermas | Corregir sin justificación / con ella; anular con motivo | exige justificación/motivo; fila conservada; auditoría con antes/después |
| 8 | Mermas | Validar con usuario no admin | 403 (API) |
| 9 | Cierre | Cierre BORRADOR → CERRADO con diferencia pendiente | exige observación; nueva versión por guardado; historial intacto |
| 10 | Cierre | Origen MANUAL sin responsable | rechazado |
| 11 | Cierre | Excedente de producción | CONCILIADO; Excel/PDF coherentes con pantalla |
| 12 | Certificados | Crear desde merma, detalle ≠ total | rechazado; igual si supera saldo de la merma |
| 13 | Certificados | Solicitar → aprobar (admin) → emitir | correlativo `CD-AAAA-NNNNN`; emitir sin aprobar bloqueado |
| 14 | Certificados | Rechazar sin motivo / con motivo; reeditar | exige motivo; vuelve a editable |
| 15 | Certificados | Anular emitido; anular uno ejecutado | permitido el primero con motivo; ejecutado bloqueado; correlativo no se reutiliza |
| 16 | Certificados | Confirmar ejecución física | "ejecutada" distinto de emitido; PDF lo refleja; sin descuento en SAP |
| 17 | Permisos | VER / SIN_ACCESO en los 3 módulos | VER: solo lectura, botones ocultos y escritura rechazada; SIN_ACCESO: módulo oculto |
| 18 | Auditoría | Revisar `trazabilidad_auditoria` tras 6–16 | una fila por acción con usuario del JWT, fecha y valores |
| 19 | Documentos | PDF/Excel de cada módulo | rotulados provisional; sin cifras definitivas |

## 7. Pendientes funcionales (mantener visibles; nada se presenta como definitivo)

- **Plantillas oficiales** REG-SGI-TDP y REG-SGI-CDD-V11: hoy estructura provisional.
- **Aprobadores reales** de certificados: hoy solo admin/admin_ti; flujo sembrado Jefatura de Calidad → Ejecutivo Comercial → Gerencia Comercial es provisional (se cambia con `UPDATE` en `cert_destruccion_flujo`, sin código).
- **Significado de pallets** (rojo/azul/unidades, y `U_Numero_Pallet` en despachos): sin definición oficial; campo informativo.
- **Limitaciones de FPS**: no asigna procesos por ítem de la nota de venta (NP multi-ítem sin entrada/diferencia de producción); cantidades declaradas por el operador; sin fuente de material retenido ni reproceso ("No disponible"); factor unidades/pliego requiere confirmación humana.
- Cantidad fabricada del cierre: por defecto liberada QCS (confirmar criterio con Calidad).
- Sin probar contra datos reales ni en Photino hasta ejecutar §5.
