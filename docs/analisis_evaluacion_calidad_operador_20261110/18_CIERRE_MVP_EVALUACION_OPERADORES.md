# 18 — Cierre del MVP: Evaluación de Calidad por Operador (10-11-2026)

> Actualización: validación en Photino real, correcciones y versión candidata 1.8.29 en `19_VALIDACION_FINAL_Y_VERSION_CANDIDATA.md`.

**Estado: COMPLETADO como MVP técnico local, con RESTRICCIONES de datos.** Sin despliegue, sin commit, sin cambios en SQL/API/MCP.

## Implementado
Módulo independiente "Evaluación de Calidad por Operador" (sidebar INNPACK, solo lectura): filtros año/mes (por `fecha_fabricacion`)/máquina/operador con "Limpiar"; 7 tarjetas rotuladas "registros" o "puntos"; gráficos de nivel, evolución mensual (registros + puntos) y máquina; tabla por operador en orden alfabético (sin ranking); banners de transparencia (operador/máquina/fecha/nivel, atribución no confirmada, datos insuficientes <30 evaluables); aviso fijo "indicador descriptivo, no evaluación oficial"; estados cargando / sin resultados / error de conexión / acceso denegado / datos incompletos (sin ceros falsos si falla la API).

## Archivos
Nuevos: `src/Backend/Modules/EvaluacionOperadores/{EvaluacionOperadoresCalculator,EvaluacionOperadoresParser,EvaluacionOperadoresHandler}.cs`; `src/UI/www/modules/evaluacion-operadores/{.view.html,.controller.js,.css}`; `tools/evaluacion_operadores_tests/` (pruebas, excluido del build de la app). Modificados (mínimos): `MessageRouter.cs` (rama de prefijo), `PermisosService.cs` (módulo + regla de acceso), `index.html` (CSS + botón). Docs 11, 12, 13, 18.

## Endpoints
Ninguno nuevo en la API. Acción de desktop: `evaluacionOperadores.resumen` (lee `GET api/no-conformidades`, ámbito PRODUCTO, existente).

## Seguridad
Sin credenciales de BD en la app (usa el JWT de sesión y la API existente; `qcc_audit_ro` no se usa). Backend valida: sesión, empresa INNPACK, acceso al módulo aunque llegue con otro `_modulo`, ninguna escritura (sin prefijos). Por defecto nadie lo ve salvo ADMIN_TI; se habilita por la matriz de permisos. No se envían filas crudas al frontend. Nombres de operador visibles solo para autorizados (necesario para la tabla).
**Limitación:** la API de NC no distingue permisos por módulo; el control está en el desktop (igual que los demás módulos). Quien llame la API con un JWT válido puede leer NC como ya ocurre hoy.

## Evidencia de pruebas (ejecutadas)
- `dotnet build` app: 0 errores. `node --check` del controlador: OK.
- `tools/evaluacion_operadores_tests`: **41/41 OK** (datos sintéticos): niveles/ponderaciones, operadores genéricos/múltiples/variantes, exclusiones, eliminadas, filtros combinados y vacíos, período por fecha de fabricación, umbral de suficiencia, parser de la API, y autorización con el `PermisosService` real (sin sesión, sin permiso, `_modulo` ajeno, VER, EDITAR sin escrituras, ADMIN_TI, empresa FARET).
- Cálculo contra datos reales: la lógica del módulo reproduce la simulación SQL (5 evaluables, 13 puntos) **por construcción de reglas idénticas**, pero el módulo **no se ejecutó contra la API real** (requiere sesión).
- Visual: Edge headless con puente simulado y CSS real: estados OK, error, acceso denegado, sin resultados; corregido un desborde horizontal (`.table` min-width). **No se probó en la ventana Photino real ni con sesión real.**
- **Regresión:** no se ejecutó una suite (no existe en el repo). Cambios en código compartido: 1 rama en el router y 2 reglas en permisos (módulo nuevo por defecto SIN_ACCESO; prefijo `evaluacionOperadores.` exige acceso). Compila y las pruebas de permisos confirman que no altera otros módulos; **No Conformidades/Trazabilidad/Laboratorio no se probaron manualmente.**

## Limitaciones conocidas
Solo 7 NC de producto (5 evaluables); 0 en octubre 2026; atribución a persona no verificada (texto libre); `empresa` NULL asumido INNPACK; NC internas fuera; sin normalización por producción; sin exportación; sin Faret ni FPS.

## Decisiones pendientes de Calidad
Ver doc 12 (validar pesos, umbral de 30, NC sin operador/varios operadores, `severidad` vs `nivel`, NC internas, normalización) y: ¿7 NC de producto es la realidad o subregistro?

## Para un futuro despliegue
1) Revisión funcional con usuarios de Calidad. 2) Prueba manual en ventana Photino con sesión INNPACK (ADMIN_TI y un usuario con VER) y regresión de NC/Trazabilidad/Laboratorio. 3) Subir versión (3 propiedades del csproj + `.iss` + sidebar + novedades), `dotnet publish` del `.csproj` y ISCC. 4) Comparar con el `latest.json` real antes de publicar (política en `.claude/DEPLOY_POLICY.md`). 5) Habilitar por la matriz a los usuarios autorizados. No requiere SQL ni despliegue de API.

## Estimación restante
Revisión y ajustes tras feedback ≈ 4–6 h; prueba manual + regresión ≈ 3 h; release ≈ 2 h. Todo condicionado a que Calidad confirme que el indicador tiene sentido con tan pocos datos.

> Actualización: ver `23_AUDITORIA_REAL_FPS_Y_MEJORAS_MODULO.md` (auditoría real FPS, sin penalización personal, privacidad de nombres).
