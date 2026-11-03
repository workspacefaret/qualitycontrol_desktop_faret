# REG-LAB-04 v2 — Plan de despliegue supervisado y reversión

Estado: **PREPARADO, NO EJECUTADO**. Nada de este documento autoriza cambios en producción. Cada paso necesita la autorización
explícita del responsable. Preparado el 03-11-2026 (commits: desktop `335d3a7`+ajuste de novedades, API INNPACK `6bce371`+verificación SQL,
Java `c5fe3ce`, fps-api sin git: paquete `deploy-laboratorio-registros`).

## 0. Reglas de ejecución (política de seguridad vigente)
- Lo ejecuta **una persona** (no Claude) revisando antes cada comando/script. Sin `-ExecutionPolicy Bypass`, sin recursos administrativos
  (`c$`/`admin$`), sin ofuscación, sin desactivar antivirus ni crear exclusiones. Si Kaspersky bloquea algo: **detener**, conservar evidencia,
  avisar a Seguridad TI y no reintentar por otra vía.
- La clasificación de las alertas previas (03-11-2026) la decide Seguridad TI; que no aparezcan alertas nuevas **no** es una aprobación.
- Orden obligatorio: **SQL → API INNPACK → fps-api → Desktop piloto → validación → updater general**. El orden SQL→API es seguro hacia atrás
  (columnas nuevas NULL y tablas nuevas no afectan al API/desktop actuales); API→SQL **no** (el API nuevo lee `largo_nominal_mm`… y falla todo Laboratorio).
- Una ventana sin ensayos en curso (la verificación previa lista ensayos "En curso" y la fecha del último).

## 1. Versiones y estado de repos (verificado en solo lectura)
| Componente | Origen | Estado |
|---|---|---|
| Desktop | rama `feature/laboratorio-reg-lab-04` = `main` (1.8.26, `e78cf36`) + 13 commits de Laboratorio | árbol limpio salvo fotos ajenas de `docs/` (no incluir) |
| API INNPACK | rama `feature/laboratorio-reg-lab-04` = baseline desplegado (8f11721 + cherry-picks de Planificación `3ae5710` y NC Operador `9cb8872`) + Laboratorio. **No** incluye "actor delegado" (sigue sin desplegar, a propósito) | limpio |
| Java (QCC Web) | `feature/laboratorio-reg-lab-04-v2` `c5fe3ce` | 1162 pruebas, 0 fallas; **no necesario para esta ventana** |
| fps-api | `deploy-laboratorio-registros` (service `d3eeabcd…`, routes `accb85a3…`); servidor aún en `e7bd39a1…` / `8dd53b3b…` (re-verificar) | sin git, sin desplegar |
| `latest.json` (share, leído) | **1.8.26** (`6ED00F14…AA04`) — no existe `Setup_v1.8.27.exe` en el share | 1.8.27 sigue libre; **re-comprobar el día del despliegue** |

## 2. Paquete desktop local (aislado, NO publicado)
`C:\Installers\QualityControlCenter_Setup_v1.8.27.exe` — 58.826.266 bytes — SHA-256 `65bc4cbc923756d345d32f00e659655270256e5de88fdf29fd548aa3c3de6990`
(compilado el 03-11-2026 16:26 con `dotnet publish QualityControlCenter.csproj` explícito + ISCC; contiene `RegLab04Html`, `muestraLab.exportarPdf`,
`mlbBtnPdf`, novedades 1.8.27). `QCC.Updater.exe` no se republicó (67.527.732 bytes, single-file). No se instaló ni se subió al share.
Si se toca cualquier archivo del desktop antes del despliegue hay que recompilar y recalcular el hash.
Integridad disponible: SHA-256 en `latest.json` validado por `QCC.Updater` (`PackageValidator`). **No hay firma Authenticode** (no hay certificado:
comentario en `PackageValidator.cs`); el instalador sin firmar es un factor de riesgo ante Kaspersky → el piloto (paso 9) se instala manualmente y
Seguridad TI decide antes de la publicación general.

## 3. Respaldo previo (paso 1, solo lectura/copia)
1. **BD `calidad_db`**: respaldo completo `COPY_ONLY` hecho por el DBA (o confirmar el último respaldo con hora posterior a la última escritura de
   Laboratorio). Evidencia: nombre del `.bak`, tamaño y `RESTORE VERIFYONLY` OK. *Sin este respaldo no se continúa.*
2. **Instantánea de integridad** (ejecutar y guardar el resultado; es solo `SELECT`):
```sql
SELECT 'muestra_laboratorio' t, COUNT(*) filas, MAX(id) max_id, CHECKSUM_AGG(CHECKSUM(id, np, estado)) chk FROM dbo.muestra_laboratorio
UNION ALL SELECT 'muestra_laboratorio_ensayos', COUNT(*), MAX(id), CHECKSUM_AGG(CHECKSUM(id, muestra_id, tipo_ensayo, estado)) FROM dbo.muestra_laboratorio_ensayos;
```
3. **Verificación previa** `Sql/2026_11_muestra_laboratorio_verificacion_previa_SOLO_LECTURA.sql` en SSMS (la corre el usuario). Debe dar: puntos 1/5/6/10/11 con 0 filas; las 12 columnas y 5 tablas nuevas "pendiente"; SQL Server ≥ 2016.
4. **API actual**: copiar `QualityControlInnpack.Api.dll/.pdb` vigentes del servidor a `C:\API WEB\_backups\innpack_pre_reglab04v2_<fecha>\` y anotar su SHA-256 (es la imagen de reversión).
5. **fps-api**: respaldo de los 2 archivos (ver `DEPLOY_FPS_API_LABORATORIO_REGISTROS.md` §4).
6. **latest.json** actual: copia con marca de tiempo en el share (`latest.backup-<aaaammdd-hhmmss>.json`).

## 4. Pasos con puntos de control
| # | Paso | Prerrequisitos | Acción concreta | Evidencia esperada | Continuar si… | Detener si… | Reversión |
|---|---|---|---|---|---|---|---|
| 1 | Verificar respaldos | autorización; ventana | ejecutar §3 completo | `.bak` verificado, instantánea guardada, DLL/fps/latest respaldados, verificación previa limpia | todo lo anterior OK | falta cualquier respaldo o la verificación previa da filas inesperadas | n/a (solo lectura/copias) |
| 2 | Migración SQL | paso 1 OK; sin ensayos en curso | SSMS (usuario con permisos): ejecutar `2026_11_muestra_laboratorio_muestras_determinaciones.sql` (aditiva, idempotente: ADD COLUMN nullable/DEFAULT, 5 tablas nuevas, 5 GRANT; **no hay UPDATE/DELETE/DROP sobre datos existentes**) | lista final de columnas/tablas = "existe"; instantánea §3.2 **idéntica** en filas/max_id/checksum | misma instantánea y sin errores | cualquier error del script o instantánea distinta | `…_rollback.sql` (rechaza si ya hay datos nuevos). Con datos nuevos NO se borra nada: se revierte solo el API (paso 3) y las tablas quedan. Las columnas/tablas vacías son inocuas para la versión anterior |
| 3 | API INNPACK | paso 2 OK | publicar a staging **fuera del repo**; copiar solo DLL+PDB; `Stop-WebAppPool QualityControlInnpackPool` → copiar → `Start-WebAppPool` (ACL antes de copiar); hash de la DLL = hash del staging | `GET api/muestra-laboratorio/ensayos-muestras/config` 200 con RCT/Cobb `DeterminacionesMaximas=20`, ECT 5; `…/catalogos` 200; NC list con `operador` y `api/trazabilidad/planificacion` siguen 200 (regresión del baseline) | smoke test OK y listado de muestras histórico igual (mismos ids/conteos) | 5xx, conteos distintos o regresión NC/Trazabilidad | restaurar DLL+PDB respaldados (§3.4), reiniciar el pool; SQL queda aditivo |
| 4 | fps-api | paso 1.5 OK; autorización propia | seguir `DEPLOY_FPS_API_LABORATORIO_REGISTROS.md` (respaldo, hash, reinicio solo `FpsApi`) | pruebas §5 de ese documento: NP 22924 y 4062 → misma orden (OT 22924, cliente `INNPACK SpA-COMERCIAL SM EXPORT LTDA.`), 9 procesos (ítems 1-3 × Corrugado/Emplacado/Troquel), 17 registros (ítem 2: Emplacado 5, Troquel 7); 404/400/401 | idéntico a lo esperado + regresión de `procesos-por-np`, `registros-por-proceso`, `pilas-dimensionado`, `liberaciones`, `despachos` | cualquier regresión | copiar de vuelta los 2 archivos y reiniciar `FpsApi` |
| 5 | Validar endpoints reales | pasos 3 y 4 | desde un PC con Desktop **viejo (1.8.26)**: abrir Laboratorio - Muestras y Trazabilidad | siguen funcionando (compatibilidad hacia atrás) | OK | falla algo del desktop viejo | reversión de los pasos 4 y 3 |
| 6 | Java (QCC Web) | **solo si corresponde** | **No incluir en esta ventana.** `c5fe3ce` solo acepta las 3 dimensiones nominales; la web no tiene Excel/PDF REG-LAB-04 (ver contrato) | — | — | — | — |
| 7 | Instalar Desktop piloto | pasos 3-5 OK; paquete §2 con hash verificado | **instalación manual** del `.exe` en 1–2 PC (p. ej. el de Mariela y el de TI); **no** tocar `latest.json` | versión 1.8.27 en la barra lateral; ventana de novedades 1.8.27; no se auto-actualiza otro equipo | arranca y abre Laboratorio | Kaspersky bloquea o alerta → detener y escalar | desinstalar/reinstalar `Setup_v1.8.26.exe` (está en el share) |
| 8 | Pruebas funcionales (piloto) | paso 7 | checklist §5 | 100 % OK | todo OK | cualquier ítem crítico falla | reversión del piloto + paso 3 si el fallo es de API |
| 9 | Validación con Mariela | paso 8 | demo con control real: Excel y PDF REG-LAB-04, RCT/Cobb con N probetas, dimensiones | aceptación escrita | aprueba | observaciones que cambian datos/cálculos | ajustar en desarrollo; no publicar |
| 10 | Publicación general | pasos 8-9 aprobados + Seguridad TI | subir instalador al share (hash local = share), re-leer `latest.json` real, activar `latest.json` (JSON válido, una sola línea por campo, ver gotcha Paso 43) | clientes 1.8.26 detectan y actualizan; QCC.Updater registra el resultado | piloto sin incidentes ≥ el plazo acordado | reportes de errores/alertas | restaurar `latest.backup-<…>.json` (los clientes ya actualizados quedan en 1.8.27: reinstalar 1.8.26 solo si hay fallo funcional) |

## 5. Checklist funcional del piloto (paso 8)
1. 11 ensayos (Humedad ×3 métodos, Gramaje, Espesor, Cobb, RCT, FCT, ECT, BCT medido, Filtración) crean/guardan/recuperan.
2. RCT/Cobb con 1, 3 y más probetas; promedio solo con válidas; ECT exige 5.
3. Corrección y anulación conservan historial; muestras eliminadas no desaparecen del informe.
4. Control **histórico** (creado antes de la migración) se abre, se exporta (Excel/PDF) y su informe anterior sale igual.
5. Nueva Muestra con NP 22924 (Faret) y 4062 (Innpack): orden, cliente, formato, OC y antecedentes cuando FPS los trae; vacíos y **editables** cuando no; dimensiones nominales a mano; tipo de onda manual.
6. Exportar Excel REG-LAB-04 (abrir en Excel real) y Exportar PDF REG-LAB-04 (diálogo "Guardar como PDF" en Photino real): mismos valores; paginación y tamaño A4.
7. "Generar informe" anterior sin cambios. Configuración de métodos (Cobb: cara/tiempo).
8. Permisos: usuario con VER no puede guardar/eliminar; sí puede exportar.

## 6. Riesgos y pasos no reversibles automáticamente
- **Datos nuevos**: una vez que se usa el modelo de muestras, el rollback SQL se niega a borrar (protección deliberada). La reversión es de aplicación (API/desktop anteriores); las tablas nuevas no afectan a la versión previa. Los registros históricos no se tocan (la migración no ejecuta UPDATE/DELETE sobre filas existentes).
- `ALTER TABLE … ADD … NOT NULL DEFAULT` (`modelo_muestras`, `revision`) sobre `muestra_laboratorio_ensayos` toma bloqueo de esquema breve: ejecutar sin ensayos en curso; el volumen lo informa la verificación previa (punto 13).
- fps-api y el reinicio de su tarea interrumpen unos segundos Talleres Externos/Trazabilidad/Despachos.
- Instalador sin firma digital + alertas Kaspersky previas: depende de Seguridad TI.
- La web (Java) no soporta `muestraLab.exportarExcel/exportarPdf`: si la web sirve este mismo `www`, esos botones fallarán allí (ver contrato).

---

## Anexo: despliegue GENERAL (sin piloto) — 03-11-2026

Instrucción del responsable: no hay piloto en un equipo; la actualización es general por el actualizador corporativo. Java Web queda para una fase posterior.

### A. Coexistencia 1.8.26 / 1.8.27 (verificada localmente, LocalDB `QCC_LAB_TEST`, sin tocar producción)
Cliente **1.8.26 real** (`git archive e78cf36 src/UI/www`) contra la API y el SQL nuevos, vía el `MuestraLaboratorioHandler` real:
- Abre el detalle de una muestra; renderiza la tabla de ensayos **con ensayos del modelo nuevo** (Humedad Termobalanza, Espesor) sin errores JS; `generarInforme()` funciona.
- Guardados con payload 1.8.26: humedad, gramaje, cobb, espesor, ect y bct-medido → todos OK. Alta de muestra sin campos nuevos y listado → OK.
- Única "falla" del arnés fue un dato de prueba mío (valor de la cara de Cobb), no una incompatibilidad.
- SQL: solo agrega columnas con DEFAULT/NULL y tablas nuevas (sin UPDATE/DELETE/DROP): el cliente viejo no las usa y sigue leyendo lo histórico. Orden obligatorio SQL → API (API sin SQL rompe Laboratorio).
- Conclusión: no se detectó incompatibilidad. Lo que un 1.8.26 **no** hace: editar/continuar ensayos del modelo nuevo ni ver sus determinaciones (los ve como una fila de resultado). Recomendación operativa: que quienes registren Humedad/Espesor/Gramaje/BCT/Cobb/RCT/FCT/ECT se actualicen primero (el equipo de Laboratorio), para no mezclar modelos sobre una misma muestra.

### B. Actualizador (revisión de código, sin cambios respecto de 1.8.26)
- `latest.json` actual = 1.8.26 con `mandatory:false`: cada equipo detecta, copia el instalador, valida SHA-256 (`PackageValidator`, recalculado sobre el archivo real) y lo instala en forma silenciosa vía la tarea `QCCUpdaterElevado`. No exige actualización simultánea; los equipos abiertos quedan en 1.8.26 hasta aceptar la actualización.
- `UpdateService`, `QCC.Updater`, `.task.xml` y `Set-QccUpdaterTaskAcl.ps1` **no cambian** entre 1.8.26 y 1.8.27 (solo versión en `.csproj`/`.iss`). El mecanismo ya está validado en producción desde 1.8.4 (1.8.26 confirmada en equipos reales).
- Rollback a 1.8.26: `QualityControlCenter_Setup_v1.8.26.exe` sigue en el share; restaurar `latest.json` desde el respaldo con timestamp. Un cliente que ya instaló 1.8.27 no baja solo: se reinstala el 1.8.26 manualmente (los datos están en SQL, no en el equipo).

### C. ⚠ Hallazgo de seguridad para Seguridad TI (preexistente, no nuevo)
`installers/QualityControlCenter.iss` ([Code], `RegisterUpdaterTask`) ejecuta `powershell.exe -NoProfile -ExecutionPolicy Bypass -File Set-QccUpdaterTaskAcl.ps1` en cada instalación para ajustar el SDDL de la tarea. Es el mismo mecanismo que 1.8.4–1.8.26, pero choca con la política vigente (sin `-ExecutionPolicy Bypass`) y con la detección PDM de Kaspersky. Opciones a decidir por Seguridad TI (no se cambió nada): (1) aceptarlo expresamente por ser un script fijo, empaquetado y sin entrada externa; (2) reemplazarlo en un release posterior por el SDDL embebido en el `.task.xml`/`schtasks` (requiere nuevo instalador y nueva prueba E2E). El instalador **no está firmado** (Authenticode): decisión pendiente de Seguridad TI antes de publicar.

### D. Detección de equipos fallidos / aún en 1.8.26 (sin telemetría ni servicios nuevos)
Infraestructura existente: cada equipo deja `C:\ProgramData\QualityControlCenter\Updater\results\result-<RunId>.json` y logs en `...\Logs\Updater\` con el resultado del último intento. No hay recolección central y **no se usarán recursos administrativos (`c$`)**. Procedimiento propuesto: (1) TI consulta la versión instalada con su inventario corporativo/GPO ya aprobado; (2) en equipos sospechosos, una persona revisa el `result-*.json` más reciente; (3) la tabla `muestra_laboratorio` permite ver si hay usuarios aún con 1.8.26 solo indirectamente (no registra versión): no se agregará telemetría.

### E. Orden de despliegue general (cada paso con autorización específica)
1) Respaldo SQL verificado (DBA) → 2) migración SQL + verificación → 3) API INNPACK (DLL+PDB) → 4) fps-api (autorización independiente, ver `DEPLOY_FPS_API_LABORATORIO_REGISTROS.md`) → 5) verificación de servicios con lecturas → 6) `latest.json` a 1.8.27 → 7) monitoreo → 8) validación funcional con registros reales (NP Faret 22924, NP Innpack 4062) → 9) cierre.
