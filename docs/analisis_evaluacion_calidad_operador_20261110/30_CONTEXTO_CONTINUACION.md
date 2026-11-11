# 30 — Contexto para continuar (cierre del 10-11-2026)

## Dónde quedamos
- Photino **1.8.29** publicada (INNPACK). Módulo `evaluacion-operadores` oculto por defecto; ADMIN_TI o permiso VER individual. Ver `29_PILOTO_CONTROLADO_CALIDAD.md` §0.
- **Aclaración del responsable TI (10-11-2026): la idea era partir por FARET, no por INNPACK. Retomar mañana por Faret.**

## Qué reutilizar para Faret
- Motor Python `tools/fps_historico/` (conciliación, responsabilidad provisional, catálogo de 99 máquinas FPS, equivalencias): es independiente de la empresa; Faret comparte FPS pero sus NC viven en otro lado.
- Backend desktop: `Modules/EvaluacionOperadores/` (Calculator, Parser, Auditoria, Handler) y front `modules/evaluacion-operadores/`. Para Faret: módulo nuevo `faret-evaluacion-operadores` (ids/clases prefijados, empresa FARET en `PermisosService.Modulos`), sin tocar el de INNPACK.
- Fuente de NC Faret (a investigar primero): `importacion_pnc` (API `qualitycontrol`, acciones `faret.data.*`/`faret.nc.*`) + gestión en `nc_no_conformidades` (API `mejora-continua`). Faret nunca accede a MySQL directo; todo por `FaretHandler`/`Faret*ApiService`. Cuidar los 3 formatos de respuesta (`TryUnwrapApiResponse`).
- Reglas: solo lectura, default-deny, responsabilidad confirmada = 0, sin puntos oficiales, seudónimos con VER, registrar acciones de lectura en `AccionesLectura`, pruebas con `tools/evaluacion_operadores_tests`.

## Pendientes
1. Planificar (modo seguro: plan → aprobación) la versión Faret; decidir qué campos de `importacion_pnc` hay (operador, máquina, área, NP/NV) y si hay equivalencia con sesiones FPS.
2. Historial/snapshot: entrega segura por API INNPACK (y análoga para Faret) — requiere autorización de despliegue de API; hasta entonces no distribuir `auditoria_fps.json`.
3. Validación en producción de 1.8.29 con sesiones reales (ADMIN_TI ve, usuario normal no, Pedro con VER) y confirmar auto-update.
4. `FaretDashboardService.cs` sin commit (cambio ajeno, parche en `C:\Users\dcarrasco\fps_historico\`). Commit de 1.8.29 lo hace el usuario.
5. Pendientes de Calidad (equivalencias Cilíndrica 1→93, Cónica/Ovalada→78; NC 15 NV 3760 vs 3840; NC 11–13 operador declarado vs FPS; NC 14 reparto).

## Datos fuera del repo (contienen nombres; no versionar)
`C:\Users\dcarrasco\fps_historico\` (snapshots, sesiones, catálogo). Herramientas remotas: `Invoke-FpsOt.ps1` (el usuario las ejecuta con su credencial interactiva).
