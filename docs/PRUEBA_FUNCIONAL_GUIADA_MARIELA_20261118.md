# Prueba funcional guiada — 5 módulos de Mariela (desktop local, APIs de producción desplegadas) — 18-11-2026

Cómo: `cd` al repo (rama `feature/laboratorio-reg-lab-04`, HEAD con commits de Mariela) → `dotnet run` → iniciar sesión **INNPACK** con tu usuario habitual (admin_ti). Sin instalador ni `latest.json`.
Regla: **solo lectura**. No guardes informes, mermas, cierres, certificados, documentos ni factores en producción: las tablas `np_*`, `cert_destruccion*` y `trazabilidad_*` no tienen DELETE para la API (lo creado solo se puede anular lógicamente; los informes y la auditoría no se anulan). Si se decide probar escritura, se acuerda antes una NP/identificación de prueba y quién limpia (DBA).
NP de lectura (ya validadas con fps-api): **4007, 3951, 4002, 4128**; lote **5433-1**. NP inexistente para ver el estado vacío: 999999.

## Ya verificado sin ventana (evidencia)
- Compila (0 errores); `node --check` OK en los 4 controladores + `calidad-np-base.js`; los botones/módulos/controladores están registrados y cargados (`index.html`, `data-empresa="INNPACK"`: no aparecen en Faret).
- 22 rutas `calidad-np` y 11 de `trazabilidad-documentos` que usa el desktop = rutas que expone la API desplegada (0 faltantes); la 23.ª (evidencia) se arma por otra ruta del handler.
- Permisos reales (`PermisosService`, harness): 214 casos, 0 diferencias — SIN_ACCESO bloquea todo; VER solo lecturas; EDITAR solo los prefijos de su módulo; escrituras cruzadas entre módulos rechazadas; ADMIN_TI permitido; sesión FARET rechazada.
- API desplegada (INNPACK): flujo 3, checklist 23, 0 errores, escrituras negativas no ejecutadas. fps-api: 8/8.

## Guía (marca ✔/✘ y anota hallazgos)
**A. Navegación** (INNPACK): sidebar muestra Trazabilidad, Balance y Mermas, Cierre de NP, Certificados Destrucción; cada uno abre sin error de consola; en sesión FARET no aparecen.
**B. Trazabilidad** (módulo existente ampliado): NP 4007 → pestañas/secciones integral (procesos, liberaciones, despachos, calidad, documentos), advertencias visibles, fuentes sin "No disponible" (fps-api ya está). Lote 5433-1. NP 999999 → vacío, sin error. Documentos SGI: checklist 23 requisitos visible, "Ver historial" de un requisito. Factor: lista. Auditoría: lista vacía. **NO** subir documentos, proponer/confirmar factor ni "Guardar versión" del informe PDF. "Generar informe PDF" (solo vista previa/impresión) sí es seguro si no guarda.
**C. Balance y Mermas**: NP 4007/3951 → balance PROVISIONAL (rótulo visible), entradas/salidas por proceso, "POR CONCILIAR" no clasificado como merma, KPIs; NP multi-ítem → sin conversiones + advertencia. Lista de mermas vacía. **NO** crear/validar/anular mermas.
**D. Cierre de NP**: NP + ítem → formulario con cantidades FPS/QCS; estado vacío sin error. **NO** guardar.
**E. Certificados Destrucción**: lista vacía; flujo (3 cargos) visible; abrir "Nuevo" sin guardar. **NO** crear/solicitar/aprobar/emitir.
**F. Permisos (UI)**: con un usuario VER en esos módulos → modo "Solo vista", botones de escritura ocultos; con SIN_ACCESO → módulo oculto. *Requiere un usuario de prueba con esos niveles (hoy no se dispone).*
**G. Regresión INNPACK**: Inicio, Dashboard, Producción, Data/Registros de Control, Laboratorio–Muestras, Talleres Externos, Producto Terminado, Despachos Diarios, Certificados de Liberación, Control Documental, No Conformidades/NC Internas, Formularios, Gestión de Usuarios: abre, lista carga, un filtro, Excel sin error.
**H. Regresión FARET**: cerrar sesión → empresa FARET → login Faret: Inicio, Inspecciones, No Conformidades, Data, Talleres Externos, Producto Terminado, Control Documental, Despachos: abre y carga.
**I. Consola**: sin errores rojos nuevos al navegar; sin 401/403/5xx inesperados en red (DevTools de la ventana si está habilitado).

## No se puede probar (identificado, NO aprobado)
| Función | Motivo |
|---|---|
| Crear/corregir/validar/anular mermas; cierre guardado; certificados crear→aprobar→emitir→ejecutar; guardar informe; subir documentos SGI; proponer/confirmar/rechazar factor | Escritura real en producción sin autorización ni vía de limpieza (sin DELETE). Pendiente: acordar NP de prueba y limpieza por DBA, o entorno de pruebas |
| Casos 403 de rol (validar mermas, aprobar certificados, confirmar factor) y UI VER/SIN_ACCESO | Falta usuario de prueba no administrador; el script de solo lectura no los cubre |
| Correlativo `CD-AAAA-NNNNN`, PDF/Excel de certificados con datos | Sin datos de merma/certificado |
| Plantillas oficiales REG-SGI-TDP y REG-SGI-CDD-V11 | No entregadas: formato provisional |
| Aprobadores reales del flujo | Sin definición: flujo sembrado provisional (Jefatura de Calidad → Ejecutivo Comercial → Gerencia Comercial) |
| Significado de pallets, material retenido/reproceso, asignación de proceso por ítem en NP multi-ítem | Sin definición oficial / sin fuente FPS |
| Aspecto visual real en Photino (capturas) | No automatizable aquí; lo valida una persona |
