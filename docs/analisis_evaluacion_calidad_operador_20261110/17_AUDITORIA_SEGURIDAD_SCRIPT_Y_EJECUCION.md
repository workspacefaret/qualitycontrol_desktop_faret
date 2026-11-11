# 17 — Auditoría de seguridad del script de auditoría y procedimiento de ejecución (10-11-2026)

Script: `auditoria_calidad_operadores.ps1` v1.1. Revisión **estática**: no se ejecutó nada contra producción. Validado con el analizador sintáctico de PowerShell 5.1 (0 errores) y búsqueda textual de palabras prohibidas y de funciones que expongan credenciales (sin coincidencias en consultas ni en manejo de clave).

## Veredicto: APTO PARA EJECUCIÓN (con una condición: TLS validado, ver §4)

## 1. Problemas encontrados y corregidos (v1.0 → v1.1)

| # | Hallazgo | Corrección |
|---|---|---|
| 1 | **TLS:** el modo `-Cifrar` usaba `TrustServerCertificate=True` y sin él no había cifrado | Siempre `Encrypt=True; TrustServerCertificate=False`; no hay opción para desactivarlo. Se verifica además `CONNECTIONPROPERTY('encrypt_option')='TRUE'` antes de leer datos |
| 2 | **Servidor por defecto = IP:** la validación de nombre del certificado fallaría o se tentaría a desactivarla | `-Servidor` es obligatorio y debe ser el nombre exacto del certificado |
| 3 | **Consulta 12 inválida:** `SUM()` sobre una expresión con subconsulta (error 130 de SQL Server) | Reescrita con tabla derivada |
| 4 | **Códigos de salida incorrectos:** con `$ErrorActionPreference='Stop'`, `Write-Error` terminaba el script antes de `exit n` y dejaba la conexión abierta | `Fail()` + `try/catch/finally`: código de salida real y cierre/`Dispose` de conexión y `SecureString` siempre |
| 5 | **Credencial:** solo pedía la clave por teclado | Nuevo `-ArchivoCredencial` (PSCredential de `Export-Clixml`); verifica tipo y que el usuario sea `qcc_audit_ro`; la clave sigue siendo `SecureString` |
| 6 | **Bloqueos:** una lectura podía esperar sin límite a una escritura de la aplicación | `SET LOCK_TIMEOUT 10000` y `SET DEADLOCK_PRIORITY LOW` (constantes del script, no pasan por la guarda); sin `NOLOCK` |
| 7 | **Carpeta de salida dentro del repositorio** | Por defecto `%USERPROFILE%\auditoria_calidad_operadores\resultados_<fecha>` (fuera de Git) y además `.gitignore` interno `*` |
| 8 | **Inyección de fórmulas en CSV** (texto que empieza con `=`, `+`, `-`, `@`) | Se neutraliza con `'` en campos de texto |
| 9 | Resultados no validados | Mínimos de filas en consultas 01, 02 y 04; error si faltan |
| 10 | Se podía probar conexión solo consultando datos | Nuevo `-SoloProbarConexion` (TLS + identidad, sin consultas de negocio) |

## 2. Consultas (19) — resultado de la revisión

- **Solo lectura:** todas comienzan con `SELECT` o `WITH`; sin `INSERT/UPDATE/DELETE/MERGE/DROP/ALTER/CREATE/TRUNCATE/EXEC/INTO`, sin `;`, sin procedimientos (`sp_`/`xp_`). La guarda del script lo comprueba en tiempo de ejecución para cada consulta (ignorando literales entre comillas) y rechaza la consulta si falla. Funciones usadas: `HASHBYTES`, `CONNECTIONPROPERTY`, `HAS_PERMS_BY_NAME`, `INFORMATION_SCHEMA`: sin efectos secundarios.
- **SQL Server 2016:** solo CTE, `ROLLUP/GROUPING`, `HASHBYTES('SHA2_256')`, `CONVERT(...,120/2)`, `DATEDIFF`, `DATALENGTH`; sin `FORMAT`, `STRING_AGG`, `TRIM`.
- **Carga:** cada consulta lee una sola vez la tabla de NC (más `maquinas`, 34 filas). Volumen esperado de cientos a pocos miles de filas, sin joins grandes ni resultados de detalle; tiempo máximo por consulta 60 s; 19 lecturas secuenciales. Sin riesgo de carga relevante. Bloqueos: nivel READ COMMITTED por defecto, con timeout de 10 s y prioridad de víctima baja.
- **Compatibilidad con el esquema:** columnas y tipos comprobados contra los DDL del repositorio (`fecha_fabricacion` DATE, `nivel` varchar, `severidad` ALTA/MEDIA/BAJA, `maquinas.nombre`). `ambito`, `empresa` y `eliminado` se añadieron después del DDL original: la consulta 01 los confirmará; si no existieran, las consultas fallan de forma controlada (no hay riesgo, solo error registrado).
- **Límite conocido:** la guarda es defensa adicional; la barrera real son los permisos de `qcc_audit_ro` (SELECT en 2 tablas). Además el script aborta si la cuenta tuviera algún permiso de escritura.

## 3. Credenciales y anonimización

- Solo `qcc_audit_ro` y solo `calidad_db` (otro valor termina con código 4).
- La clave va en `SecureString` → `SqlCredential` (la clave no entra en la cadena de conexión ni en argumentos de proceso; no hay `sqlcmd`, ni `ConvertFrom-SecureString`, ni `GetNetworkCredential`, ni escritura de la clave en archivos/logs). Los mensajes de error se acotan a la primera línea.
- Identidad verificada antes de leer: usuario, base, TLS activo, sin `sysadmin`/`db_owner`/`db_datareader`, `SELECT`=1 en ambas tablas, `INSERT/UPDATE/DELETE/CREATE TABLE/ALTER`=0.
- Operadores: `OP-xxxxxx` (6 hex de SHA-256 con sal aleatoria por corrida; no se guarda). Consistente dentro de una corrida (misma sal), distinto entre corridas. Es **seudonimización**, no anonimización: con pocos operadores y conocimiento de planta podría deducirse quién es quién; tratar los CSV como confidenciales. No se incluyen nombres, códigos de NC, descripciones ni clientes.
- Los CSV no contienen credenciales ni cadena de conexión; `resumen_ejecucion.json` guarda servidor, base, usuario, hash del script y estado de cada consulta.

## 4. TLS: cómo cumplir la validación (sin desactivarla)

El script exige certificado de confianza **y** nombre coincidente. Si falla:
1. Usar en `-Servidor` el nombre exacto del certificado (normalmente el FQDN; una IP solo sirve si el certificado la incluye).
2. Si el certificado es autofirmado o de una CA interna no confiable en ese equipo, pedir a TI/DBA que lo reemplace por uno de la CA corporativa o que instale la CA raíz en el almacén de confianza del equipo que ejecuta. Hasta entonces la ejecución queda detenida: no se acepta `TrustServerCertificate=True`.
3. Probar primero con `-SoloProbarConexion` (no consulta datos de negocio).

## 5. Credencial guardada en `C:\Users\administrador.AD\qcc_audit_ro.xml`

- Debe ser un `PSCredential` guardado con `Export-Clixml`, que cifra la clave con DPAPI: **solo la abre la cuenta `administrador.AD` en el equipo donde se creó**. El script lo valida y falla de forma segura si no se puede leer.
- No mostrar ni pegar el contenido del archivo. Para comprobar sin revelar nada: `(Import-Clixml 'C:\Users\administrador.AD\qcc_audit_ro.xml').UserName` debe imprimir `qcc_audit_ro`.
- Si el archivo contuviera la clave en texto plano (no es un PSCredential), el script se negará a usarlo; entonces omitir `-ArchivoCredencial` y escribir la clave cuando la pida.
- Restringir su ACL a esa cuenta y borrarlo al terminar la auditoría si ya no se necesita.

## 6. Ejecución (PowerShell, sesión de `administrador.AD` en SAP_NEW)

```powershell
cd "<carpeta del repo>\docs\analisis_evaluacion_calidad_operador_20261110"
Get-FileHash .\auditoria_calidad_operadores.ps1 -Algorithm SHA256        # comparar con el hash que informa Claude
# 1) prueba sin consultar datos de negocio
powershell.exe -NoProfile -File .\auditoria_calidad_operadores.ps1 -Servidor "<nombre-del-certificado>" -ArchivoCredencial "C:\Users\administrador.AD\qcc_audit_ro.xml" -SoloProbarConexion
# 2) auditoría completa
powershell.exe -NoProfile -File .\auditoria_calidad_operadores.ps1 -Servidor "<nombre-del-certificado>" -ArchivoCredencial "C:\Users\administrador.AD\qcc_audit_ro.xml"
```
Sin `-ExecutionPolicy Bypass`: si la política del equipo bloquea scripts locales, ejecutar el contenido revisado por la vía que autorice TI (no se omite la política desde aquí).

## 7. Resultado esperado y entrega

Carpeta `%USERPROFILE%\auditoria_calidad_operadores\resultados_<fecha>` con `00_identidad_permisos.csv`, 19 CSV (`01_…` a `19_…`) y `resumen_ejecucion.json`. Salida por consola: línea `OK filas=N` por consulta y código de salida 0. Entregar: **toda la carpeta** (los CSV agregados; sin credenciales). Revisar antes que `resumen_ejecucion.json` no tenga consultas en `ERROR`. Si alguna falla, entregar solo ese JSON.
