# 19 — Validación final y versión candidata 1.8.29 (10-11-2026)

**Estado técnico: APTO PARA REVISIÓN FUNCIONAL. NO se declara apto para despliegue**: faltan las pruebas con sesión INNPACK real (bloqueo abajo). Sin despliegue, commits, push, cambios de permisos ni de datos.

## Evidencia ejecutada
| Prueba | Resultado |
|---|---|
| `dotnet build` (Debug y Release) | 0 errores |
| Pruebas del backend (`tools/evaluacion_operadores_tests`, datos sintéticos, `PermisosService` real) | **43/43 OK** (+2 nuevas: listado truncado) |
| **Ventana Photino real** (WebView2 por CDP, app iniciada con `dotnet`-build local) | Inicia sin errores; el ítem aparece en el sidebar principal (entre NC Internas y Control Documental, no dentro de No Conformidades); el módulo abre; ancho real 1582×793 sin desborde; layout verificado con captura |
| UI real + respuestas simuladas del calculador real (`realtest.mjs`) | **15/15 OK**: render, 2 operadores/3 gráficos/advertencias, filtros año+mes, operador, combinados (llegan juntos al backend), Limpiar, sin resultados, error de conexión y error de API (contenido oculto, sin ceros), navegar a No Conformidades y volver, 0 errores JS |
| Backend real sin sesión (en la ventana real) | `evaluacionOperadores.resumen` con su módulo, con `_modulo` ajeno y una escritura inventada → las tres rechazadas ("No hay una sesión activa") |
| Humo de navegación (real): inicio, No Conformidades, NC Internas, Trazabilidad, Laboratorio-Muestras, Registros de Control, Dashboard, Máquinas, módulo nuevo | Todos cargan su vista sin errores JS (sin sesión no hay datos) |
| Revisión de código de la API (solo lectura) | `GET api/no-conformidades`: `[Authorize]`, siempre `eliminado = 0`, `ambito = PRODUCTO`; con `empresa=INNPACK` incluye filas legacy `empresa IS NULL` y **excluye FARET**; sin tope en `pageSize`; devuelve `total` |

## Errores encontrados y corregidos
1. **Posible mezcla de empresas:** el handler no pasaba `empresa`; ahora envía `ámbito=PRODUCTO` + `empresa=INNPACK` (coherente con la API: NULL cuenta como INNPACK, FARET excluido). Hoy las 7 NC tienen `empresa` NULL, así que no había filtración real, pero quedaba abierta si aparecía una NC de producto con `empresa='FARET'`.
2. **Datos parciales:** si la API devuelve menos filas que `total`, el handler ahora falla con "Listado incompleto" en vez de calcular con datos parciales (+2 pruebas).
3. Mensaje de error con doble punto ("…sesión.. No se muestran cifras").
4. Desborde horizontal por el `min-width` de `.table` (corregido antes; confirmado en la ventana real).

## Coherencia de indicadores (verificado por pruebas + lectura de código)
Crítico 10 / Mayor 5 / Menor 1; la penalización sale de `nivel` (nunca de `severidad`); el mes sale de `fecha_fabricacion`; eliminadas excluidas (también por la API); incompletos separados de evaluables y sus puntos aparte; sin nota ni ranking (orden alfabético); aviso de atribución no confirmada.

## NO ejecutado — bloqueos exactos
- **Datos reales por la aplicación:** no hay sesión INNPACK disponible para mí. En el perfil local solo hay credencial recordada de **Faret** (no corresponde a este módulo, no se usó) y no hay contraseña recordada de INNPACK; no se usan cuentas administrativas ni nuevas. Por eso quedan sin probar: que la app reciba las 7 NC reales, que los puntos coincidan (esperado 5 evaluables / 13 puntos; ver doc 12), y que los filtros usen datos reales.
- **Permisos con sesión real:** usuario autorizado abre, sin permiso no ve el ítem en el sidebar y el backend lo rechaza. Cubierto solo por pruebas unitarias del `PermisosService` real y por el rechazo sin sesión; la ocultación del ítem con sesión depende de `refreshSidebarState` y no se vio en vivo. Sin sesión el sidebar muestra todos los ítems (comportamiento previo).
- **Regresión con datos** de No Conformidades, Trazabilidad y Laboratorio, login/logout: solo humo de carga (sin errores JS). No hay suite automatizada de regresión en el repo. **No se declara regresión aprobada.**
- Capturas: las de la ventana real son parciales (la captura por CDP es intermitente).

### Cómo cerrar los bloqueos (≈30 min, con una persona autorizada)
1. Iniciar sesión INNPACK como ADMIN_TI en la app (la ve por defecto) y abrir el módulo: debe mostrar 7 registradas… (esperado: período sin filtros = 7 NC, 5 evaluables, 13 puntos, 1 sin fecha, 1 sin operador; octubre 2026 = sin resultados).
2. Con un usuario de prueba sin permiso: el ítem no debe verse; con permiso VER personalizado: sí. (Si cambia la matriz de producción, hacerlo solo con autorización.)
3. Repasar No Conformidades, Trazabilidad y Laboratorio, y cerrar/abrir sesión.
4. Se pueden reutilizar `tools/evaluacion_operadores_tests/photino_cdp/smoke.mjs` con la app iniciada con `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9333`.

## Versión candidata (LOCAL, no publicada)
- Versión productiva vigente: **1.8.28**. Candidata: **1.8.29** (`QualityControlCenter.csproj` ×3 propiedades, `installers/QualityControlCenter.iss` ×3 líneas, texto del sidebar en `index.html`, modal de novedades con 1 diapositiva del módulo nuevo).
- Instalador local: `C:\Installers\QualityControlCenter_Setup_v1.8.29.exe` — 58.836.263 bytes, SHA-256 `533DAA576FAD146E89A7503E8AA42A1559868BEFDF75939B481E0163316B94F2`.
- `QCC.Updater.exe` **no se republicó** (ya instalado en `ProgramData`); el del árbol de publicación pesa 67.527.732 bytes (otro hash de bundle respecto al de notas anteriores; sin cambios de código; el instalador lo copia solo si no existe).
- Revisión del contenido publicado: 290 archivos; **sin CSV, sin carpeta de auditoría, sin `tools/` ni `docs/`**; incluye el módulo nuevo; `config.json` es el existente (ya era parte de la app).
- **Falta antes de publicar:** comparar con el `latest.json` real del share (¿sigue en 1.8.28?; otra sesión pudo usar 1.8.29), autorización expresa, pruebas con sesión real (arriba).

## Procedimiento de despliegue (cuando se autorice; ver `docs/OPERACION_DESPLIEGUE_QCC.md` y `.claude/DEPLOY_POLICY.md`)
No requiere SQL, API ni servicios. 1) Respaldar `latest.json` del share con marca de tiempo. 2) Subir el instalador 1.8.29 al share y verificar el SHA-256 igual al local. 3) Activar `latest.json` (JSON de una línea, validar con un parser leyéndolo del share). 4) Confirmar la auto-actualización en un cliente real. 5) Habilitar a los usuarios por Gestión de Usuarios (el módulo es SIN_ACCESO por defecto).
**Rollback:** copiar el respaldo sobre `latest.json` (los clientes que no actualizaron siguen en 1.8.28; los que sí, con 1.8.28 el módulo sigue oculto por permisos; si hace falta, reinstalar 1.8.28 desde el share). Como el módulo es de solo lectura y sin SQL/API, no hay datos que revertir.

## Pendientes de negocio (Pedro / Nicolás)
Confirmar si 7 NC de producto es el volumen real o hay subregistro; aprobar las ponderaciones 10/5/1; criterio de atribución al operador (texto libre sin vínculo a empleados) y trato de NC sin operador o con varios; tratamiento de las NC internas (183 activas, 36 INNPACK); validar el umbral de 30 NC evaluables.
