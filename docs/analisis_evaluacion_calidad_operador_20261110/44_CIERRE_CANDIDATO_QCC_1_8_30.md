# Fase 44 — Cierre del candidato QCC 1.8.30 (11-11-2026)

## Veredicto: **LISTO PARA PILOTO** (no es autorización de publicación)
Sin defectos bloqueantes. Nada publicado: no se tocó el share de actualizaciones ni `latest.json`; sin commit/push; sin cambios en fps-api, calidad-api, SQL, PM2, watchdog ni otros proyectos.

## Instalador candidato
- Ruta: `C:\Installers\QualityControlCenter_Setup_v1.8.30.exe` (58.897.654 bytes, generado 11-11-2026 12:49)
- **SHA-256: `434641543055b013071549323641577444962fc601dcd29db2384bfef65f3c24`**
- El candidato anterior (SHA-256 `8c47ff0e…`, sin los cambios de Fases 42–43) se conservó como `C:\Installers\QualityControlCenter_Setup_v1.8.30_ANTERIOR_sin_fase42-43.exe`. No hay 1.8.30 en el share (la publicada es 1.8.29).
- Versión 1.8.30 ya estaba en las 3 propiedades del `.csproj` (`Version`/`AssemblyVersion`/`FileVersion`), `.iss` (+`AppVerName`), sidebar (`Version 1.8.30` confirmado en la ventana real) y `novedades.js` (ID 1.8.30).
- Contenido verificado en el paquete compilado: `FaretUniversoCache` con `CancelarYSoltar` (corrección Fase 43), módulo front con `data-fevf-cancelar` y `fevf-actualizar` (Fase 42), versión 1.8.30. `QCC.Updater.exe` no se republicó (el mismo del 27-10).
- Nota de proceso: había una instancia de QCC del usuario (PID 8920) bloqueando `bin\Release\...\publish`; no se la detuvo. Se publicó a una carpeta temporal y se compiló el instalador con una copia temporal del `.iss` (ya eliminada; el `.iss` del repo no cambió).

## Compilación y pruebas
- Publish Release win-x64 self-contained: correcto. Compilación Release previa: correcta.
- Pruebas automatizadas existentes: **194/194 OK** (re-ejecutadas hoy).
- Arneses de Fases 42/43 sin cambios de código desde entonces (41/41, 22/22, 40/40); no se repitieron.
- **Photino real arrancado localmente** (desde la publicación temporal, con puerto de depuración, sin credenciales): ventana abre, muestra el selector de empresa, "Version 1.8.30", el módulo Evaluación por Operador carga (botón Actualizar presente) y, sin sesión, responde "No hay una sesión activa. Vuelve a iniciar sesión." sin errores JS. La instancia de prueba se cerró.

## Estado FARET / INNPACK
Compilan; ventana y selector de empresa funcionan. **No verificado** (requiere login y credenciales, no se usaron): sesión FARET/INNPACK, módulos con datos, permisos reales y filtros/Actualizar/Cancelar dentro de Photino con sesión (sí probados en Edge headless con el handler real, Fase 43). INNPACK (`EvaluacionOperadoresHandler`) sin cambios.

## Archivos ajenos incluidos en el build (no descartados)
El árbol trae cambios sin commit ajenos al módulo que **sí van en este instalador porque compilan junto al resto**: `FaretDashboardService.cs`/`FaretDashboardDto.cs`, `FaretHandler.cs`, `faret.controller.js`/`.view.html`, `faret-nc.controller.js`, además de `MessageRouter.cs`, `PermisosService.cs`, `index.html`, `novedades.js`. Decisión de si se quedan en 1.8.30 queda en el usuario; para excluirlos habría que commitear/separar antes de empaquetar.

## Pendientes bloqueantes
Ninguno. Pendiente no bloqueante: el puerto de depuración 9333 sigue abierto porque el proceso WebView2 es compartido con tu instancia de QCC (PID 8920); se cierra al cerrar esa ventana.

## Qué probar tú (máx. 5 puntos, instalar el .exe o abrir tu QCC con sesión)
1. Iniciar sesión en FARET y abrir Evaluación por Operador: ver "Cargando…" con Cancelar y luego datos y "Datos de FPS cargados hace…".
2. Cambiar filtros y pulsar Limpiar: debe responder al instante (sin volver a cargar FPS).
3. "Actualizar datos" y, durante la carga, Cancelar: los datos previos se mantienen.
4. Con un usuario de solo vista: nombres como `OP-xxxxxx` y aviso de privacidad; con edición: nombres reales.
5. Cerrar sesión, entrar a INNPACK y navegar un par de módulos; volver a FARET.
(Observar CPU/solicitudes de fps-api durante la prueba, con el watchdog activo.)
