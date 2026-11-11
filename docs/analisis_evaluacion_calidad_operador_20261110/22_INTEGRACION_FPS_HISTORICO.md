# 22 — Integración histórica FPS ↔ Calidad (herramienta local) — 10-11-2026

**Estado: herramienta construida y probada con datos sintéticos (21/21). Cobertura REAL sin medir: ejecutarla requiere la identidad remota que solo escribe una persona** (no uso `AD\Administrador` ni credenciales administrativas). Sin despliegue, sin cambios en BD/permisos/servicios, sin commits.

## 1. Qué se entregó (`tools/fps_historico/`, excluido del build por `tools/**`)
| Archivo | Rol |
|---|---|
| `Invoke-FpsHistorico.ps1` | Lanzador en la estación. Pide la identidad con `Get-Credential` (no se guarda), abre sesión Kerberos a SAP_NEW, envía el script remoto con `Invoke-Command -FilePath` (sin `ExecutionPolicy Bypass`) y guarda los CSV en una carpeta **local fuera del repo** con `.gitignore *`. Rechaza salidas dentro del repo y nombres de archivo no permitidos. |
| `fps_historico_remoto.ps1` | Corre en SAP_NEW. Catálogo cerrado de 4 modos (`esquema`, `cobertura`, `nps`, `nc`), sin SQL libre. Shared Memory local verificada; identidad y mínimo privilegio verificados antes de leer; guarda SELECT-only; parámetros tipados; `TOP` ≤ 50.000, timeout 5–120 s, ≤ 500 NP, rango ≤ 5 años; `Rut` nunca se devuelve. Solo lee `[plan].[vw_FactProduccion]` (FPS, `fps_historico_ro`) y `dbo.no_conformidades` (`qcc_audit_ro`). Devuelve texto CSV; no escribe en el servidor. |
| `analizar_cruce.py` | Cruce local de CSV (sin conexiones). Niveles Confirmada/Probable/No atribuible, deduplicación, puntos solo de Confirmada. Salida seudonimizada salvo `--con-nombres`. |
| `tests/test_analizar_cruce.py` | 21 pruebas sintéticas. |

Credenciales: ninguna en archivos/repos/registros. El XML DPAPI ya existe en el perfil remoto (la ruta se pasa por parámetro). `AD\Administrador` no es identidad permanente: se escribe a mano por ejecución; no hay tareas ni automatismos.

## 2. Reglas de atribución (participante ≠ responsable)
- **Participante**: operador válido de una sesión FPS del mismo NP + máquina + fecha de fabricación dentro de [inicio, término]. Es presencia, no culpa.
- **CONFIRMADA** (única que suma puntos, 1 vez por NC): hay **un solo** participante en la ventana, ninguna sesión sin operador válido en la ventana, el NP no está repetido entre empresas y el operador escrito en la NC **coincide** con ese participante. Dos fuentes independientes concuerdan.
- **PROBABLE**: NP presente y coincide máquina o fecha, pero falta evidencia (varios participantes, NC sin operador o con varios nombres, no coincide, fecha fuera de ventana, usuario genérico/vacío en la ventana, NP compartido entre empresas). Contexto, **sin puntos**.
- **NO ATRIBUIBLE**: NP inválido, sin sesiones en FPS, o sin coincidencia de máquina ni fecha.
- Dedupe: sesiones por `ID` (o huella); variantes del mismo nombre cuentan una vez; NC idénticas (NP+máquina+fecha+nivel+operador) penalizan una vez; eliminadas excluidas; internas nunca penalizan.

## 3. Cobertura real FPS ↔ Calidad
**No medida.** Se necesita ejecutar (por una persona) en este orden, cada uno genera su carpeta:
1. `-Modo esquema` (confirma columnas reales de la vista; el script usa `*` y no depende de nombres salvo `ID, NP, OT, MAQUINA, OPERADOR, [FECHA INICIO], [FECHA TERMINO]`).
2. `-Modo cobertura -Desde 2024-01-01` → sesiones/NP/OT/operadores/máquinas por mes, `filas` vs `sesiones` (detecta duplicación de la vista), sin operador, genéricos, fechas invertidas.
3. `-Modo nc` (con la credencial de `qcc_audit_ro`) → universo de NC (ya sabemos: 201 filas, 7 producto activas, 183 internas, resto eliminadas).
4. Con los NP de las NC (`nps.txt`): `-Modo nps`, luego `python analizar_cruce.py --fps ...\sesiones_por_np.csv --nc ...\nc_calidad.csv --salida <carpeta fuera del repo>`.
El `resumen_cruce.json` responde: NC con NP válido, NP presentes en FPS, NC con participantes identificables, con coincidencia máquina+fecha, con varios participantes, sin match, y Confirmada/Probable/No atribuible por ámbito.

## 4. Brechas conocidas que impiden atribuir responsabilidad (ya comprobadas)
- Operador y máquina de la NC son **texto libre** sin vínculo a empleado; la coincidencia exacta de nombre falla con apellidos distintos o abreviados (por eso se exige coincidencia y no solo presencia).
- La sesión FPS es turno/OT, no el turno real del operador; hay solapes y usuarios vacíos/`admin` (Revision.md, oct-2026).
- 1 de 7 NC de producto sin fecha de fabricación; 1 sin operador; NC internas no capturan operador ni máquina.
- NP numérico podría repetirse entre empresas (se degrada a Probable).
- `fps_historico_ro` solo ve la vista: no hay acceso a `ZZZSesionEventos` (turnos reales) ni a otras tablas.

## 5. Propuesta de integración al módulo (sin APIs ni servicios nuevos)
- Fase 0 (hecha): módulo 1.8.29 sigue descriptivo, intacto.
- Fase 1 (tras medir): si Confirmada ≥ umbral que Calidad apruebe, publicar el cruce como **archivo local de apoyo** para análisis manual de Calidad, no en la app.
- Fase 2 (solo con aprobación): columna "Participantes FPS (probable)" en el detalle de NC de producto, **sin puntos**; puntos solo desde Confirmada. Requeriría decidir dónde vive el dato (hoy la app no puede leer FPS: no hay canal autorizado desde el desktop). Alternativa mínima: mantener el cruce fuera de línea.
- No se propone proxy/API/servicio: no es imprescindible mientras el cruce sea periódico y fuera de línea.

## 6. Pruebas
- `python -I -m unittest discover -s tests`: **21/21 OK** (confirmada; sesión duplicada; varios operadores; variantes de nombre; NC sin fecha/sin operador/operador múltiple/no coincide; usuario genérico; NP inexistente/inválido; máquina/fecha fuera; fechas invertidas; sesión que cruza días; mismo NP en dos empresas; NC duplicada; interna; eliminadas; seudónimos; salida dentro del repo rechazada; archivo sin nombres).
- Scripts `.ps1`: análisis sintáctico con el parser de PowerShell, 0 errores. **No ejecutados** (no hay forma de ejecutarlos sin la identidad remota; además la política Kaspersky prohíbe ejecutar scripts recién generados sin revisión humana).

## 7. Autorizaciones pendientes (exactas)
1. **Revisión humana** de `fps_historico_remoto.ps1` e `Invoke-FpsHistorico.ps1` antes de la primera ejecución (política Kaspersky 03-11-2026). Hash y contenido se comparten tal cual.
2. **Una persona** ejecuta el lanzador con su `Get-Credential` (`AD\Administrador` solo si TI lo permite para esta tarea; recomendado a futuro: cuenta con PowerShell Remoting limitado a este único script, p. ej. JEA — NO se crea nada automáticamente).
3. Ruta exacta de los XML DPAPI en SAP_NEW (`fps_historico_ro` y `qcc_audit_ro`; esta segunda ya existe porque la usó la auditoría) y confirmar que ambas bases están en la **misma instancia** que `lpc:SAP_NEW` (si FPS está en otra instancia, pasar `-Instancia`; si está en otro servidor, esta vía local no sirve y habría que pedir un cambio).
4. Confirmar que `fps_historico_ro` no es miembro de `db_datareader` (el script lo exige; si lo fuera, aborta y se debe ajustar el permiso a solo la vista, con autorización).
5. Autorización de Calidad para usar `--con-nombres` (por defecto todo sale seudonimizado).
6. Decisión de Calidad (pendiente de siempre): criterio de atribución, ponderaciones y tratamiento de NC internas.

## 8. Auditoría previa a la primera ejecución real (10-11-2026) y correcciones
Hallazgos y arreglos (tests 22/22; parser PowerShell 0 errores):
- Faltaba el paso "NP de las NC → consulta FPS": el lanzador ahora tiene `-Modo todo` (una sola sesión Kerberos, credenciales una vez): buscar → esquema → cobertura → nc → nps (lotes de 500) → `analizar_cruce.py`.
- Las rutas de los XML DPAPI eran desconocidas: nuevo modo remoto `buscar` que solo lista nombres de archivos `*fps_historico_ro*`/`*qcc_audit_ro*` en el perfil remoto (no lee su contenido).
- `analizar_cruce.py` acepta varios CSV de sesiones (lotes) y normaliza NP sin ceros a la izquierda (+1 prueba).
- Un fallo en `cobertura` no detiene el resto; un fallo en `esquema`/`nc` sí.
- Riesgo abierto: DPAPI por Kerberos (red). Para cuentas de dominio suele funcionar; si falla, el mensaje lo indica y la alternativa permitida es crear/ejecutar el XML desde una sesión interactiva de esa misma cuenta (no se hace automáticamente).
- Hashes SHA-256: remoto `c715685f…1247`, lanzador `e0352d16…c3b9`, analizador `bf3dd604…13f4`.

> Actualización 10-11-2026 (tarde): ejecución real y cifras en `23_AUDITORIA_REAL_FPS_Y_MEJORAS_MODULO.md`. Las cifras de NP de la sección 3 aquí quedan reemplazadas por las de ese documento (la llave de las NC de producto es NVInnpack).
