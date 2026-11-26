# Versión candidata 1.8.41 — Trazabilidad, Mermas, Cierre y Destrucción

26-11-2026. **Candidata para revisión funcional. Nada desplegado ni publicado**; `latest.json` no se modificó.
No publicar el instalador 1.8.40. Antes de desplegar: `.claude/DEPLOY_POLICY.md` y `docs/OPERACION_DESPLIEGUE_QCC.md`.

## Contenido

Carpeta `Desktop\Proyectos\_releases\qcc_1.8.41\` (hashes en `SHA256SUMS.txt`; la web trae el suyo).

| Paquete | Origen (commit local, sin push) | Notas |
|---|---|---|
| `desktop\QualityControlCenter_Setup_v1.8.41.exe` | escritorio `0f9282a` | También en `C:\Installers\`. `QCC.Updater` sin cambios |
| `api-innpack\` (DLL + PDB) | API INNPACK `6c95fb8`, SDK 10.0.404 | **Exige** la migración 2026_12 |
| `apisapfaret\` (DLL + PDB) | apisapfaret `d87d118`, SDK 9.0.318 | Incluye adjuntos SAP y despacho por nota de venta |
| `fps-api\src\` (2 archivos) | sin git | `trazabilidad.service.js` y `trazabilidad.routes.js` |
| `sql\` | repo API INNPACK | Respaldo, migración, verificación y rollback |
| `web\qcc-web-0.11.0_photino-1.8.41_...\` | web `4b2da32` | Compuerta completa aprobada |

Antes de reemplazar una DLL: comparar la de producción con una compilación del commit que está desplegado. Si no
coincide, detenerse (la rama puede traer cambios que no son de este requerimiento).

## Dependencias y orden de instalación

| # | Paso | Ejecuta | Depende de | Reinicio |
|---|---|---|---|---|
| 0 | Probar la migración en un SQL Server 2016 no productivo (definir instancia) | TI/DBA | — | — |
| 1 | Respaldo y migración 2026_12 (`docs/MIGRACION_CALIDAD_NP_2026_12_COMANDOS.md`) | DBA | 0 | — |
| 2 | API INNPACK | TI | 1 | pool `QualityControlInnpackPool` |
| 3 | apisapfaret | TI | — | pool `ApiFaretPool` |
| 4 | fps-api (2 archivos) | TI | — | tarea `FpsApi` (~75 s en abrir el puerto) |
| 5 | Escritorio en un equipo piloto (instalar a mano) | TI + Calidad | 2, 3, 4 | — |
| 6 | Web | TI | 2, 3, 4 | gateway web |
| 7 | `latest.json`, **al final** y solo con aceptación | TI | 5 | — |

- La API INNPACK desplegada hoy sigue funcionando con la migración aplicada.
- Con la API nueva, el escritorio anterior no puede confirmar una destrucción ejecutada: acortar el tiempo entre 2 y 7.
- Si fps-api no se actualiza, el escritorio consulta el despacho por apisapfaret (scope `logistica:read`). Si ninguna
  fuente responde, muestra el dato como no validado.
- Antes de numerar o publicar, comparar con el `latest.json` real del share.

## Respaldo y reversión

Respaldos en `C:\API WEB\_backups\<componente>_pre_calidadnp_<aaaammdd_hhmmss>`, verificando hash antes de copiar.

| Componente | Respaldar | Reversión |
|---|---|---|
| SQL | `.bak` COPY_ONLY + `RESTORE VERIFYONLY` | Script de rollback; si se niega por datos nuevos, no forzar. Restaurar el `.bak` solo por decisión del DBA |
| API INNPACK | DLL + PDB | Detener pool, restaurar, iniciar, `health` |
| apisapfaret | DLL + PDB | Igual, con `ApiFaretPool` |
| fps-api | los 2 archivos **del servidor** | Detener tarea, restaurar, iniciar, `health` |
| Web | jar y `photino-www` vigentes | Volver a los anteriores |
| `latest.json` | copia fechada | Restaurarlo. Un equipo ya actualizado se reinstala con el Setup 1.8.39 |

Revertir en orden inverso. La migración es aditiva: puede quedar aplicada al volver a la API anterior.

## Lo que necesita TI

1. Ejecutar los pasos de la tabla, con sus respaldos y reinicios.
2. Autorizar una lectura de SAP/FPS para: probar el despacho por Service Layer y los adjuntos reales (tiempo máximo de
   25 s); confirmar si `DM_Moldes.Perfil` corresponde al perfil del artículo SAP; y si el ítem de la etapa final en
   `ZZZProcesosProductivos` es el ítem SAP (cantidad fabricada). Sin esto, esos dos datos no se muestran.
3. Aviso vigente: la fps-api desplegada puede **sobrestimar el despacho** de NP con factura de reserva. No está
   atribuido a ninguna NP concreta.
4. Mantención y TI (MCC Faret): tabla validada **máquina FPS (código `aplatz_id` y nombre corto) → activo(s) MCC
   (`activo_id`)** y un acceso de solo lectura para sistemas a activos y órdenes de trabajo (hoy MCC solo admite
   sesión de usuario). No se construyó integración ni se infirieron equivalencias.

## Estado de las pruebas

**Automáticas (26-11):**

| Componente | Resultado |
|---|---|
| Escritorio: Calidad NP / ZIP y permisos / barreras de solo lectura | 141/141 · 24/24 · 12/12; compila con 0 errores |
| API INNPACK | 217/217 (LocalDB) |
| apisapfaret | 526 correctas, 38 omitidas (requieren SAP real) |
| fps-api | 73/73 |
| Web | Java 1339/1339, contrato 66/66, puente 37/37, contrato 343/343, paridad 0 críticos y 4 advertencias |

Las 4 advertencias de paridad: tres módulos de Calidad NP y Clasificación de pallets sin "nivel de validación"
declarado. La paridad la califica "compatible solo por contrato y simulaciones".
La huella de permisos de la web la aprobó Claude tras comprobar que Java aplica las 8 lecturas nuevas y la regla de
Calidad NP: **requiere revisión de una persona**.

**Simuladas:** E2E con NP ficticia 9999 en navegador y vistas con datos ficticios. No son Photino ni datos reales.

**Funcional de punta a punta (26-11, `tools/e2e_aislado`: front y `MessageRouter` reales en navegador, API INNPACK
local sobre LocalDB, FPS ficticio; no es la ventana Photino):**

- OK: ficha e indicadores por ítem; navegación entre los cuatro módulos; factor; mermas (validar, corregir, anular);
  balance; cierre (borrador, cierre, historial); certificados (saldo por merma, aprobación, emisión, ejecución parcial
  con observación obligatoria, anulación que conserva el correlativo); documentos, ZIP con índice y faltantes;
  informe V05 con versión guardada; detalle de corrida y registro original; PDF y Excel generados;
  `prueba.ver` sin botones de escritura y escritura rechazada; `prueba.sinacceso` sin los cuatro módulos.
- Corregido (`0f9282a`): indicadores que mezclaban ítems; responsable de la cantidad manual ausente en PDF/Excel del
  cierre; rótulos "(borrador)" en un certificado pendiente y "factor no confirmado" en NP de varios ítems.
- No comprobable con el simulador: NP inexistente (devuelve siempre la 9999; cubierta por prueba automática),
  búsqueda por lote (sin filas), inspección de camión (sin Formularios), adjuntos SAP (sin apisapfaret).
- La API aceptó aprobar en cualquier orden y que el creador aprobara los tres cargos (cuestionario, punto 2).

**Reales:** solo la validación parcial de 8 NP con la fps-api desplegada (versión anterior; 85 coinciden, 7 difieren).

**Pendientes:** ventana Photino, código nuevo con datos reales, Service Layer real, SQL Server 2016, web en navegador,
regresión FARET en pantalla y aceptación de Calidad.

## Validación en Photino (la ejecuta una persona)

Datos ficticios en el entorno local; no usa bases ni credenciales reales. Revisar antes los scripts
(`tools/entorno_aislado/README.md`). Desde la raíz del repositorio:

```powershell
node tools/entorno_aislado/preparar.js --recrear   # rehace solo la base LocalDB de pruebas
node tools/entorno_aislado/iniciar.js
```

Elegir INNPACK; usuario `prueba.aislado` y la clave de pruebas del README. NP **9999**. Anotar OK o falla.

| # | Prueba | Se espera | Resultado |
|---|---|---|---|
| 1 | Trazabilidad: buscar 9999 | Ficha con estado de la OT, pestañas e ítems sin mezclarse | |
| 2 | "Continuar con la NP" por los cuatro módulos | Llega con la misma NP e ítem, ya cargada | |
| 3 | Balance | Cifras con unidad; una diferencia no aparece como merma | |
| 4 | Registrar una merma con evidencia y abrirla | Queda en el historial | |
| 5 | Cierre: guardar y reabrir | Cifras y origen en palabras | |
| 6 | Certificados: crear, revisar chips, "Ver NP relacionada" | Sin aprobación no hay correlativo | |
| 7 | Documentos: cargar un archivo y un enlace | Se abren; quedan en el historial | |
| 8 | Informe V05, guardar y reabrir | Muestra "Versión guardada N°" | |
| 9 | Exportar PDF, Excel y ZIP | Los tres archivos abren y el ZIP trae índice y faltantes | |
| 10 | Entrar con `prueba.ver` | Sin botones de escritura | |
| 11 | Entrar con `prueba.sinacceso` | Sin los cuatro módulos | |

"Elegir inspección" requiere el módulo Formularios con datos; el entorno no los tiene: probarlo en el piloto.
Los adjuntos SAP no se prueban sin `--sap`.

**Regresión FARET** (el entorno aislado no configura sus APIs): en el equipo piloto, solo consulta y sin guardar:
Inicio, No Conformidades, NC Internas, Despachos, Laboratorio y Trazabilidad.

## Aceptación

La candidata queda aceptada cuando la lista anterior y el piloto con NP reales no tengan fallas bloqueantes y Mariela
responda `docs/CUESTIONARIO_MARIELA.md`. Alcance implementado según la matriz: 59 % ponderado; es medida de desarrollo
local, no de aceptación.
