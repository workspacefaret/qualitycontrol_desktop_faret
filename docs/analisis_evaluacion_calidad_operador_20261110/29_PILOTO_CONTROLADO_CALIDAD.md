# 29 — Piloto controlado del módulo Evaluación de Calidad por Operador (10-11-2026)

## 0. Fase 29B — PUBLICADO (10-11-2026): Photino **1.8.29**
Decisión del responsable TI: la identidad de Pedro Roa ya no bloquea; TI le concederá **VER** desde el panel tras la publicación. Nadie recibe permisos automáticamente ni hay excepciones por nombre/correo/usuario en el código.

- **Publicación:** instalador `QualityControlCenter_Setup_v1.8.29.exe` (58.847.802 bytes, SHA-256 `406F54F6643943F464B5CCB4A76BF93DEB9C681CB98FC1B7F2C2D504465B7D1D`), copiado al share de updates con hash verificado idéntico; `latest.json` activado al final (JSON revalidado). `QCC.Updater.exe` no republicado (sin cambios). Sin push, sin commit, sin servicios reiniciados, sin cambios SQL/BD/API.
- **Respaldo/rollback:** `latest.backup-20261110-171607.json` en el share (era 1.8.28). Rollback = copiarlo sobre `latest.json`. Los equipos que ya actualizaron conservan 1.8.29 con el módulo en SIN_ACCESO por defecto.
- **Historial protegido:** el snapshot `auditoria_fps.json` **no se distribuye** (ni en el instalador —verificado: ningún archivo de auditoría en el publish— ni en ProgramData). El módulo funciona con el cálculo vivo de NC (seudónimos con VER) y la sección «Auditoría histórica FPS» muestra «Aún no hay auditoría histórica cargada». No hay ningún dato personal de operadores en el instalador (grep de nombres: sin coincidencias). Por tanto el historial queda protegido por no estar presente en ningún equipo.
- **Entrega futura del historial (no implementada, requiere su autorización):** endpoint autenticado de solo lectura en la API INNPACK (`GET api/evaluacion-operadores/auditoria`) que valide el JWT y que el usuario tenga VER/EDITAR en `evaluacion-operadores` (o ADMIN_TI) leyendo `usuario_modulo_permiso`, y sirva el archivo desde una carpeta del servidor con ACL restringida a la cuenta del pool; el desktop lo pediría vía `InnpackApiClient` en vez de leer ProgramData. Requiere desplegar la API en SRV-API (procedimiento estándar de DLL+PDB con respaldo). Mientras tanto no copiar el archivo a ningún equipo.
- **Panel de permisos:** verificado por código que «Gestión de Usuarios» → Permisos arma la matriz con los botones del sidebar y los módulos registrados, por lo que incluye «Evaluación de Calidad por Operador»; la API INNPACK valida solo el formato del nombre del módulo (sin lista blanca) y guarda en `usuario_modulo_permiso`; el backend desktop y el sidebar aplican el nivel al siguiente login/recarga de permisos del usuario.
- **Cómo conceder VER:** (como ADMIN_TI) Gestión de Usuarios → usuario (Pedro Roa) → Permisos → fila «Evaluación de Calidad por Operador» → «Solo vista» → Guardar. El usuario debe cerrar sesión y volver a entrar. **Revocar:** misma fila → «Sin acceso» (o «Restablecer» para volver al rol, que es SIN_ACCESO) → Guardar; efecto en su siguiente sesión.
- **Cambio ajeno excluido:** `FaretDashboardService.cs` (corrección de «NC abiertas» Faret) se excluyó del paquete: se compiló y publicó sin él; el cambio sigue en el árbol de trabajo (copia en `C:\Users\dcarrasco\fps_historico\FaretDashboardService_estadoGestion.patch`).
- **Pruebas:** C# 117/117 (incluye matriz de acceso y rechazo de lectura directa del historial sin permiso: `evaluacionOperadores.auditoria.resumen` rechazada sin VER/EDITAR/ADMIN_TI), Python 84/84, build Release 0 errores, ventana Photino real 15/15 en Fase 28 (sin cambios de interfaz desde entonces). Responsabilidad confirmada = 0.
- **Pendiente de validación en producción (requiere sesiones reales):** que ADMIN_TI vea el módulo tras actualizar a 1.8.29, que un usuario normal no lo vea, que Pedro lo vea tras recibir VER, y que los módulos existentes sigan funcionando; confirmar el auto-update en un cliente real.

Las secciones siguientes (1 en adelante) son el diagnóstico original de la Fase 29; el bloqueo de identidad quedó resuelto por decisión de TI y el de datos por no distribuir el snapshot.

## 1. Resultado de la Fase 29 original: **NO SE DESPLIEGA (bloqueo real, documentado)**
Versión candidata local: **1.8.29** (nada publicado, sin commit ni push, `latest.json` intacto en 1.8.28).
La regla de la fase dice «si cualquiera de las condiciones falla, no despliegues». Fallan dos, ambas de seguridad y fuera de lo que puedo resolver sin credenciales/permisos ajenos:

| # | Condición | Estado | Motivo |
|---|---|---|---|
| 1 | Identidad corporativa verificada de Pedro Roa | **Falla** | En el repo y en las fuentes accesibles no existe ningún identificador estable de su cuenta QCC (código de usuario / id). El nombre visible no basta (prohibido autorizar por coincidencia). La tabla de usuarios INNPACK (`calidad_db`) solo se lee con credencial interactiva. |
| 2 | Rol administrativo autorizado identificado | Parcial | En el código solo **ADMIN_TI** tiene acceso total. No hay otro rol «administrativo» definido; no lo invento. `AD\dcarrasco`: el login de QCC no es la identidad AD; debe verificarse su usuario QCC y que tenga rol ADMIN_TI. |
| 3 | Datos protegidos | **Falla** | El snapshot `auditoria_fps.json` no viaja en el instalador, no existe en esta máquina y, si se copia a `%ProgramData%\QualityControlCenter`, lo puede leer cualquier usuario local del equipo. Entregarlo por la API exige cambiar el repo/servidor de la API (no autorizado). |
| 4 | Autorización backend + frontend | Cumple | Ver §3. |
| 5 | Pruebas de seguridad | Cumple lo verificable | Ver §4; pendientes las que requieren sesiones reales de otros usuarios. |
| 6 | Backup y rollback | Cumple (procedimiento), no ejecutado | Ver §7. |
| 7 | Sin migraciones destructivas | Cumple | Ninguna migración ni cambio de BD/permisos. |

## 2. Auditoría del control de acceso existente (no hizo falta mecanismo nuevo)
- **Fuente única:** `PermisosService` (niveles `SIN_ACCESO`/`VER`/`EDITAR`). Permisos personalizados por usuario y módulo viven en la tabla `usuario_modulo_permiso` de la API INNPACK (`GET api/auth/mis-permisos`), y solo **ADMIN_TI** los asigna desde la matriz de «Gestión de Usuarios».
- Módulo `evaluacion-operadores`: registrado solo para INNPACK; **por rol = SIN_ACCESO para todos** (default-deny). Acceden únicamente: ADMIN_TI (siempre) o un usuario con permiso personalizado VER/EDITAR.
- **Backend:** `MessageRouter` valida cada acción con `ValidarAccion` antes de despachar; `evaluacionOperadores.*` se rechaza si la empresa no es INNPACK o el nivel es SIN_ACCESO (también `auditoria.resumen`). El handler recibe además si el nivel es EDITAR para decidir nombres reales.
- **Frontend:** el botón del sidebar (`data-module="evaluacion-operadores"`) se oculta por `refreshSidebarState`/`permisos.mios`, y `App.loadModule` impide abrir módulos SIN_ACCESO. No existen tarjetas de Inicio, accesos rápidos ni buscador de módulos que lo expongan (verificado con grep: solo aparece en el botón del sidebar y su CSS).
- **Regla pedida** `Acceso = Administrador autorizado OR Pedro Roa` se logra **sin código nuevo y sin darle admin a Pedro**: ADMIN_TI ya entra; a Pedro se le asigna un permiso personalizado **VER** (conserva su rol original). Es configurable y default-deny.
- Hallazgo endurecido en esta fase: `NivelEfectivoSinLock` devolvía tal cual un nivel personalizado desconocido. El parser ya lo filtraba (no era explotable), pero ahora cualquier valor distinto de VER/EDITAR se trata como SIN_ACCESO (defensa en profundidad). Único cambio de código fuera del módulo en esta fase.

## 3. Alcance de lectura en el piloto
Todo el módulo es de solo lectura: no existe ninguna acción de escritura (confirmación de responsabilidad, penalizaciones oficiales, modificación de NC/sesiones FPS, correcciones automáticas, cambios de equivalencias). Responsabilidad confirmada = 0 siempre. Con VER (Pedro) se ven **seudónimos** (OP-xxxxxx); con EDITAR/ADMIN_TI, nombres en el cálculo vivo de NC. El snapshot de auditoría es siempre seudónimo. Limitación a tener presente: Pedro con VER no verá nombres.

Revisión Fases 24–28: sin cambios de reglas ni información removida (cruce Calidad↔FPS, catálogo de 99 máquinas, equivalencias, operadores declarados, historial, comparación de documento, responsabilidad individual/compartida provisional, explicaciones de discrepancia).

## 4. Matriz de pruebas
Probadas con `PermisosService` real (harness C#, 117/117):

| Caso | Resultado |
|---|---|
| Sin sesión | Rechazado |
| Rol ADMIN/CALIDAD/INSPECTOR/CONSULTA/OPERADOR/SUPERVISOR/vacío/«admin_ti_falso» sin permiso | SIN_ACCESO, acción y auditoría rechazadas |
| Permiso personalizado VER | Lectura permitida, escritura rechazada, menú visible |
| Permiso personalizado EDITAR | Igualmente sin escrituras posibles |
| Permiso SIN_ACCESO / nivel inválido / EDITAR en otro módulo | Rechazado |
| ADMIN_TI INNPACK | Acceso |
| Empresa FARET (aun ADMIN_TI) | Rechazado y ausente del menú |
| `_modulo` manipulado (otro módulo) | Rechazado |
| Cierre de sesión (`Limpiar`) | Rechazado, sin niveles |

Otras: Python 84/84, C# 117/117, build Release 0 errores, ventana Photino real 15/15 en la Fase 28 (1366/1000/800 px, separadores de tabla, siete NC sin errores).

**Pendiente (no simulado a propósito):** pruebas con sesión real de Pedro, de otro administrador y de un usuario normal/deshabilitado; sesión expirada y cambio de rol en vivo (requieren cuentas reales); llamadas directas a la API INNPACK (el módulo no agrega endpoints nuevos: usa los de NC ya existentes, con sus propios permisos). Las pruebas de caché/archivos locales y logs: el módulo no registra nombres en logs; el snapshot local es el único artefacto (ver §5).

## 5. Snapshot `auditoria_fps.json`
- Ruta: `%ProgramData%\QualityControlCenter\auditoria_fps.json` (≤ 2 MB, campos en lista blanca, seudónimos).
- **No** está en el instalador ni lo actualiza el auto-updater; hoy no existe en esta máquina → el módulo muestra «sin auditoría disponible» (no error) — el comportamiento es honesto pero sin aviso de antigüedad.
- Riesgos: legible por cualquier usuario local; seudónimo débil (hash de 24 bits con sal en el código); sin fecha visible de actualización salvo la interna del archivo.
- Opciones (requieren decisión suya): (a) entregarlo por la API INNPACK autenticada, solo a VER/EDITAR/ADMIN_TI (cambio en repo/servidor de la API, sin SQL nuevo); (b) copiarlo solo a equipos autorizados con ACL restringida (manual, sin infraestructura); (c) piloto solo en equipos de Pedro y administradores. Mientras no se elija, no se distribuye.

## 6. Datos históricos incluidos (cuando se distribuya)
7 NC de producto, 220 sesiones FPS, catálogo de 99 máquinas. Cifras: 15,00 puntos provisionales, 0 confirmados; conciliación Confirmada NC 6, 7, 14; Discrepancia NC 11, 12, 13 (operador) y 15 (documento).

## 7. Backup y rollback (preparados, no ejecutados)
Versión publicada actual: 1.8.28 (`latest.json` del share). Para desplegar: backup con timestamp de `latest.json` y hash del instalador; comparar versión contra el `latest.json` real del share; activar `latest.json` **al final**. Rollback: copiar el backup sobre `latest.json` (los equipos ya actualizados conservan 1.8.29 con el módulo bloqueado por defecto: SIN_ACCESO). Archivos que cambian respecto a 1.8.28: `QualityControlCenter.csproj`, `installers/QualityControlCenter.iss`, `src/UI/www/index.html`, `src/UI/www/shared/novedades.js`, `PermisosService.cs`, `MessageRouter.cs`, módulo `EvaluacionOperadores` (backend y www), y el cambio ajeno ya existente `FaretDashboardService.cs` (corrección de «NC abiertas» por `estado_gestion`, **no relacionado**; decidir si entra en 1.8.29). Compatibilidad con la API: no requiere cambios.

## 8. Acciones mínimas que necesito de usted
1. En «Gestión de Usuarios» (como ADMIN_TI), indicar el **código de usuario QCC exacto** de Pedro Roa y el suyo (`dcarrasco`), y confirmar que el suyo es ADMIN_TI; o ejecutar una consulta de solo lectura que prepare yo (id, código, nombre, rol, activo, sin claves ni Rut).
2. Elegir la vía de entrega del snapshot (§5: a, b o c).
3. Confirmar si algún rol distinto de ADMIN_TI cuenta como «administrador autorizado».
4. Con eso: bump ya aplicado, empaquetar 1.8.29, publicar, asignar a Pedro el permiso VER desde la matriz y validar en producción con sus sesiones.

## 9. Pendientes para Calidad (sin cambios)
Validar equivalencias Cilíndrica 1 → 93 y Cónica/Ovalada → 78; NC 15 (NV 3760 vs 3840) con el lote físico; NC 11–13 declarado vs registrado en FPS; NC 14 reparto 2,5/2,5; responsabilidad confirmada = 0.

## 10. Restricciones respetadas
Sin confirmar responsabilidades, sin modificar NC, sin escrituras en FPS, sin sanciones, sin admin a Pedro, sin habilitar globalmente, sin guardar contraseñas, sin push/commit, sin cambios en permisos de otros módulos.
