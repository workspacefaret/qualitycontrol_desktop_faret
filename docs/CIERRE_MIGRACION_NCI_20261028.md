# Cierre técnico — Consolidación de tipos de desviación de NC Internas

**Fecha de ejecución:** 28-10-2026
**Alcance:** FARET e INNPACK (módulos *NC Internas* / *nc-internas* y *faret-nc-internas*, misma tabla)
**Estado:** CERRADO para las **cinco equivalencias aprobadas**. Tres categorías antiguas siguen **pendientes de definición** (ver sección 9).

> **Nota sobre la fuente de los resultados.** Las cifras de ejecución (PASS, 46 + 23 = 69 registros, COMMIT en ambas empresas, rollback 03 probado en DryRun) fueron **informadas por el responsable de TI** a partir de la evidencia de la ejecución. El asistente que preparó los scripts y este documento **no tuvo acceso autorizado a `calidad_db`** (la sesión de trabajo corre como `AD\dcarrasco`, sin login al servidor) **ni a la carpeta de evidencia** (perfil `administrador`, permiso denegado). Por lo tanto no verificó de forma independiente el estado final. Para dejar esa verificación documentada, ejecutar `scripts/verificar_estado_nci.ps1` (solo lectura) y adjuntar su `resumen.txt`; ver sección 6.

---

## 1. Solicitud original y problema detectado

Pedro Roa (Calidad) envió el 28-10-2026, tras un mes de uso del sistema, una captura anotada a mano del reporte *"Pareto por tipo de desviación"* de NC Internas (58 NC en el período). Pidió "sacar las filas con color naranja y traspasar esos datos según indica la flecha azul".

El reporte mostraba **el mismo tipo de desviación repartido en dos filas**: una con el nombre antiguo y otra con el nombre nuevo, por ejemplo `Información incompleta en carpeta` e `Información incompleta en la carpeta`. Esto dividía las frecuencias y distorsionaba el % acumulado del Pareto.

Marcas de Pedro en la captura (filas naranjas → destino amarillo):

| Fila antigua (naranja) | Destino marcado |
|---|---|
| Código SAP / arte incorrecto | Código SAP/Perfil |
| Información incompleta en carpeta | Información incompleta en la carpeta |
| Color / GMG / Muestras | Color (con "?") |
| Perfil no indicado en NV / carpeta | Código SAP/Perfil (con "?") |

La captura original está en `docs/WhatsApp Image 2026-10-28 at 10.01.48 AM.jpeg` (archivo local, **no versionado** en Git por tratarse de un adjunto de mensajería).

## 2. Causa raíz

El 07-10-2026 se redefinió el catálogo `cat_nci_tipos_desviacion` (12 tipos definitivos; los 11 anteriores se **desactivaron**, no se migraron). Las NC históricas ya guardadas conservaron en `dbo.no_conformidades.categoria_defecto` el texto antiguo.

El Pareto se calcula en el frontend (`nc-internas.controller.js` y su réplica `faret-nc-internas`) agrupando por el **texto exacto** de `categoria_defecto`; por eso "Color / GMG / Muestras" y "Color" aparecían como categorías distintas. No era un error del gráfico ni de la API: era un **problema de datos** (catálogo cambiado sin migrar el histórico).

## 3. Equivalencias aplicadas (cinco)

| # | Categoría antigua | Categoría nueva | FARET | INNPACK | Total |
|---|---|---|---:|---:|---:|
| 1 | Código SAP / arte incorrecto | Código SAP/Perfil | 12 | 10 | 22 |
| 2 | Información incompleta en carpeta | Información incompleta en la carpeta | 5 | 1 | 6 |
| 3 | Barniz / Folia / Serigrafía | Barniz/Folia/Serigrafía | 11 | 6 | 17 |
| 4 | Cambio de máquina / Planificación | Cambio de máquina/planificación | 3 | 1 | 4 |
| 5 | Troquel / MFG no coincide | Troquel/MFG | 15 | 5 | 20 |
| | **Total** | | **46** | **23** | **69** |

- Las equivalencias 1 y 2 fueron marcadas explícitamente por Pedro. Las equivalencias 3, 4 y 5 son el mismo tipo con distinto formato/nombre y fueron **autorizadas por el responsable de TI** el 28-10-2026.
- Los conteos incluyen registros eliminados lógicamente que estuvieran en esas categorías (FARET tiene 2 eliminadas en total); sus estados de eliminación no se modificaron.
- INNPACK incluye las filas con `empresa` NULL (criterio histórico de la API).

## 4. Procedimiento

1. **Auditoría de solo lectura** (`sql/01_auditoria_solo_lectura.sql`): esquema, triggers (no existen), catálogo, uso real por empresa/categoría. Resultado: 165 NC internas (FARET 129, con 2 eliminadas; INNPACK 36), 11 categorías activas y 8 desactivadas en el catálogo.
2. **Simulación con `SELECT` + CTE** (`sql/04_simulacion_pareto_solo_lectura.sql`): Pareto actual vs. simulado por empresa, escenarios SIM_A (solo marcadas por Pedro: 17 FARET + 11 INNPACK) y SIM_B (más las de formato: 46 FARET + 23 INNPACK).
3. **Migración** (`sql/02_migracion_tipos_desviacion.sql`), una empresa por ejecución, una sola transacción:
   - Crea `dbo.nc_tipo_desviacion_migracion` **dentro** de la transacción (DDL transaccional: un `DryRun` no deja rastro).
   - Selecciona el alcance con `UPDLOCK, HOLDLOCK` (`ambito = 'INTERNA'`, empresa, nombre antiguo autorizado).
   - Exige que el conteo por equivalencia coincida con lo auditado; si no, aborta.
   - Respalda por `id` y hace **un único `UPDATE` de `categoria_defecto`**.
   - Controles posteriores dentro de la transacción (total y eliminadas intactos, destino correcto, sin nombres antiguos autorizados remanentes).
   - Es idempotente (responde "YA APLICADO" si no hay nada que migrar y existe respaldo del lote).
4. **Validación previa (DryRun)** con `scripts/validar_migracion_nci.ps1`: PASS el 28-10-2026 (ROLLBACK confirmado en ambas empresas, fotografías antes/después idénticas, ningún COMMIT).
5. **Aplicación** con `scripts/aplicar_migracion_nci.ps1`: compuerta de DryRun de ambas empresas → autorización escrita (frase exacta + nombre) → FARET (46) → verificación independiente → prueba de reversión en DryRun → INNPACK (23) → verificación final.

### Incidente durante la preparación (resuelto, sin efecto en datos)

El primer intento de aplicación se detuvo antes de enviar SQL por un error del propio PowerShell: la variable `$base` (línea base de filas) **pisaba** la constante `$Base` (`calidad_db`), porque PowerShell no distingue mayúsculas en nombres de variable, y `Assert-ArgsBase` rechazó los argumentos de `sqlcmd` ("base distinta de la esperada"). Evidencia de ese intento: `nci_migracion_20261028_172005`. Se corrigió únicamente el PowerShell (`$lineaBase`); los SQL no cambiaron. La precondición del script de aplicación (sin respaldo previo del lote) garantiza que el intento siguiente partía de una base sin cambios.

## 5. Validaciones y resultado

Resultado reportado: **PASS**.

- Identidad `AD\Administrador` y base `calidad_db` verificadas antes de operar; SHA-256 de los SQL 02 y 03 verificado contra la versión revisada.
- Compuerta: DryRun de FARET (46) e INNPACK (23) con ROLLBACK confirmado y base idéntica (huella por fila).
- Línea base por fila inmediatamente antes de aplicar.
- Tras cada COMMIT, en otra conexión: respaldo persistido (46 y 23 filas), todas con la categoría destino y ninguna con el nombre antiguo; total de NC y de eliminadas intactos.
- Comparación fila por fila (huella de **todas las columnas salvo `categoria_defecto`**): solo cambió `categoria_defecto`, en exactamente los `id` respaldados (69 en total); ninguna otra columna ni fila cambió.
- Prueba de reversión: el SQL 03 en `DryRun=1` (con ROLLBACK) habría restaurado 46 y 23 filas, con 0 editadas posteriormente. **No se ejecutó una reversión real.**

## 6. Estado final esperado (para verificación independiente)

Con la migración aplicada, `scripts/verificar_estado_nci.ps1` (solo `SELECT`) debe informar para cada empresa `APLICADA (igual a despues de migrar)`:

| Empresa | Código SAP/Perfil | Info. incompleta en la carpeta | Barniz/Folia/Serigrafía | Cambio de máquina/planificación | Troquel/MFG | Antiguas (5) |
|---|---:|---:|---:|---:|---:|---:|
| FARET (129 NC, 2 eliminadas) | 30 | 6 | 14 | 5 | 17 | 0 |
| INNPACK (36 NC, 0 eliminadas) | 10 | 1 | 6 | 1 | 5 | 0 |

(Incluye eliminadas.) Registrar su `resumen.txt` junto a la evidencia de la ejecución.

## 7. Respaldo y reversión

**Respaldo persistente:** `dbo.nc_tipo_desviacion_migracion` en `calidad_db` (servidor SAP_NEW, 192.168.1.230). **No eliminar.**
Columnas: `nc_id`, `empresa`, `categoria_anterior`, `categoria_nueva`, `eliminado`, `lote`, `autorizado_por`, `fecha`.
Lote: `Consolidacion tipos NC Internas 2026-10-28`. Contiene 46 filas FARET y 23 INNPACK.

Copia adicional fuera de la base: la evidencia de ejecución incluye la fotografía inicial por fila (`rowhash_R0_inicial.out.txt`, con la categoría original de **todas** las filas) y el volcado del respaldo por empresa (`respaldo_copia_*.out.txt`).

**Reversión (solo con autorización del responsable de TI)** con `sql/03_rollback_migracion_tipos_desviacion.sql`, una empresa por vez, siempre primero en simulacro, desde la sesión `AD\Administrador`:

```powershell
# 1) Simulacro (ROLLBACK): debe informar revertidas = respaldadas (46 FARET / 23 INNPACK) y 0 editadas
sqlcmd -S 192.168.1.230 -d calidad_db -E -b -W -s "|" -v Empresa=FARET DryRun=1 -i .\sql\03_rollback_migracion_tipos_desviacion.sql
# 2) Aplicar la reversión (solo tras revisar el simulacro y con autorización)
sqlcmd -S 192.168.1.230 -d calidad_db -E -b -W -s "|" -v Empresa=FARET DryRun=0 -i .\sql\03_rollback_migracion_tipos_desviacion.sql
# Repetir con Empresa=INNPACK
```

- Solo restaura filas cuyo valor **sigue siendo el migrado** (no pisa ediciones posteriores) y reporta cuántas se editaron después.
- Conserva el respaldo. Si luego se quisiera reaplicar el SQL 02 con el mismo lote, el respaldo se duplicaría: usar un lote nuevo.
- No usar el parámetro `-f` (el `sqlcmd` instalado es la versión Go y no lo soporta). Los comentarios de cabecera de los SQL 02 y 03 mencionan `-f 65001`; son solo comentarios y **no se editaron** para no alterar los hashes ejecutados.

## 8. Evidencia de ejecución

| Qué | Ubicación (equipo del responsable de TI, sesión `AD\Administrador`) |
|---|---|
| Ejecución definitiva (PASS) | `C:\Users\administrador\Desktop\nci_migracion_20261028_172423` |
| Primer intento detenido por error de PowerShell (sin SQL enviado) | `C:\Users\administrador\Desktop\nci_migracion_20261028_172005` |
| Contenido de cada carpeta | `resumen.txt`, salidas y errores de cada `sqlcmd`, consultas generadas, fotografías por fila, `transcripcion.txt`, `manifiesto_sha256.txt` (SHA-256 de cada archivo y de los scripts usados) |

La evidencia **no se versiona en Git** (contiene datos de NC); permanece en esas carpetas.

## 9. Categorías excluidas — PENDIENTES de definición

No se modificaron y **siguen apareciendo con su nombre antiguo en el Pareto**. No están resueltas.

| Categoría antigua | Destino posible | Registros al auditar (FARET / INNPACK) | Motivo de exclusión |
|---|---|---|---|
| Color / GMG / Muestras | Color, o dividir entre Color y GMG/ Carta Color/ IGT | 18 / 3 | Pedro la marcó hacia *Color* con "?"; puede corresponder dividirla con el tipo nuevo *GMG/ Carta Color/ IGT* |
| Perfil no indicado en NV / carpeta | ¿Código SAP/Perfil? | 4 / 3 | Pedro puso "?"; destino no confirmado |
| Otro | Ninguno | 1 / 0 | El destino natural, *Otros*, está **desactivado** en el catálogo |

Quedan además sin tocar: los **títulos** de NC históricas (`"{categoría} - NP x"`) conservan el nombre antiguo, y los tipos del catálogo que no figuran entre las equivalencias.

## 10. Archivos de esta migración en el repositorio

| Archivo | Función | SHA-256 (sin CR) |
|---|---|---|
| `sql/01_auditoria_solo_lectura.sql` | Auditoría (solo `SELECT`) | `C983B2686E6CAAC93C3B4A5230D9AE08F3D4013D6862E60341202B693168B18F` |
| `sql/04_simulacion_pareto_solo_lectura.sql` | Simulación (`SELECT` + CTE) | `8ADEAFA6F66165ABD795242134065783967A92E782EBA7B62451CFD35C9D33EC` |
| `sql/02_migracion_tipos_desviacion.sql` | **Migración ejecutada** (sin modificar) | `0F57AEDD6F6E0A574B2C34D65B52BB3EC907C3835CA7BBE11441B22C00B51FB3` |
| `sql/03_rollback_migracion_tipos_desviacion.sql` | **Reversión** (sin modificar) | `1F5A7D53356EB737E1FAF78F749C52E6330A5BEA67976CFB05C6F0CCD74E4A10` |
| `scripts/validar_migracion_nci.ps1` | DryRun de validación | `85E50A1F681B7F1FCDB78B3886CA1BEC7849EFBD4B91510143CF5B10A8D04B85` |
| `scripts/aplicar_migracion_nci.ps1` | Aplicación (COMMIT con autorización escrita) | `ECC6C380600C92BC62F109CCE8E76559FE583CADA9B2A7CD5284072EBFCF7C02` |
| `scripts/verificar_estado_nci.ps1` | Verificación de estado (solo `SELECT`) | `173554CDC20BBE1EEFDF5DAD5FE2A0AC8935F38496E2443C097E8B4F627E69C6` |

El hash se calcula **ignorando los retornos de carro (CR)**: el repositorio usa `core.autocrlf`, y los scripts de PowerShell comparan con ese mismo cálculo.

No hay credenciales en estos archivos: la conexión usa autenticación integrada de Windows (`sqlcmd -E`). Solo contienen identificadores de infraestructura (IP del servidor SQL y nombre de la cuenta esperada).

## 11. Alcance del cierre

- **Cerrado:** consolidación de las cinco equivalencias (69 registros) para FARET e INNPACK, con respaldo persistente y reversión disponible.
- **No incluido / pendiente:** las tres categorías de la sección 9; la verificación independiente por `verificar_estado_nci.ps1` (a registrar); cualquier cambio de la aplicación (no se modificó código ni se desplegó nada).
