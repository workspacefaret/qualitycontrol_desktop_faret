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

## 1. Fix: fecha ingresada en No Conformidades no coincidía con la fecha mostrada (INNPACK)

**Estado:** implementado y validado con `node --check` + prueba de lógica aislada. **Falta**:
validar en `dotnet run` sobre la ventana Photino real, y replicar al resto de módulos afectados
(ver lista de alcance abajo) antes de empaquetar.

**Causa raíz:** `new Date("yyyy-MM-dd")` (fecha sin hora) se interpreta como UTC medianoche en
JS; al mostrarla con `.toLocaleDateString("es-CL")` el navegador la convierte a hora local de
Chile (UTC-3/-4), corriendo la fecha un día hacia atrás siempre, sin importar la hora del día. El
backend no tenía el bug (ya entregaba `"yyyy-MM-dd"` limpio). Además, el valor por defecto "hoy"
de los formularios usaba `new Date().toISOString().substring(0,10)`, también basado en UTC — podía
precargar/guardar la fecha del día siguiente en horario de tarde/noche.

**Archivos modificados hasta ahora:**
- `src/UI/www/shared/utils.js` — nuevo helper global `window.DateUtils` (`formatear(valor)` /
  `hoyISO()`), sin tocar nada existente.
- `src/UI/www/modules/no-conformidades/no-conformidades.controller.js` — `_fecha()` y las dos
  fechas "hoy" por defecto (formulario "Nueva NC" y fallback al guardar) ahora usan `DateUtils`.

**Alcance total del bug detectado (pendiente de replicar el mismo fix, módulo por módulo, con
aprobación previa en cada paso):**
- Mismo patrón de lectura (`new Date(valor).toLocaleDateString("es-CL")` sobre fecha sin hora):
  `faret-nc`, `faret-data`, `control-documental`, `faret-control-documental`, `faret-maquinas`,
  `faret-inspecciones`, `faret-inspecciones-pallet`, `talleres-externos`,
  `faret-talleres-externos`, `faret-usuarios`.
- Mismo patrón de escritura (`new Date().toISOString().substring(0,10)` como "hoy"):
  `faret-nc`, `control-documental`, `faret-control-documental`.

**No implica cambios de backend, de base de datos, ni de ningún endpoint** — es 100% frontend.

---

## Checklist para cuando se arme el próximo instalador

- [ ] Confirmar en `dotnet run` que No Conformidades INNPACK ya no corre la fecha.
- [ ] Replicar `DateUtils` al resto de módulos listados arriba (uno a la vez, con aprobación).
- [ ] Actualizar `<Version>` en `QualityControlCenter.csproj` y `AppVersion`/`OutputBaseFilename`
      en `installers/QualityControlCenter.iss` (siguiente número tras `1.8.7`; revisar primero que
      no haya colisión con una versión ya publicada por otra sesión, mismo gotcha del Paso 1.8.6).
- [ ] `dotnet publish QualityControlCenter.csproj -c Release -r win-x64 --self-contained true`
      (apuntado al `.csproj`, nunca a la raíz del repo).
- [ ] `ISCC.exe installers/QualityControlCenter.iss`.
- [ ] Subir instalador al share + actualizar `latest.json` (backup del anterior, SHA-256
      verificado byte a byte, JSON revalidado leyendo directo desde el share).
- [ ] Documentar el release en `contex.md` y vaciar este archivo.
