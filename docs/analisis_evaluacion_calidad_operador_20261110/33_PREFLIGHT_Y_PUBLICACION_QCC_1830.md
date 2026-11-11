# 33 — Preflight y publicación controlada de QCC 1.8.30 (11-11-2026)

Estado: **todo lo local está verificado y empaquetado. Me detengo antes del primer cambio productivo.**
Sin commit, push, despliegue, reinicio, SQL ni publicación.

## 1. Estado de partida (verificado, no supuesto)

| Hecho | Verificación hoy |
|---|---|
| Publicada 1.8.29 | `latest.json` del share: `version 1.8.29`, sha `406F54F6…7D1D` |
| Instalador 1.8.30 | `C:\Installers\QualityControlCenter_Setup_v1.8.30.exe`, 58.866.664 bytes, SHA-256 `32162ed38d92a270ce2edde5ee1d256c6503be991150d232ac94b88567a277f2` (**coincide**) |
| ¿Corresponde al código probado? | Ningún archivo de `src/`, `QualityControlCenter.csproj`, `installers/` ni `config.json` es posterior al instalador (11-11 09:02). Después solo cambiaron `tools/` y `docs/`, que no forman parte del paquete. El ejecutable publicado dice FileVersion 1.8.30. |
| Validación real FARET | 13/13 PASS (doc 32 §11) con el ejecutable 1.8.30 publicado |
| Pruebas | C# 159/159, Python 84/84 (doc 32 §7) |

## 2. Preflight

| # | Requisito | Resultado |
|---|---|---|
| 1 | Cambios Git aislados | Ver §7. Hay cambios **ajenos** a esta fase: borrado de `docs/image (10).png`, imágenes nuevas en `docs/`, `CLAUDE.md.backup-…` y `.claude/`. No se tocan ni van en el paquete. En `mejoracontinua.api`, `bin/`, `obj/`, `MejoraContinua.Api/publish/` y `migration/*` son ajenos; solo se despliega DLL + PDB. |
| 2 | Integridad del instalador | SHA-256 coincide (§1) |
| 3 | Salud de las APIs (11-11) | `qualitycontrol/api/health` 200 · `mejora-continua/api/no-conformidades` 200 · `calidad/api/calidad-faret/resumen` 200 · `innpack/api/health` 200 · `fps/api/health` 200 |
| 4 | Archivos que cambian | §3 y §4 |
| 5 | Dependencias | Photino 1.8.30 **no depende** del despliegue de Mejora Continua. Usa endpoints ya productivos (`qualitycontrol` `GET api/importaciones/pnc`, `mejora-continua` `GET`). INNPACK sin cambios de API. |
| 6 | Respaldos recientes del servidor | **Pendiente de ejecución por una persona** (política del proyecto: los prechequeos remotos los ejecuta una persona, sin `c$` ni `-ExecutionPolicy Bypass`). Comando en §5. |
| 7 | Rollback por componente | §6 |
| 8 | Sin depuración remota abierta | **NO CUMPLE al cierre de esta revisión:** `127.0.0.1:9333` sigue en LISTENING (PID 44336, WebView2 de la ventana Photino de la validación, proceso 48944). El usuario debe cerrar esa ventana. No se cerró desde aquí para no cortar su sesión. |

**No se inicia ningún despliegue mientras 6 y 8 no estén resueltos.**

## 3. API Mejora Continua — paquete listo, no desplegado

- **Cambio:** `NoConformidadRepository.Crear` agrega `fecha_creacion = GETDATE()` al INSERT. El INSERT queda con 16 columnas y 16 valores (verificado).
- **Incluye además** el commit `2fce16d` (Bloque 4G, en `main` desde el 02-09 y nunca desplegado): `POST api/no-conformidades` sin `fechaDeteccion` responde **400** en vez de 500. Los dos consumidores reales (este desktop y workspacefaret) siempre la envían, así que no cambia nada para ellos. Su propio commit dice que corresponde llevarlo en el próximo despliegue.
  - `97d9d30` solo agrega un script de `migration/`, no código.
- **Compatibilidad SQL Server:** `fecha_creacion DATETIME2(0) NULL` (`bloque4b_ejecutar.sql`). `GETDATE()` ya se usa en el cierre del mismo repositorio. No hay DDL, no hay cambios destructivos y los datos existentes no se tocan.
- **Contratos:** ningún controller, DTO ni modelo cambió respecto de HEAD; los SELECT y filtros no cambian. Efecto visible: las NC nuevas devuelven una `fechaCreacion` real en lugar de `0001-01-01`.
- **Regresión:** compila en Release con 0 errores. El repositorio no tiene suite de pruebas automatizadas. La prueba funcional se hace al desplegar (§8, paso 3).
- **Paquete** (`<scratchpad>\f33\paquete_mejora_continua\`, con `SHA256SUMS.txt`):

| Archivo | SHA-256 |
|---|---|
| `MejoraContinua.Api.dll` (120.320 B) | `c0e6cdccb96e805f348038eeb90041f8a7836d51f7094fe01e633d7c93b37ad8` |
| `MejoraContinua.Api.pdb` (60.024 B) | `72e472514b8fdee01ad8b6775935b1aec040ef99935c26b734b67f036b46b97c` |

  Comprobado dentro del DLL: contiene el INSERT con `fecha_creacion` y la validación 4G. Destino: `SRV-API` `C:\API WEB\api\mejora-continua\` (pool `MejoraContinuaPool`). **No copiar** `appsettings*.json` ni la carpeta `publish/` anidada.
- **Precaución de preflight:** confirmar que el DLL productivo corresponde a `b3e3d17` (corte del 02-09). Si alguien desplegó otra cosa después sin commitear, este paquete la revertiría. El comando de §5 entrega su hash y fecha para compararlos.

## 4. Photino 1.8.30 — instalador listo, no publicado

- **Contenido:** Inicio FARET corregido; módulo `faret-evaluacion-operadores` (oculto por defecto; ADMIN_TI o VER individual; el backend lo valida); frontend de evaluación unificado (INNPACK sin cambios funcionales); novedades 1.8.30 (FARET 2 ventanas, INNPACK 1 ventana neutra, sin ventanas vacías); fecha "Sin dato" en `faret-nc`.
- **Validado:**
  - Dashboard y Evaluación FARET con datos reales: 13/13.
  - Evaluación INNPACK: regresión visual sin errores y pruebas del motor. Sin sesión INNPACK real en esta fase.
  - Autorización ADMIN_TI real; VER, SIN_ACCESO y CONSULTA+VER con pruebas de `PermisosService`.
  - Versión 1.8.30 en exe, sidebar y novedades.
- **Actualizador:**
  - `QCC.Updater.exe` no cambia (67.527.732 B, `onlyifdoesntexist`).
  - `latest.json` en una sola línea por campo, validado con `JSON.parse`, y el hash se compara sin distinguir mayúsculas.
  - **Candidato listo y no publicado:** `<scratchpad>\f33\latest.json.candidato` (version 1.8.30, installer `QualityControlCenter_Setup_v1.8.30.exe`, sha en mayúsculas, `mandatory:false`).
- **Seguridad del contenido publicado:**
  - Sin JWT, tokens ni snapshots (`auditoria*`, `fps_historico`, `conciliacion*`) en `publish/`.
  - `config.json` mantiene las credenciales por instalación que ya existían (MySQL, AppKey, ApiKey, cuenta de servicio): no cambió en esta versión ni se rotan (decisión vigente).
  - (redactado) la contraseña de prueba solo aparece en un comentario histórico de `faret-usuarios.controller.js`.
  - El módulo FARET y el Inicio solo hacen GET; no modifican NC ni Data.
  - FPS se informa como no disponible: no hay atribución.
  - La salida de conciliación con nombres está solo en el scratchpad, fuera de Git. En las carpetas sin versionar solo hay un CSV de máquinas y un JSON de configuración, sin nombres ni claves.

## 5. Preflight remoto (lo ejecuta una persona; solo lectura)

```powershell
Invoke-Command -ComputerName SRV-API.ad.faret.cl -ScriptBlock {
  Import-Module WebAdministration
  Get-WebAppPoolState -Name MejoraContinuaPool | Select-Object -ExpandProperty Value
  Get-Item 'C:\API WEB\api\mejora-continua\MejoraContinua.Api.dll' | Select-Object Length, LastWriteTime
  (Get-FileHash 'C:\API WEB\api\mejora-continua\MejoraContinua.Api.dll').Hash
  (Get-ChildItem IIS:\AppPools | Where-Object { $_.State -eq 'Started' }).Count
  [math]::Round((Get-PSDrive C).Free/1GB,1)
  Get-ChildItem 'C:\API WEB\_backups' -Directory | Sort-Object LastWriteTime -Descending | Select-Object -First 3 Name, LastWriteTime
  icacls 'C:\API WEB\api\mejora-continua' | Select-String MejoraContinuaPool
}
```

Criterios para seguir:
- pool `Started`;
- DLL productivo con fecha cercana al 02-09 (sin despliegues posteriores no registrados);
- 23/23 pools;
- más de 2 GB libres;
- ACE `IIS AppPool\MejoraContinuaPool:(OI)(CI)(RX)` presente.

En el share: `latest.json` = 1.8.29 (ya verificado) y el instalador 1.8.29 presente.

## 6. Rollback por componente

| Componente | Respaldo | Rollback |
|---|---|---|
| API Mejora Continua | `C:\API WEB\_backups\mejora-continua_pre_fechacreacion_<ts>\` con DLL y PDB productivos y su hash | `Stop-WebAppPool MejoraContinuaPool` → copiar el DLL y PDB respaldados → `Start-WebAppPool` → `GET /mejora-continua/api/no-conformidades` 200. Nunca `iisreset`. |
| `latest.json` | `latest.backup-<aaaammdd-hhmmss>.json` en el share, con hash comparado | Copiar el respaldo encima. Los equipos que ya actualizaron no vuelven solos: reinstalar `QualityControlCenter_Setup_v1.8.29.exe` (queda en el share). |
| Instalador 1.8.30 en el share | — | Retirarlo después de revertir `latest.json` (sin `latest.json` que lo nombre, nadie lo descarga) |
| SQL | No hay cambios SQL en esta publicación | — |

## 7. Archivos del cambio (Photino)
- **Modificados:** `QualityControlCenter.csproj`, `installers/QualityControlCenter.iss`, `src/Backend/Models/FaretApi/FaretDashboardDto.cs`, `src/Backend/Modules/Faret/FaretHandler.cs`, `src/Backend/Services/FaretApi/FaretDashboardService.cs`, `src/Backend/Services/MessageRouter.cs`, `src/Backend/Services/PermisosService.cs`, `src/UI/www/index.html`, `src/UI/www/modules/faret-nc/faret-nc.controller.js`, `src/UI/www/modules/faret/faret.controller.js`, `src/UI/www/modules/faret/faret.view.html`, `src/UI/www/shared/novedades.js`.
- **Nuevos:**
  - `src/Backend/Modules/EvaluacionOperadores/` (incluye el módulo INNPACK de 1.8.29, todavía sin commit);
  - `src/UI/www/modules/evaluacion-operadores/`, `src/UI/www/modules/faret-evaluacion-operadores/`, `src/UI/www/shared/evaluacion-operadores-base.js`;
  - `tools/evaluacion_operadores_tests/`, `tools/faret_validacion_real/`, `tools/fps_historico/`;
  - `docs/analisis_evaluacion_calidad_operador_20261110/`.
- **Mejora Continua:** `MejoraContinua.Api/Repositories/NoConformidadRepository.cs`.

## 8. Secuencia de publicación (cada paso requiere autorización específica)
1. **Preflight remoto** (§5) por una persona y cierre de la ventana con depuración remota.
2. **Despliegue de Mejora Continua** con `docs/OPERACION_DESPLIEGUE_QCC.md`:
   - Fase A: respaldo en `_backups` + copia a `nuevo\`, verificando hashes contra §3.
   - Fase B: `Stop-WebAppPool MejoraContinuaPool` → copiar → `Start-WebAppPool`.
3. **Verificación de la API:**
   - GET 200 y 23/23 pools.
   - Crear una NC de prueba marcada `TEST-CLAUDE-BORRAR`: debe devolver una `fechaCreacion` real.
   - `POST` sin `fechaDeteccion` debe dar 400.
   - Borrar la NC de prueba (con su propio script SQL, ejecutado por la persona) o dejarla documentada.
4. **Publicación de Photino:**
   - Subir el instalador al share y comparar su hash con el local.
   - Respaldar `latest.json` y comparar el hash.
   - **Último:** copiar `latest.json.candidato` como `latest.json` y revalidarlo leyéndolo desde el share.
5. Validación con datos reales en un cliente actualizado: correr `conciliacion_real.mjs`, con 13/13 esperado.
6. Regresión FARET (Inicio, No Conformidades, Data) e INNPACK (Inicio, Evaluación, No Conformidades) con sesiones reales, incluido un usuario VER y uno SIN_ACCESO.
7. Auto-actualización confirmada en un equipo con 1.8.29.
8. Cierre documental: `contex.md`, memoria y commit (lo hace el usuario).

**Fuera de esta publicación:** backfill de las 67 NC (`31b`, no ejecutado) y endpoint FPS.

## 9. Las 67 NC sin fecha: limitación y alternativas auténticas

El Inicio lo informa: `ncSinFechaCreacion = 67`, visible en la corrida real, con la alerta "N NC no tienen fecha de creación en Mejora Continua; se usa su fecha de detección". No se modifica ningún registro.

Fuentes verificables para recuperar fechas, en orden de confiabilidad (decisión del DBA o TI):
1. **Logs de IIS de SRV-API** (sitio `API`): cada `POST /mejora-continua/api/no-conformidades` 200 queda con hora UTC. Como `id` es IDENTITY consecutivo, el n-ésimo POST exitoso desde el 02-09 09:32 corresponde al n-ésimo id (338…405; el 345 no aparece en la API: puede estar eliminado lógicamente o ser un hueco de IDENTITY, y el DBA debe confirmarlo antes de cruzar). Es auténtico si los logs de septiembre siguen retenidos.
2. **Lote de importación de Data** (`created_at` del lote; confirmar el nombre de la tabla en `qualitycontrolfaret`, "Creación manual (No Conformidades)"): para las NC creadas con "+ Nueva NC", Data y la NC se crean en la misma llamada (Paso 34), así que esa hora acota la creación con segundos de diferencia. No sirve para las NC creadas después con "Gestionar".
3. **Respaldo de SQL Server restaurado en otro servidor** (nunca en producción): no aporta la hora, porque la columna ya era NULL. Descartado.

Solo con la evidencia 1 o 2, cruzada id por id, el DBA podría cargar fechas reales. Hasta entonces, NULL.

## 10. Riesgos
- **Depuración remota todavía abierta** (§2-8): bloquea hasta que se cierre la ventana.
- **DLL productivo de Mejora Continua no verificado:** si difiere de `b3e3d17`, hay que revisar antes de reemplazarlo (§3).
- Se despliega también 4G (400 en lugar de 500): riesgo bajo, los clientes conocidos envían la fecha.
- Sesiones VER, SIN_ACCESO e INNPACK reales no probadas: se cubren en el paso 6, después de publicar.
- `config.json` con credenciales por instalación: riesgo existente, no introducido por esta versión.

---

## 11. Fase 33B — cierre del preflight (11-11-2026)

**Puerto de depuración:** `127.0.0.1:9333` ya no escucha (netstat sin LISTENING, sin respuesta HTTP). No se cerró ningún proceso.

**SRV-API** (WinRM/Kerberos por hostname, comandos explícitos de solo lectura, sin script, sin `-ExecutionPolicy Bypass` ni `c$`; nada modificado):

| Control | Resultado |
|---|---|
| Sitio `API` / app `/mejora-continua` | Started; pool `MejoraContinuaPool`, ruta `C:\API WEB\api\mejora-continua` |
| Pools | 24/24 Started. El runbook decía 23: hay un pool nuevo ajeno a este cambio; usar 24 como línea base. |
| DLL productivo | 119.808 B, 2026-09-02 11:11:16, FileVersion 1.0.0.0, SHA-256 `A650F171…A278D`, InformationalVersion `1.0.0+a800fe2` |
| PDB / deps.json / web.config | `F1942107…3E146` / `1EDC8AAE…479F` (29.000 B, 02-09 11:00) / `04329D0C…9F0B` (02-09 11:11) |
| Último despliegue identificable | 2026-09-02 11:11–11:12 (dll, pdb, exe, web.config, appsettings.json). Ningún archivo posterior. |
| Configuración (solo nombres de claves) | `appsettings.json`: `ConnectionStrings.SqlServer`, `Logging.*`, `AllowedHosts`. El candidato lee la misma clave. No se modifica. |
| Permisos | ACE `IIS APPPOOL\MejoraContinuaPool:(OI)(CI)(RX)` presente |
| Disco / respaldos | 91,9 GB libres; `_backups` con 17 carpetas, **ninguna de mejora-continua** (se crea en el despliegue) |
| Salud | `GET /mejora-continua/api/no-conformidades` 200 |

**Comparación de DLL (copia de solo lectura del productivo, hash verificado = servidor):**
- Producción se compiló desde `a800fe2`. Entre `a800fe2` y HEAD solo cambian scripts de `migration/` y el commit 4G (`NoConformidadesController`, +3 líneas). El csproj no cambia desde `2af888b`.
- Diferencias de contenido (literales e identificadores):
  - **solo en el candidato:** `fecha_creacion`, `GETDATE()`, el comentario del INSERT y `fechaDeteccion es obligatoria`;
  - **solo en producción:** el final del INSERT anterior (`responsable`/`@Responsable` como último campo);
  - además, la versión informativa (`a800fe2` → `97d9d30`).
- **No hay ninguna funcionalidad productiva posterior que se sobrescriba.**
- **Dependencias:** cada librería y versión del candidato ya existe en el `deps.json` productivo. Producción tiene 15 transitivas de más por una resolución NuGet anterior; son inocuas. Se despliegan **solo DLL y PDB**: `deps.json`, `web.config`, `runtimeconfig` y `appsettings` quedan como están.

**Conclusión: APTO PARA AUTORIZAR** el despliegue de Mejora Continua y la publicación de 1.8.30, en el orden del §8. Respaldo previo obligatorio: `C:\API WEB\_backups\mejora-continua_pre_fechacreacion_<ts>\` con DLL y PDB productivos y hashes `A650F171…` / `F1942107…`. Rollback según el §6.
