# 32 — Validación real y preparación de QCC 1.8.30 (11-11-2026)

Continúa la Fase 31 (`31_...md`). Sin commit, push, escrituras productivas, despliegues ni cambios de permisos.
Estado en una línea: **1.8.30 compilada e instalador candidato listo; la conciliación con PNC reales queda
preparada como arnés, pero no se ejecutó porque no hay una sesión Faret válida.**

## 1. HTTP 401 de la API `qualitycontrol`: causa y solución

| Revisión | Resultado |
|---|---|
| Salud de la API (`GET /api/health`) | 200: la API está arriba |
| Endpoint usado por el desktop | `POST api/auth/login` (`FaretAuthApiService`), el mismo que valida la API; `desktop-login` está deshabilitado a propósito |
| Respuesta con la cuenta de prueba AdminTI (11-11, un intento) | `401 {"message":"Credenciales inválidas."}` |
| Qué produce ese mensaje (`AuthService.LoginAsync`) | 1) usuario inexistente; 2) `activo = 0`; 3) hash no bcrypt (`$2…`) desde la política de contraseñas del 15-10; 4) clave distinta |
| Política de contraseñas | AdminTI (id 28) quedó con `password_sin_vencimiento = 1`: no la bloquea la expiración |
| Token/sesión | No aplica: el rechazo ocurre antes de emitir el JWT (8 h) |

**Conclusión:** el desktop no tiene un error; la API rechaza esa credencial. No se puede saber cuál de las 4 causas es
sin leer la tabla `usuarios`, y no se leyó: no hay acceso de solo lectura a `qualitycontrolfaret` y no se revisó `.secrets`.
No se corrigió código porque no hay defecto.

**Solicitud concreta para TI** (permiso mínimo):
1. Diagnóstico de solo lectura en `qualitycontrolfaret` (MySQL .70):
   `SELECT id, username, activo, LEFT(password_hash,3) AS prefijo_hash, password_actualizada_en, debe_cambiar_password FROM usuarios WHERE username='AdminTI';`
   Si `activo=0` o el prefijo no es `$2`, esa es la causa.
2. Para validar datos no hace falta una cuenta administrativa. Basta una **cuenta técnica con rol `CONSULTA`**: `GET api/importaciones/pnc` solo exige `[Authorize]` (Paso 39) y Mejora Continua es pública. Al usuario se le asigna **VER** en `faret-evaluacion-operadores` y nada más.
3. **Alternativa sin credencial nueva** (reutiliza la autenticación existente): una persona de Calidad o TI inicia sesión en QCC con su propia cuenta y corre el arnés de §2.

## 2. Conciliación PNC ↔ Mejora Continua ↔ Inicio

**No ejecutada con datos reales** (bloqueo §1). Arnés listo: `tools/faret_validacion_real/conciliacion_real.mjs`.
- Se conecta por CDP a la ventana Photino real con la sesión de quien lo ejecuta: no maneja credenciales.
- Usa solo acciones de lectura del puente real.
- Si Data viene incompleta, se detiene: nunca informa conteos parciales como totales.

| Calcula | Regla |
|---|---|
| PNC sin gestión | fila de Data sin NC `DATA_FARET` con `origenId = id` |
| NC abiertas en gestión | `estadoGestion ≠ CERRADA`, excluidas las vinculadas a registros eliminados |
| Pendientes de cierre | sin gestión + en gestión abiertas (cada PNC cuenta una sola vez) |
| Críticas sin cerrar | `nivel` Crítico sin NC o con NC no cerrada; separa *Rechazo Cliente* (caso de la usuaria) |
| Inconsistencias | varias NC por una misma fila de Data (duplicadas); NC con `origenId` inexistente (huérfanas) |
| Contraste | compara contra los KPIs que entrega `faret.dashboard.resumen` (backend real); cualquier diferencia queda como FAIL |

Lo ya demostrado con datos reales (Fase 31, Mejora Continua pública): 354 NC, **0 abiertas en gestión**, 354 `CERRADA`.
Las "3 críticas" eran NC-2026-124/126/128 (severidad ALTA, ninguna *Rechazo Cliente*), ya cerradas. **La PNC crítica abierta
que reporta la usuaria no se ha confirmado.** Si existe, debe aparecer en `rechazoClienteCriticoAbierto`.

## 3. Evaluación por Operador FARET con datos reales

**No validada con datos reales** (mismo bloqueo). El arnés comprueba con el backend real:
- universo = filas de Data;
- evaluables + excluidas = registradas;
- PNC sin fecha de fabricación;
- FPS informado como no disponible;
- el detalle de un operador trae ids de Data existentes y sus puntos suman lo mismo que el total del operador.

Sin datos simulados en producción: el frontend solo pinta lo que entrega `faret.evaluacionOperadores.resumen`. La prueba visual usa un
puente simulado únicamente para el render y no se publica. La responsabilidad confirmada sigue en 0. El mapeo DTO ↔ API está cubierto con
JSON del formato real (`{success,data:{items,totalCount}}`). Si al correr el arnés aparece alguna diferencia de campos, se corrige ahí.

## 4. Permisos (CONSULTA con VER)
El informe 31 decía que CONSULTA no vería el botón aunque tuviera VER. **Era incorrecto:**
- La lista fija de CONSULTA (`aplicarReglaRolFaret`, `core/app.js`) solo rige si `permisos.mios` falla.
- Con permisos cargados, el menú usa `App.permisos`. El backend (`PermisosService`) aplica la misma regla.

Pruebas nuevas: CONSULTA+VER recibe VER en `permisos.mios`, puede leer y no ve nombres. Tampoco gana acceso a Data ni a Carga Masiva.
Sin VER queda en SIN_ACCESO. No hubo que cambiar código.

## 5. Integración FPS

| Pregunta | Resultado |
|---|---|
| ¿Endpoint corporativo de sesiones FPS por documento, máquina y período? | **No existe.** `fps-api` (`/api/produccion/*`, con API key) solo expone procesos por NP/OT, materiales, liberaciones y laboratorio. No da operador por sesión ni horas. |
| ¿Motor de cruce? | Sí: `tools/fps_historico/motor_responsabilidad.py` (`conciliar`). Separa documento, máquina, ventana temporal y operador declarado vs. FPS en CONFIRMADA / PROBABLE / DISCREPANCIA / INSUFICIENTE, y no asigna puntos sin evidencia. **84/84 pruebas Python OK.** |
| ¿Por qué no se implementó el endpoint? | 1) La fuente (`plan.vw_FactProduccion`) solo es legible hoy con `fps_historico_ro` por memoria compartida en el servidor. La cuenta de `fps-api` necesitaría un `GRANT SELECT`, y modificar permisos está prohibido sin autorización. 2) `fps-api` no tiene git en este equipo, así que no hay rollback seguro de un cambio de código. Un endpoint que no se puede probar contra la fuente real sería código sin validar. |

Diseño propuesto, para cuando TI autorice:
- Ruta: `GET /api/produccion/sesiones?np=|ot=&maquina=&desde=&hasta=` en `fps-api`.
- Restricciones: rango de 31 días como máximo, `TOP` acotado, sin RUT.
- Permiso: `GRANT SELECT ON plan.vw_FactProduccion` a la cuenta de `fps-api`.
- Acceso desde el desktop: vía la API INNPACK (JWT de la sesión) y luego el motor `conciliar` portado a C#.

## 6. Fechas de Mejora Continua

**Corrección de la API** (`NoConformidadRepository.CrearAsync`, `INSERT … fecha_creacion = GETDATE()`):
- Es compatible con el esquema productivo: `fecha_creacion DATETIME2(0) NULL` (`bloque4b_ejecutar.sql`), y el mismo repositorio ya usa `GETDATE()` en el cierre.
- Las otras tablas (análisis, acciones, adjuntos, seguimiento) ya tienen DEFAULT desde el 08-09-2026. Esta era la última columna pendiente.
- Compila. **No está desplegada.** El working tree de `mejoracontinua.api` también tiene cambios en `bin/` y `obj/` que no son de esta fase: no versionarlos.

Auditoría de las 67 NC (GET públicos, sin escribir):

| Dato | Valor |
|---|---|
| Sin `fecha_creacion` | 67 (ids 338–405; el 345 no existe), todas `DATA_FARET` |
| Cota inferior verificable | NC 336, creada 2026-09-02 09:32:02 |
| Con seguimiento | 0; con `fechaCierre` 1. **No hay cota superior para 64.** |
| `fecha_deteccion` | La escribe el usuario. Una de ellas (2026-09-01) es **anterior** a la cota inferior, así que no es la fecha de creación. |

**Decisión:** no existe una fecha histórica confiable, así que las 67 quedan en NULL (opción A).
- El Inicio usa su fecha de detección para "registradas hoy" y la tendencia, y muestra el aviso "N NC no tienen fecha de creación… se usa su fecha de detección".
- El script `31b_...sql` se reescribió:
  - diagnóstico;
  - DEFAULT recomendado (DDL, lo ejecuta el DBA);
  - opción A (no tocar);
  - opción B solo con una decisión escrita de Calidad: respaldo `bk_nc_fecha_creacion_20261111`, guarda de filas, verificación, COMMIT manual y rollback desde el respaldo.
- Nunca se usa la fecha actual.

## 7. Pruebas ejecutadas (11-11-2026)

| Prueba | Resultado |
|---|---|
| `dotnet run --project tools/evaluacion_operadores_tests` | **159/159** (5 nuevas de CONSULTA). El informe 31 decía 155; la corrida real de hoy antes de agregar las nuevas dio 154. |
| `pytest tools/fps_historico/tests` | 84/84 |
| `node --check` (JS modificados y arnés) | OK |
| `dotnet publish QualityControlCenter.csproj -c Release -r win-x64 --self-contained true` | 0 errores; exe con FileVersion 1.8.30 |
| Visual CDP sobre el **ejecutable publicado** (puente simulado, solo render) | Evaluación Faret (filtros, KPIs, FPS no disponible, detalle), Inicio Faret ("3 sin cerrar", críticas, "Sin información" sin Data), INNPACK con error controlado; 0 errores JS |
| Novedades 1.8.30 | FARET: 2 ventanas. INNPACK: 1 ventana, solo "no cambia nada". Se agregó el filtro de ventanas vacías. |

**No ejecutadas:**
- conciliación y evaluación con datos reales;
- autorización real contra la API con roles reales;
- sesión expirada real;
- auto-actualización.

Todas requieren una sesión Faret válida o publicar.

## 8. Instalador candidato 1.8.30
- `C:\Installers\QualityControlCenter_Setup_v1.8.30.exe`: 58.866.664 bytes, SHA-256 `32162ed38d92a270ce2edde5ee1d256c6503be991150d232ac94b88567a277f2`.
- Versión: `latest.json` del share en 1.8.29 (sin colisión). Se subieron las 3 propiedades del csproj, el `.iss` (incluido `;AppVerName`), el sidebar y `novedades.js`.
- `QCC.Updater.exe` no se republicó: 67.527.732 bytes, igual que en 1.8.25–1.8.28.
- **No se subió al share ni se tocó `latest.json`.**
- Si después cambia algún archivo de `src/`, hay que recompilar y el hash cambia.

## 9. Despliegue: orden, respaldos y rollback

| # | Paso | Quién | Respaldo / rollback |
|---|---|---|---|
| 1 | TI resuelve §1 y se corre `conciliacion_real.mjs`: todo PASS y PNC de la usuaria identificada | TI + Calidad | — |
| 2 | Desplegar la API Mejora Continua (solo `MejoraContinua.Api.dll`, publicada fuera del repo) según `docs/OPERACION_DESPLIEGUE_QCC.md`: hash, respaldo con timestamp y reciclar solo su pool | TI, con autorización | Restaurar el DLL respaldado y reciclar el pool. Verificar: crear una NC de prueba y ver su `fechaCreacion`, después borrarla. |
| 3 | DBA: diagnóstico, DEFAULT recomendado y opción A (o B con decisión de Calidad) de `31b_...sql` | DBA | `DROP CONSTRAINT`; opción B se revierte desde el respaldo |
| 4 | Subir el instalador al share, comparar hashes local vs. share, respaldar `latest.json`, **y al final** activar `latest.json` | TI, con autorización | Copiar el `latest.backup-*.json` sobre `latest.json` |

Dependencias:
- Photino 1.8.30 **no depende** de los pasos 2–3. Sin ellos, el Inicio sigue mostrando el aviso de NC sin fecha.
- La Evaluación Faret y el Inicio dependen de la API `qualitycontrol`, ya desplegada; no hay cambios de API para Photino.
- INNPACK no cambia.

## 10. Bloqueos que requieren TI
1. **Credencial:** diagnóstico de AdminTI y cuenta técnica CONSULTA (§1), o una persona que corra el arnés con su sesión.
2. **Autorización de despliegue** de la API Mejora Continua y ejecución del DBA (§6).
3. **FPS:** `GRANT SELECT` a la cuenta de `fps-api`, git para `fps-api` y autorización del endpoint (§5).
4. **Publicación de 1.8.30:** solo después del punto 1.

---

## 11. Conciliación con datos reales — EJECUTADA (11-11-2026, sesión corporativa ADMIN_TI del usuario)

**Cómo se ejecutó:**
- El usuario abrió el ejecutable 1.8.30 publicado con el puerto de depuración local e inició sesión FARET con su cuenta.
- El arnés usó esa sesión vía CDP, solo con acciones de lectura del puente. No se extrajeron tokens ni contraseñas y no se usó AdminTI.
- **Corrección del arnés antes de la corrida válida:** enviaba los parámetros anidados en `data`. El frontend los envía planos, así que la API ignoraba `page`/`pageSize` y repetía la página 1 (400 filas declaradas contra 354 reales). El propio arnés lo detectó y se detuvo sin informar cifras. No era un defecto del producto.

**Conteos reales:**

| Fuente | Conteo |
|---|---|
| Data Faret (`importacion_pnc`) | 354 filas (354 ids únicos); 125 Rechazo Cliente (74 críticos), 182 Cuarentena, 47 Reclamo. 195 de nivel crítico (3 escritas "Critico" sin tilde, ambos módulos las reconocen). 8 sin fecha de fabricación. |
| Mejora Continua | 354 NC, todas vinculadas a Data; 354 `CERRADA`; 0 abiertas; 0 manuales abiertas |
| Conciliación | PNC sin gestión 0 · duplicadas 0 · NC huérfanas 0 · críticas sin cerrar 0 · rechazo de cliente crítico abierto 0 |



**Inicio (backend real, 1.8.30):**
- NC abiertas en gestión 0, cerradas 354.
- PNC sin gestión 0, pendientes de cierre 0.
- Críticas sin cerrar 0 (0 en gestión y 0 sin gestión).
- NC vinculadas a registros eliminados 0. NC sin fecha de creación 67. Data disponible: sí.
- **6/6 comprobaciones PASS** contra la conciliación.

**Evaluación por Operador FARET (backend real):**
- 354 registradas, 329 evaluables y 25 excluidas: 18 sin operador identificable y 8 sin fecha de fabricación, con 1 que cumple ambas.
- Evaluables por nivel: 182 críticas, 134 mayores y 13 menores, que suman 2.503 puntos provisionales (166 excluidos).
- 63 operadores, 39 máquinas, 18 áreas. FPS informado como no disponible.
- El detalle por operador trae ids de Data existentes y sus puntos suman el total del operador.
- **7/7 PASS.** Un recálculo independiente desde Data dio exactamente las mismas cifras.

**Caso de la usuaria ("1 crítica abierta, rechazo de cliente"):** no hay ningún rechazo de cliente abierto en el sistema. Los 125 están `CERRADA` en gestión.
- El caso más probable es el más reciente: **Data #1104 / NC-2026-381**, NV 22991, Rechazo Cliente Crítico, ingreso 06-11-2026, salida 09-11-2026, disposición Destrucción.
- Su estado es `CERRADA`, pero **sin `fecha_cierre` ni `cerrado_por`**: se cerró desde *Gestionar* y no con "Cerrar NC". Lo mismo ocurre en 296 de las 354 NC.
- **Confirmarlo con la usuaria.** Si ella lo considera abierto, el dato en el sistema dice lo contrario y debe corregirse en la gestión, no en el indicador.
- Las "3 críticas" del Inicio anterior eran NC-2026-124/126/128 (severidad ALTA de la columna antigua), ya cerradas.

**Otros hallazgos:**
- La API `qualitycontrol` limita cada página a 200 filas (si se pide 500 entrega 200). El Inicio, la Evaluación y `faret-nc` paginan hasta `totalCount`, así que no se pierden registros (comprobado: 354/354).
- No se modificó código del producto: no hubo diferencias.

**No validado con sesiones reales:**
- La autorización con un usuario VER o SIN_ACCESO (solo se tuvo la sesión ADMIN_TI). Está cubierta por pruebas de `PermisosService` (159/159).
- Un usuario CONSULTA real.
