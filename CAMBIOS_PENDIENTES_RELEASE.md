# Cambios pendientes de empaquetar (no están en ningún instalador todavía)

Este archivo lleva la lista de cambios ya hechos en el repo que **todavía no forman parte de
ningún instalador publicado**. Se actualiza cada vez que se aprueba y aplica un cambio nuevo, y se
vacía (dejando solo el encabezado) cuando esos cambios se empaquetan, se suben al share productivo
y se activa el `latest.json` correspondiente — en ese momento el cambio pasa a documentarse en
`contex.md` como release cerrado, igual que el resto del historial.

**Última versión efectivamente publicada en producción:** `1.8.7` (commit `a6d4c1c`, ver memoria
`project-release-1.8.7.md` / `contex.md`). Todo lo listado abajo es posterior a esa versión y sigue
sin publicar.

---

## 1. Fix: fecha ingresada no coincidía con la fecha mostrada (INNPACK y Faret, todos los módulos)

**Estado:** implementado en **todos** los módulos con el patrón detectado (INNPACK y Faret) y
validado con `node --check` en cada archivo tocado. **Falta**: validar visualmente en `dotnet run`
sobre la ventana Photino real (ver checklist abajo) antes de empaquetar.

**Causa raíz:** `new Date("yyyy-MM-dd")` (fecha sin hora) se interpreta como UTC medianoche en
JS; al mostrarla con `.toLocaleDateString("es-CL")` el navegador la convierte a hora local de
Chile (UTC-3/-4), corriendo la fecha un día hacia atrás siempre, sin importar la hora del día. El
backend no tenía el bug (ya entregaba `"yyyy-MM-dd"` limpio). Además, el valor por defecto "hoy"
de los formularios usaba `new Date().toISOString().substring(0,10)`, también basado en UTC — podía
precargar/guardar la fecha del día siguiente en horario de tarde/noche.

**`src/UI/www/shared/utils.js`** — `window.DateUtils` ampliado con 3 helpers nuevos (además de los
2 ya existentes `formatear()`/`hoyISO()`), todos evitando conversión de timezone:
- `mesActualISO()` — "yyyy-MM" del mes actual en hora local.
- `primerDiaMesActualISO()` — "yyyy-MM-01" del mes actual en hora local.
- `sumarDias(fechaISO, dias)` — suma/resta días de calendario a una fecha "yyyy-MM-dd" con
  aritmética en UTC puro sobre los componentes (nunca en hora local), para cálculos tipo
  "fecha + N días" sin arrastrar el bug de timezone.

**Módulos corregidos (patrón de lectura, `toLocaleDateString("es-CL")` → `DateUtils.formatear()`):**
`no-conformidades` (ya estaba), `faret-nc`, `faret-data`, `control-documental`,
`faret-control-documental`, `faret-maquinas`, `faret-inspecciones`, `faret-inspecciones-pallet`,
`talleres-externos`, `faret-talleres-externos`, `faret-usuarios`.

**Módulos corregidos (patrón de escritura, "hoy"/cálculos por defecto en UTC → `DateUtils`):**
`no-conformidades` (ya estaba), `faret-nc`, `control-documental`, `faret-control-documental`.

**2 hallazgos nuevos, no listados en el barrido original, mismo patrón y mismo fix** — módulo
`faret` (Inicio Faret, tocado en el Paso 63 reciente): `_rangoMesActual()` (rango de fechas para
Indicadores de calidad, usaba `new Date(y,m,1)` + `toISOString()` para "desde", y `new Date()` +
`toISOString()` para "hasta" = mismo riesgo de mostrar/filtrar con la fecha de mañana en la tarde/
noche) y `_renderIndicadoresCalidad()` (`mesActual` para cuarentenas/rechazos del mes, mismo
patrón). Ambos corregidos con los helpers nuevos (`primerDiaMesActualISO()`/`hoyISO()`/
`mesActualISO()`).

**No implica cambios de backend, de base de datos, ni de ningún endpoint** — es 100% frontend.

---

## 2. Rediseño de Inicio Faret (fix "Rechazo", 7 indicadores nuevos, limpieza de widgets sin uso)

**Estado:** implementado y con `dotnet build` limpio. **Falta**: validar visualmente en `dotnet run`
sobre la ventana Photino real (no verificado en esta sesión, solo build + revisión de código).

Ver `contex.md` Paso 63 y la sección correspondiente de `CLAUDE.md` para el detalle completo. Solo
la parte que vive **en este repo** necesita instalador — los 2 fixes de backend de esa misma sesión
(`mejoracontinua.api` y `apiqualitycontrolfaret`) **ya están desplegados en producción por su cuenta**
(APIs en IIS/SRV-API, no pasan por el instalador de QCC) y no forman parte de este pendiente.

**Archivos modificados en este repo (los que sí necesitan el próximo instalador):**
- `src/UI/www/modules/faret/faret.view.html`
- `src/UI/www/modules/faret/faret.controller.js`
- `src/Backend/Modules/Faret/FaretHandler.cs`
- `src/Backend/Services/FaretApi/FaretDashboardService.cs`
- `src/Backend/Models/FaretApi/FaretDashboardDto.cs`

**Resumen:** filtro de la categoría "Rechazo" en el gráfico "No conformidades por proceso"; 7
indicadores/gráficos nuevos (Producto Terminado, Talleres externos atrasados, tiempo de cierre de
NC, % recuperación + Top clientes, filas en Resumen general); KPI "% Acciones completadas a tiempo"
ahora con `fecha_cierre` real (ya no dice "aprox."); eliminados sin reemplazo los 3 widgets de
"acciones correctivas" (Estado, Por proceso, Cumplimiento de plazo) por confirmarse 0 uso real.

---

## 3. Fix: botón "Gestionar" de Alertas activas (Inicio INNPACK) llevaba a 1 solo registro

**Estado:** implementado y con `dotnet build` limpio (sin errores CS; el único error del build es
el `.exe` bloqueado por la instancia de QCC corriendo ahora mismo, PID a verificar en `dotnet run`).
**Falta**: validar en `dotnet run` sobre la ventana Photino real.

**Causa raíz (alerta de "desviación"):** `HomeService.ObtenerAlertasActivas()` agrupa
`registro_fallas_visuales` por proceso+defecto+criticidad con `COUNT(*)` (puede representar varios
`registros_control` distintos en 30 días), pero solo devolvía `MAX(rc.id)` — un único registro. El
botón "Gestionar" (`inicio.controller.js`) deep-linkeaba a `registros-control` filtrando por
`id` exacto, y ese módulo no tenía forma de filtrar por proceso/defecto (solo `id`/`np`/`turno`/
`estado`/fecha) — por eso siempre mostraba 1 registro aunque la alerta dijera "N casos".

**Fix:** `HomeService` ahora agrupa y devuelve también `procesoId`/`parametroId`/`defecto`.
`RegistrosControlRepository/Service/Handler.ObtenerRegistros` suman filtros opcionales
`procesoId`/`parametroId` (`rc.proceso_id = ...` / `EXISTS (...registro_fallas_visuales...)`), sin
`LIMIT` cuando están activos (mismo criterio que el filtro por NP). `inicio.controller.js` pasa
esos campos en el deep-link; `registros-control.controller.js` los usa como filtro y el banner
pasa de "Mostrando el registro #X" a "Mostrando N caso(s) de "<defecto>" en <proceso>". Exportar/
Imprimir desde esa vista filtrada también respetan el filtro nuevo.

**Hallazgo relacionado, mismo bloque de código, corregido en el camino (aprobado por el usuario):**
la alerta "Laboratorio" (`HomeService.ObtenerAlertasActivas`) y el KPI "Ensayos pendientes" de
"Resumen general" (`ObtenerResumenGeneral`) todavía consultaban la tabla vieja `registro_ensayos` y
apuntaban al módulo `"laboratorio"`, **eliminado hace varios releases** (reemplazado por
"Laboratorio - Muestras"/`muestra-laboratorio`) — el botón "Gestionar" de esa alerta intentaba abrir
un módulo inexistente. Repuntado a `muestra_laboratorio` (`estado IN ('Pendiente','En analisis')`,
misma definición que ya usa el propio módulo nuevo en su KPI y en `ObtenerKpis`, que sí estaba
corregido). `MuestraLaboratorioRepository.Listar` ahora acepta una lista de estados separada por
comas en el parámetro `estado` (antes solo iso valor exacto) para poder filtrar por
"Pendiente,En analisis" a la vez; `muestra-laboratorio.controller.js` suma el mismo mecanismo de
deep-link (antes no tenía ninguno) con banner "Mostrando N muestra(s) pendiente(s)..." + "Ver
todas".

**Archivos:** `src/Backend/Modules/Home/HomeService.cs`,
`src/Backend/{Modules,Repositories}/RegistrosControl/*`,
`src/Backend/Repositories/MuestraLaboratorio/MuestraLaboratorioRepository.cs`,
`src/UI/www/modules/inicio/inicio.controller.js`,
`src/UI/www/modules/registros-control/registros-control.controller.js`,
`src/UI/www/modules/muestra-laboratorio/muestra-laboratorio.{controller.js,view.html}`.

**No implica cambios de esquema de base de datos.**

---

## Checklist para cuando se arme el próximo instalador

- [ ] Confirmar en `dotnet run` que las fechas (No Conformidades INNPACK/Faret, Control Documental,
      Data Faret, Máquinas Faret, Inspecciones Faret, Talleres Externos, Usuarios Faret) ya no
      corren un día, y que "hoy"/"próxima revisión"/rango de mes se precargan correctos.
- [ ] Confirmar visualmente en `dotnet run` el Inicio Faret rediseñado (punto 2): los 7 indicadores
      nuevos muestran datos reales y los 3 widgets de acciones correctivas ya no aparecen.
- [ ] Confirmar en `dotnet run` (punto 3): la alerta de desviación en Inicio INNPACK con "N casos"
      muestra los N registros al hacer clic en "Gestionar" (no solo 1), y la alerta "Laboratorio"
      abre "Laboratorio - Muestras" con las muestras pendientes reales, no un módulo inexistente.
- [ ] Actualizar `<Version>` en `QualityControlCenter.csproj` y `AppVersion`/`OutputBaseFilename`
      en `installers/QualityControlCenter.iss` (siguiente número tras `1.8.7`; revisar primero que
      no haya colisión con una versión ya publicada por otra sesión, mismo gotcha del Paso 1.8.6).
- [ ] `dotnet publish QualityControlCenter.csproj -c Release -r win-x64 --self-contained true`
      (apuntado al `.csproj`, nunca a la raíz del repo).
- [ ] `ISCC.exe installers/QualityControlCenter.iss`.
- [ ] Subir instalador al share + actualizar `latest.json` (backup del anterior, SHA-256
      verificado byte a byte, JSON revalidado leyendo directo desde el share).
- [ ] Documentar el release en `contex.md` y vaciar este archivo.
