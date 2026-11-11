# 11 — Auditoría de datos reales (Fase 0) — 10-11-2026

**Veredicto actualizado (10-11-2026, auditoría ejecutada): APTO CON RESTRICCIONES, con datos INSUFICIENTES para comparar.** El módulo se puede construir como indicador descriptivo; los datos reales NO permiten sacar conclusiones sobre personas. El bloqueo por acceso (secciones 1–6, más abajo) quedó superado: se ejecutó `auditoria_calidad_operadores.ps1` v1.2 con `-Local` (Shared Memory, `qcc_audit_ro`, solo lectura), 19/19 consultas OK, código 0, el 10-11-2026 13:20 en SAP_NEW. Resultados (confidenciales, fuera de Git): `auditoria_resultados_local/`.

## 0. Resultados reales de la auditoría (VERIFICADO con los CSV)

Todo lo siguiente sale de los CSV 01–19. Operadores seudonimizados en la auditoría (`OP-xxxxxx`).

| Tema | Resultado real |
|---|---|
| Filas en `no_conformidades` | **201** (y `maquinas`: 34) |
| Ámbito / empresa / eliminado | INTERNA·FARET 147 activas (+6 eliminadas); INTERNA·INNPACK 36 activas; **PRODUCTO 7 activas (+5 eliminadas), con `empresa` NULL** |
| Universo del indicador (PRODUCTO, no eliminadas) | **7 NC** |
| `nivel` (valores reales) | Menor 4, Mayor 3. **Ninguna Crítica**. Sin espacios sobrantes (10 bytes) |
| `severidad` (valores reales) | BAJA 4, MEDIA 3. En estas 7 filas `nivel` y `severidad` coinciden uno a uno (Menor=BAJA, Mayor=MEDIA); no hay ALTA |
| Mes de fabricación | 2026-03: 3 · 2026-06: 2 · 2026-07: 1 · **sin fecha de fabricación: 1** |
| **Octubre 2026** | **0 NC fabricadas, 0 ingresadas**: no hay nada que evaluar para ese mes |
| Fechas | 6 con ambas fechas; retraso fabricación→ingreso: mín −10, prom ≈63,8, máx 128 días; **1 con fabricación posterior al ingreso**; 0 futuras |
| Sin operador | 1 de 7 (vacío) |
| Operadores identificables | 3 (3, 2 y 1 NC); 0 genéricos o múltiples; 1 variante de escritura por operador (no se detectaron variantes en esta muestra) |
| Máquinas | 3 distintas (DIANA VIII 4 NC, DISCOVER CILÍNDRICA 1 2 NC, DISCOVER CÓNICA/OVALADA 1 NC); **las 3 existen en el catálogo** (34, todas activas); un solo operador por máquina |
| Sin máquina / sin NP-NV | 0 / 0. NP/NV son solo dígitos en las 7 |
| Duplicados potenciales | 1 grupo de 2 filas (mismo NP/NV + operador + fecha fabricación): **no verificado** si es duplicado real |
| Evaluables (fecha + operador identificable + nivel válido) | **5 de 7** (excluidas: 1 sin fecha, 1 sin operador) |
| Puntos 10/5/1 | Evaluables: **13** (mar 3 · jun 5 · jul 5). Excluidas: 6 (sin fecha 5; sin operador 1). Total 19 |

### Lo que NO se puede afirmar
- **Atribución a la persona:** `operador` es texto libre; no existe vínculo con un usuario/empleado. Atribución **no verificada**.
- **Comparar operadores o meses:** 5 NC evaluables en ~8 meses y 0 en octubre; no hay base estadística. Tampoco hay datos de producción (volumen, turnos, órdenes) para normalizar.
- **NC internas (183 activas, 36 INNPACK):** quedan fuera (ámbito INTERNA). La auditoría filtró PRODUCTO, así que si capturan operador **no se midió**; el formulario de NC interna no lo pide (según el código). Pendiente de confirmar.
- **`empresa` NULL en PRODUCTO:** se asume INNPACK porque el módulo No Conformidades INNPACK crea ámbito PRODUCTO sin empresa (por código, no por dato).
- **Cruce con FPS:** NP/NV numérico lo haría posible en principio, pero con 7 filas no hay validación útil. No es dependencia del MVP.

### Lectura honesta
Solo hay 7 NC de producto activas en el sistema (otras 5 están eliminadas y no cuentan). O la herramienta se usa poco para NC de producto, o el registro por operador no es sistemático. **Esa es la pregunta de negocio principal para Calidad** antes de invertir más en el indicador.

---

**(Texto histórico, previo a la auditoría)**

Veredicto anterior: BLOQUEADO POR DATOS (por acceso, no por calidad de datos). No se pudo medir ninguna cobertura de `no_conformidades`. No se inventó ningún número.

> **Actualización:** el login `qcc_audit_ro` (SELECT solo en `no_conformidades` y `maquinas`) ya existe; la auditoría sigue bloqueada hasta que el admin de 192.168.1.76 active el perfil `calidad-sqlserver` (doc 16). El script de §5 está listo para ejecutarse con esa conexión. Alternativa inmediata: que una persona autorizada lo ejecute en SSMS con `qcc_audit_ro`.

> **Decisión 10-11-2026:** la auditoría no depende del MCP. Se ejecuta con `auditoria_calidad_operadores.ps1` (misma carpeta), que reemplaza a las consultas manuales de §5 y está corregido para el esquema real: `severidad` es ALTA/MEDIA/BAJA y el nivel Crítico/Mayor/Menor está en `nivel`; `fecha_fabricacion` es DATE; el catálogo `maquinas` usa `nombre`. Estado: v1.1 revisado de seguridad (doc 17: APTO, TLS validado obligatorio, credencial por `-ArchivoCredencial`); validado solo sintácticamente (parser de PowerShell 5.1, 0 errores); **no ejecutado**, sin resultados.

## 1. Qué se verificó (CONFIRMADO)

`.mcp.json` define 3 servidores (todos por `ssh`, detalles no impresos): `ia-codigo`, `ia-ejecutar`, `ia-sqlserver`.

`ia-sqlserver.consultar` está **fijo a `FARET_PRODUCCION`** (SAP B1; solo `SELECT`/`WITH`, tope 200 filas). Comprobaciones de metadatos ejecutadas (solo lectura):

| Consulta | Resultado |
|---|---|
| `DB_NAME()` y tablas `%no_conform%`/`%importacion_pnc%` en `sys.tables` | `FARET_PRODUCCION`, **0 tablas** |
| `sys.databases` | 19 bases SAP/Faret (B1AS, FARET_BACK_OFFICE, Faret_Control_Calidad, FARET_PRODUCCION, INNPACK_PRODUCCION, PHARPACK_PRODUCCION, TEST_*, …). **Ninguna es la base `calidad`** |
| `sys.servers` | Servidores enlazados solo a SAP-B1 y FPS (192.168.1.230) |
| `buscar_tabla("no conformidades calidad operador")` | Sin tablas de NC; solo consultas SAP no relacionadas |

La tabla productiva de NC (`no_conformidades`, SQL Server `calidad` tras el cutover del 07-09-2026) **no es alcanzable** por este MCP. `ia-ejecutar` ejecuta comandos remotos por SSH y no garantiza lectura segura de SQL, y obtener credenciales de la API para consultar `calidad` violaría la política de seguridad vigente; por eso no se usaron. No se imprimió ningún secreto.

## 2. Qué no se pudo hacer

Totales y coberturas, valores de `nivel`/`severidad`, operadores y máquinas distintos, auditoría de fechas, octubre 2026 (fabricación vs ingreso), simulación 10/5/1 y cruce con FPS. Por eso **no se generan los docs 12 y 13 con datos**: serían inventados.

## 3. Lo que sí está confirmado por código (columnas reales de `no_conformidades`, `NoConformidadesRepository.cs`)

`fecha_fabricacion`, `fecha_ingreso`, `fecha_deteccion`, `nivel`, `severidad`, `operador`, `maquina`, `np_nv`, `estado`, `estado_gestion`, `eliminado`, `ambito`, `empresa`, `tipo_pnc`, `cant_rechazada`. El rango de fechas actual filtra por `fecha_ingreso`. El número de producción es `np_nv` (puede traer NV, no solo NP: riesgo para cruzar con FPS).

## 4. Opciones para desbloquear (decide el responsable TI)

1. **Una persona autorizada ejecuta el script de abajo** en SSMS contra `calidad` y pega los resultados (recomendado; no requiere credenciales para mí).
2. **Ampliar el MCP**: que TI registre un servidor de solo lectura sobre `calidad` (usuario `SELECT` únicamente en `no_conformidades`). Con eso ejecuto la auditoría completa.

## 5. Script de auditoría (solo `SELECT`, agregado, sin datos personales)

```sql
-- Cobertura (INNPACK/PRODUCTO, no eliminadas)
SELECT COUNT(*) total,
 SUM(CASE WHEN fecha_fabricacion IS NULL THEN 1 ELSE 0 END) sin_fab,
 SUM(CASE WHEN NULLIF(LTRIM(RTRIM(nivel)),'') IS NULL THEN 1 ELSE 0 END) sin_nivel,
 SUM(CASE WHEN NULLIF(LTRIM(RTRIM(operador)),'') IS NULL THEN 1 ELSE 0 END) sin_operador,
 SUM(CASE WHEN NULLIF(LTRIM(RTRIM(maquina)),'') IS NULL THEN 1 ELSE 0 END) sin_maquina,
 SUM(CASE WHEN NULLIF(LTRIM(RTRIM(np_nv)),'') IS NULL THEN 1 ELSE 0 END) sin_np
FROM no_conformidades WHERE eliminado=0 AND ambito='PRODUCTO';

-- Valores de nivel y severidad (crudos, con longitud para detectar espacios)
SELECT nivel, LEN(nivel) largo, COUNT(*) n FROM no_conformidades
WHERE eliminado=0 AND ambito='PRODUCTO' GROUP BY nivel ORDER BY n DESC;
SELECT severidad, COUNT(*) n FROM no_conformidades
WHERE eliminado=0 AND ambito='PRODUCTO' GROUP BY severidad ORDER BY n DESC;

-- Octubre 2026: fabricación vs ingreso
SELECT
 SUM(CASE WHEN fecha_fabricacion>='20261001' AND fecha_fabricacion<'20261101' THEN 1 ELSE 0 END) oct_por_fabricacion,
 SUM(CASE WHEN fecha_ingreso>='20261001' AND fecha_ingreso<'20261101' THEN 1 ELSE 0 END) oct_por_ingreso,
 SUM(CASE WHEN fecha_fabricacion>='20261001' AND fecha_fabricacion<'20261101'
          AND NOT (fecha_ingreso>='20261001' AND fecha_ingreso<'20261101') THEN 1 ELSE 0 END) fab_oct_ingreso_otro_mes
FROM no_conformidades WHERE eliminado=0 AND ambito='PRODUCTO';

-- Retraso fabricación→ingreso y fechas inconsistentes
SELECT MIN(DATEDIFF(day,fecha_fabricacion,fecha_ingreso)) min_d,
 AVG(DATEDIFF(day,fecha_fabricacion,fecha_ingreso)*1.0) prom_d,
 MAX(DATEDIFF(day,fecha_fabricacion,fecha_ingreso)) max_d,
 SUM(CASE WHEN fecha_fabricacion>fecha_ingreso THEN 1 ELSE 0 END) fab_posterior_a_ingreso,
 SUM(CASE WHEN fecha_fabricacion>GETDATE() THEN 1 ELSE 0 END) fab_futura
FROM no_conformidades WHERE eliminado=0 AND ambito='PRODUCTO' AND fecha_fabricacion IS NOT NULL;

-- Registros por mes de fabricación (últimos 18 meses)
SELECT FORMAT(fecha_fabricacion,'yyyy-MM') mes, COUNT(*) n FROM no_conformidades
WHERE eliminado=0 AND ambito='PRODUCTO' AND fecha_fabricacion>=DATEADD(month,-18,GETDATE())
GROUP BY FORMAT(fecha_fabricacion,'yyyy-MM') ORDER BY mes;

-- Operadores y máquinas: distintos crudos vs normalizados (solo conteos)
SELECT COUNT(DISTINCT operador) crudos, COUNT(DISTINCT UPPER(LTRIM(RTRIM(operador)))) normalizados,
       COUNT(DISTINCT maquina) maq_crudas, COUNT(DISTINCT UPPER(LTRIM(RTRIM(maquina)))) maq_norm
FROM no_conformidades WHERE eliminado=0 AND ambito='PRODUCTO';

-- Operadores múltiples/genéricos (conteo; sin nombres)
SELECT COUNT(*) con_separador FROM no_conformidades
WHERE eliminado=0 AND ambito='PRODUCTO' AND (operador LIKE '%/%' OR operador LIKE '%,%' OR operador LIKE '% y %');

-- Duplicados potenciales
SELECT COUNT(*) grupos, SUM(n) filas FROM (
 SELECT np_nv, UPPER(LTRIM(RTRIM(operador))) op, fecha_fabricacion, COUNT(*) n FROM no_conformidades
 WHERE eliminado=0 AND ambito='PRODUCTO' GROUP BY np_nv, UPPER(LTRIM(RTRIM(operador))), fecha_fabricacion HAVING COUNT(*)>1) d;

-- Simulación 10/5/1 octubre vs septiembre por mes (agregado)
SELECT FORMAT(fecha_fabricacion,'yyyy-MM') mes,
 SUM(CASE WHEN UPPER(LTRIM(RTRIM(nivel))) LIKE 'CR%' THEN 1 ELSE 0 END) criticos,
 SUM(CASE WHEN UPPER(LTRIM(RTRIM(nivel))) LIKE 'MAY%' THEN 1 ELSE 0 END) mayores,
 SUM(CASE WHEN UPPER(LTRIM(RTRIM(nivel))) LIKE 'MEN%' THEN 1 ELSE 0 END) menores
FROM no_conformidades WHERE eliminado=0 AND ambito='PRODUCTO'
 AND fecha_fabricacion>='20260901' AND fecha_fabricacion<'20261101'
GROUP BY FORMAT(fecha_fabricacion,'yyyy-MM');
```

Nota: la normalización `LIKE 'CR%'/'MAY%'/'MEN%'` es provisional hasta ver los valores reales de la consulta de `nivel`.

## 6. Conclusión

Estado: **BLOQUEADO POR DATOS (acceso a `calidad` no disponible)**. El diseño del MVP (doc 10) sigue siendo válido, pero su alcance y el valor de T2 dependen de estas mediciones. **Próximo paso:** elegir la opción 1 o 2 de la sección 4; con los resultados genero los docs 11 (completo), 12 y 13 y el veredicto final.
