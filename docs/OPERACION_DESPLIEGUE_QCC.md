# Operación y despliegue de Quality Control (QCC) — Runbook

Documento reutilizable. Reconstruido el 03-11-2026 a partir del despliegue real de REG-LAB-04 v2 / Photino 1.8.27 (comandos efectivos de esa jornada) y de `OPERACION.md` del repo API.
**No contiene credenciales ni tokens.** Lo que no pudo recuperarse está marcado **PENDIENTE DE DOCUMENTAR**.
Complementos: `.claude/DEPLOY_POLICY.md` (política), `docs/PLAN_DESPLIEGUE_REG_LAB_04_V2.md`, `docs/DEPLOY_FPS_API_LABORATORIO_REGISTROS.md`, `OPERACION.md` del repo `qualitycontrolinnpack_sqlserver_port` (API INNPACK).

## 1. Arquitectura y servidores

| Componente | Dónde | Cómo corre |
|---|---|---|
| Photino QCC (desktop) | Equipos de usuarios, `C:\Program Files\Quality Control Center\` | Se actualiza con `QCC.Updater` + tarea `QCCUpdaterElevado` (SYSTEM) |
| Repositorio de actualizaciones | `\\192.168.1.71\Programas TI\Programas\Quality Control Center\Qcontrol_Updates` | `latest.json` + `QualityControlCenter_Setup_vX.Y.Z.exe` |
| API INNPACK | `SRV-API.ad.faret.cl` (192.168.1.161), `C:\API WEB\api\innpack`, sitio IIS `API`, app `/innpack`, pool `QualityControlInnpackPool` (in-process .NET 8) | `https://api.faret.cl/innpack/api/...` (health: `/api/health`) |
| fps-api | SRV-API, `C:\API WEB\api\fps-api`, Node, puerto 3002, tarea programada `FpsApi` (SYSTEM) | `https://api.faret.cl/fps/api/...` (health `/api/health`; `/api/produccion/*` exige `x-api-key`) |
| SQL Server (calidad_db) | SAP_NEW `192.168.1.230`, base `calidad_db`, cuenta de la API `qcc_innpack_api_sql` (permisos por objeto) | |
| Respaldos de servidor | `C:\API WEB\_backups\<componente>_pre_<motivo>_<aaaammdd_hhmmss>` | |

Otros: 23 AppPools en SRV-API (baseline de hoy: 23/23 `Started`). La API Node `calidad` (tarea `CalidadApi`, puerto 3000) y las APIs Faret .NET son de otros repos: ver `CLAUDE.md` y memoria; no se tocan en un release de QCC INNPACK.

Repos: desktop `qualitycontrol_desktop_faret`; API `qualitycontrolinnpack_sqlserver_port` (rama `feature/laboratorio-reg-lab-04`; **no desplegar desde HEAD de otra rama sin revisar** qué incluye); fps-api `fps-api\fps-api` (**sin git**; carpeta `deploy-laboratorio-registros\` = paquete); web Java `qualitycontrol_web_faret` (fuera de este runbook).

## 2. Dependencias entre componentes (orden obligatorio)

SQL → API INNPACK → fps-api (si cambió) → instalador Photino → `latest.json` (SIEMPRE último).
- API sin la migración SQL: Laboratorio falla. SQL antes de API.
- Photino nuevo con API vieja: puede fallar o no filtrar. Photino al final.
- Cliente 1.8.26 contra API/SQL nuevas: verificado compatible (REG-LAB-04 v2).

## 3. Preparación de cada release

1. Confirmar el alcance (qué repos/componentes cambian). Solo se despliega lo que cambió.
2. Subir versión **en 3 propiedades** de `QualityControlCenter.csproj` (`Version`, `AssemblyVersion`, `FileVersion`; si falta alguna el auto-update entra en bucle), `installers/QualityControlCenter.iss` (`AppVersion`, `OutputBaseFilename`, línea comentada `;AppVerName`), texto de versión del sidebar en `src/UI/www/index.html` y `ID`/slides de `src/UI/www/shared/novedades.js`.
3. Comparar el número elegido con el `latest.json` **real del share** (no con el working tree): otra sesión pudo usar ese número.
4. Pruebas locales (E2E con LocalDB `QCC_LAB_TEST`, builds sin errores).
5. Autorización expresa del responsable (cada release).

## 4. Checklist previo (solo lectura)

- `latest.json` actual y el instalador vigente en el share.
- Hash del instalador local (`sha256sum`) y tamaño.
- WinRM: `powershell -NoProfile -Command "Test-WSMan -ComputerName SRV-API.ad.faret.cl -Authentication Kerberos"` (funciona **por hostname**, Kerberos, identidad `ad\dcarrasco`; por IP falla).
- Estado: pool `Started`, hashes de los archivos a reemplazar, 23/23 pools, espacio libre (`(Get-PSDrive C).Free/1GB`).
- Ventana sin ensayos "En curso" si hay migración (la verificación previa lo informa).

Patrón de comando remoto de solo lectura (una línea, sin scripts nuevos, sin `Bypass`, sin `c$`):
```
powershell -NoProfile -Command "Invoke-Command -ComputerName SRV-API.ad.faret.cl -ScriptBlock { Import-Module WebAdministration; Get-WebAppPoolState -Name QualityControlInnpackPool | Select-Object -ExpandProperty Value; (Get-FileHash 'C:\API WEB\api\innpack\QualityControlInnpack.Api.dll').Hash }"
```
Para varias órdenes con una sola sesión: `$s=New-PSSession -ComputerName SRV-API.ad.faret.cl` … `Remove-PSSession $s`. **No** usar `powershell -Command -` con stdin (no ejecuta y no avisa); pasar el bloque con `-Command "$(cat archivo)"` si es largo.

## 5. SQL (calidad_db en SAP_NEW)

**Quién:** el DBA/responsable con cuenta administrativa, manualmente en SSMS. Claude **no** tiene permisos DDL ni usa credenciales de la aplicación (política). La forma exacta de autenticación administrativa que usó el DBA el 03-11-2026 **PENDIENTE DE DOCUMENTAR** (no la ejecutó Claude).

Paquete preparado por Claude en `C:\Installers\Deploy_RegLab04v2_20261103\sql\` (con SHA-256): `2026_11_muestra_laboratorio_verificacion_previa_SOLO_LECTURA.sql`, `0_snapshot_integridad_SOLO_LECTURA.sql`, `2026_11_muestra_laboratorio_muestras_determinaciones.sql` (migración idempotente, solo agrega), `3_verificacion_posterior_SOLO_LECTURA.sql`. Rollback: `...determinaciones_rollback.sql` (se **niega** si hay datos nuevos; no ejecutar con datos).

Orden:
1. Verificación previa (solo lectura): 0 filas en los puntos de conflicto; columnas/tablas nuevas "pendiente"; SQL Server ≥ 2016.
2. Snapshot de integridad (conteo, `max_id`, `CHECKSUM_AGG` de `muestra_laboratorio` y `muestra_laboratorio_ensayos`).
3. Respaldo completo `COPY_ONLY` + `RESTORE VERIFYONLY` (con CHECKSUM). Sin esto no se continúa.
4. Migración (20 lotes el 03-11-2026, sin errores).
5. Verificación posterior: 12 columnas, 5 tablas, 14 GRANT de `qcc_innpack_api_sql`, snapshot **idéntico** al del paso 2.

Resultado 03-11-2026 (informado por el responsable): `muestra_laboratorio` 8 filas, max_id 39, checksum -245296453; `muestra_laboratorio_ensayos` 20 filas, max_id 106, checksum -1949579789; sin cambios tras migrar.
Gotchas: `qcc_innpack_api_sql` tiene permisos **por objeto** (toda tabla nueva necesita `GRANT`); SQL Server 2016 (compat 130, sin `STRING_AGG`); IDENTITY no es transaccional.

## 6. API INNPACK (SRV-API)

1. **Staging fuera del repo** (SDK 9.0.318; con otra versión el DLL cambia):
   `dotnet publish QualityControlInnpack.Api/QualityControlInnpack.Api.csproj -c Release -o <carpeta fuera del repo>`
   Solo se despliegan `QualityControlInnpack.Api.dll` y `.pdb`. No `.exe`, `web.config`, `appsettings*`, `*.rdlc`.
2. **Fase A (sin impacto):** crear `C:\API WEB\_backups\innpack_pre_<motivo>_<ts>` y `...\nuevo\`; copiar dll/pdb productivos a la carpeta de respaldo y comparar hash; subir los nuevos a `nuevo\` con `Copy-Item -Path <staging>\<archivo> -Destination <...\nuevo\archivo> -ToSession $s` y verificar hash = staging. (No usar `-Force` sobre `C:\API WEB`: el guardián local lo bloquea.)
3. **Fase B:** `Stop-WebAppPool -Name QualityControlInnpackPool` → copiar `nuevo\*` a `C:\API WEB\api\innpack\` → `Start-WebAppPool` → ~3 s. Solo este pool; nunca `iisreset`.
4. **Verificar:** hash en destino = staging; `GET https://api.faret.cl/innpack/api/health` = 200; evento Application `Application 'C:\API WEB\api\innpack\' started successfully`; 23/23 pools `Started`; rutas protegidas responden 401 sin token y rutas inexistentes 404.
5. **Reversión:** `Stop-WebAppPool` → copiar dll/pdb desde la carpeta de respaldo → `Start-WebAppPool` → health.

Referencia 03-11-2026: DLL anterior `415DE695…832A5` → nueva `5D5F8548…7C908` (1.665.536 B); PDB `21C9D055…CBE0` → `D08599CE…93D17`; respaldo `innpack_pre_reglab04v2_20261103_170420`; commit `9d8db26`.
ACL: si algún día falla con 500.19, ver la regla del ACE `IIS AppPool\<pool>:(OI)(CI)(RX)` en la memoria (`reference-deploy-apis-net-srv-api`): verificar `icacls` antes de copiar.

## 7. fps-api (SRV-API)

Servicio Node en `C:\API WEB\api\fps-api` (tarea `FpsApi`, SYSTEM, puerto 3002). Sin git, sin build: se copian los archivos cambiados. Paquete: `fps-api\fps-api\deploy-laboratorio-registros\src\...`; el `src\` local debe ser idéntico (comparar hash).
1. Validar localmente: `node --check <archivo>`; diff contra producción (copiar los de prod con `Copy-Item -FromSession` a un scratch) para confirmar que el cambio es solo lo esperado.
2. Respaldo: `C:\API WEB\_backups\fps-api_pre_<motivo>_<ts>\src\services|routes` + `nuevo\...`; hashes.
3. Subir a `nuevo\` con `Copy-Item -ToSession`; verificar hash.
4. `Stop-ScheduledTask -TaskName 'FpsApi'` → comprobar puerto 3002 sin listener → copiar → `Start-ScheduledTask -TaskName 'FpsApi'`. **Nunca** `taskkill /IM node.exe` ni los `.bat`/`.cmd` antiguos (dejarían el proceso fuera del Programador).
5. Health: tras el arranque el endpoint público da **502 durante ~8–20 s**; reintentar. `GET https://api.faret.cl/fps/api/health` = 200. Confirmar PID/StartTime nuevos (`Get-NetTCPConnection -LocalPort 3002 -State Listen`; usar `-ErrorAction SilentlyContinue` si el puerto está libre).
6. Rutas `/api/produccion/*` exigen `x-api-key`: Claude **no** puede leer el `.env` (el clasificador lo bloquea como exploración de credenciales y no se debe esquivar). Las pruebas autenticadas las ejecuta una persona con `!` (comando de solo lectura en `contex.md` Paso 114) o se hacen desde la app con sesión.
7. Reversión: `Stop-ScheduledTask` → restaurar los archivos del respaldo → `Start-ScheduledTask` → health.

Referencia 03-11-2026: `produccion.service.js` `E7BD39A1…5DA77` → `D3EEABCD…B7AA`; `produccion.routes.js` `8DD53B3B…BCD82` → `ACCB85A3…8DCA`; respaldo `fps-api_pre_laboratorio-registros_20261103_170839`; el cambio fue **solo aditivo** (ruta `GET /api/produccion/laboratorio/registros?np=`).

## 8. Empaquetado Photino

Desde la raíz del repo desktop (apuntar **siempre** al `.csproj`, nunca `dotnet publish` sin argumento: publicaría también `QCC.Updater` sin `PublishSingleFile` y dejaría un apphost inservible):
1. `dotnet publish QualityControlCenter.csproj -c Release -r win-x64 --self-contained true`
2. `"C:\Program Files (x86)\Inno Setup 6\ISCC.exe" installers\QualityControlCenter.iss` → `C:\Installers\QualityControlCenter_Setup_vX.Y.Z.exe`.
3. `QCC.Updater.exe` solo se republica si cambió su código: `dotnet publish QCC.Updater/QCC.Updater.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true`. Tamaño esperado del que va en el instalador: **67.523.636 bytes** (el `.iss` lo copia con `onlyifdoesntexist`).
4. Verificar: `sha256sum` y tamaño del instalador; versión de producto (`(Get-Item ...).VersionInfo.ProductVersion`); que el instalador se compiló **después** de la última edición de código.
Referencia 1.8.27: `QualityControlCenter_Setup_v1.8.27.exe`, 58.826.266 B, SHA-256 `65bc4cbc923756d345d32f00e659655270256e5de88fdf29fd548aa3c3de6990`.

## 9. Publicación en el updater (el orden importa)

Share: `\\192.168.1.71\Programas TI\Programas\Quality Control Center\Qcontrol_Updates`. Formato de `latest.json` (JSON en archivo válido, sin saltos de línea crudos dentro de valores):
```
{ "version": "X.Y.Z", "installer": "QualityControlCenter_Setup_vX.Y.Z.exe", "sha256": "<HEX MAYÚSCULAS>", "mandatory": false, "notes": "<una línea>" }
```
1. Respaldar: copiar `latest.json` a `latest.backup-<aaaammdd-hhmmss>.json` y comparar hash.
2. Copiar el instalador al share (no sobrescribir si ya existe) y verificar SHA-256 = local.
3. **Último paso:** escribir `latest.json` con la herramienta `Write` a un archivo local, validarlo (`node -e "JSON.parse(...)"`), copiarlo al share y revalidar leyéndolo **desde el share**, comprobando hash del instalador que nombra y `version` > versión instalada.
4. `mandatory:false` siempre (salvo decisión expresa): cada equipo acepta cuando quiera; no hay actualización simultánea.
Referencia 03-11-2026: respaldo `latest.backup-20261103-171441.json` (1.8.26); publicado 17:15.

Flujo en el cliente: `UpdateService` compara versión → copia el instalador a `C:\ProgramData\QualityControlCenter\setup.exe` → valida SHA-256 → relanzador no elevado → tarea `QCCUpdaterElevado` (SYSTEM) corre `QCC.Updater.exe` → instalación silenciosa → reabre la app. Logs/resultados: `C:\ProgramData\QualityControlCenter\Updater\results\result-<RunId>.json` y `...\Logs\Updater\`. Verificación real: abrir la app actualizada (ProductVersion `X.Y.Z+<commit>`, p. ej. el exe de esta PC arrancó 17:16:52 en 1.8.27).

## 10. Verificaciones posteriores

- API INNPACK y fps-api: health 200, hashes, 23/23 pools, evento "started successfully", sin errores nuevos.
- Rutas autenticadas: requieren sesión/JWT de usuario o la clave de fps-api → una persona o la propia app. **No** extraer tokens ni leer `.env`.
- Funcional (en la app, solo lectura primero): abrir una muestra existente, consultar NP 22924 y 4062 sin guardar, exportar Excel y PDF.
- No declarar "todos los equipos actualizados": `latest.json` solo habilita la actualización.

## 11. Reversión por componente

| Componente | Reversión |
|---|---|
| `latest.json` | Copiar el `latest.backup-*.json` encima. Los equipos ya actualizados **no** vuelven solos: reinstalar el `Setup` anterior (siguen en el share). |
| API INNPACK | §6 punto 5 |
| fps-api | §7 punto 7 |
| SQL | La migración es aditiva e idempotente; el rollback se niega con datos nuevos. No borrar datos nuevos de Laboratorio. Restaurar el `.bak` solo con decisión del DBA/responsable. |

## 12. Problemas conocidos y soluciones

- **Kaspersky `PDM:Trojan.Win32.Generic` (03-11-2026):** se disparó al lanzar un `.ps1` recién escrito con `-ExecutionPolicy Bypass` apuntado a `c$`. Falso positivo pendiente de Seguridad TI. Regla: comandos de una línea, sin `Bypass`, sin `c$`, sin scripts nuevos sin revisión; nada de exclusiones. 2.º evento: consultar el Programador de tareas por COM desde Claude dejó sin poder crear procesos → no hacerlo local.
- **Instalador heredado:** el `[Code]` del `.iss` ejecuta `powershell -ExecutionPolicy Bypass -File Set-QccUpdaterTaskAcl.ps1` en cada instalación (igual desde 1.8.4). Instalador **sin firma Authenticode**. Decisión de seguridad pendiente de TI (aceptar o reemplazar por SDDL embebido en un release posterior).
- **Clasificador de Claude Code:** bloquea lectura de `.env`/credenciales y a veces deploys productivos o `Copy-Item -Force` sobre `C:\API WEB`: no esquivar; dar el comando para que lo ejecute el usuario con `!`.
- **`-Command -` con stdin** no ejecuta (ver §4).
- **Colisión de versión:** otra sesión puede haber publicado ese número (pasó con 1.8.6 y 1.8.10).
- **Bump de versión incompleto** (falta `AssemblyVersion`/`FileVersion`): bucle de actualización.
- **`latest.json` con salto de línea crudo:** el updater falla en silencio.
- **fps-api tras reiniciar:** 502 transitorio de ~8–20 s.
- **GRANT por objeto** en SQL; **`USE calidad_db`** fijo en la migración.

## 13. Reglas de seguridad operacional

1. Autorización expresa del responsable por release; respetar las aprobaciones de Seguridad TI exigibles.
2. Nunca desactivar Kaspersky ni crear exclusiones; no ofuscar ni codificar comandos; si algo se bloquea, detenerse, conservar la evidencia y pedir revisión.
3. Sin `ExecutionPolicy Bypass` en comandos nuevos; sin `c$`/`admin$`; sin credenciales de aplicaciones para elevar privilegios.
4. Respaldo con hash antes de tocar producción; reinicio solo del pool/tarea afectado; nunca `iisreset`.
5. No ejecutar migraciones SQL sin permisos DDL autorizados (las ejecuta el DBA/responsable).
6. `latest.json` siempre al final y solo tras validar instalador y componentes.
7. No leer ni imprimir secretos; no documentarlos.
