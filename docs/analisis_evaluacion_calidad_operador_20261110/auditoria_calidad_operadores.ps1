<#
.SYNOPSIS
  Auditoria de datos de No Conformidades por operador (SOLO LECTURA) - calidad_db en SAP_NEW. v1.1

.DESCRIPTION
  - Conexion como qcc_audit_ro (SELECT solo sobre dbo.no_conformidades y dbo.maquinas).
  - Clave: PSCredential guardada con Export-Clixml (DPAPI; solo la abre la misma cuenta de Windows en
    el mismo equipo que la creo) o, si no se indica archivo, Read-Host -AsSecureString. Siempre como
    SecureString dentro de System.Data.SqlClient.SqlCredential: nunca se convierte a texto, ni va en la
    cadena de conexion, ni en argumentos de proceso, ni en archivos, ni en pantalla.
  - TLS obligatorio y validado (Encrypt=True, TrustServerCertificate=False). No existe opcion para
    desactivar la validacion. Si el certificado no es de confianza o el nombre no coincide, el script
    se detiene (ver doc 17 para resolverlo).
  - Antes de consultar verifica la identidad (usuario, base, TLS activo, sin sysadmin/db_owner/
    db_datareader, sin permisos de escritura ni DDL). Si algo no calza, aborta sin leer datos de negocio.
  - Cada consulta pasa por una guarda: debe empezar con SELECT/WITH y no contener palabras de escritura,
    INTO, EXEC ni ';' (los literales entre comillas se ignoran). Sin tablas temporales, DDL ni DML.
  - La sesion usa LOCK_TIMEOUT 10 s y DEADLOCK_PRIORITY LOW (las lecturas ceden ante la aplicacion);
    no se usa NOLOCK.
  - Operadores seudonimizados por defecto (OP-xxxxxx = hash con sal aleatoria de la corrida, no guardada).
    -ConNombres los muestra en claro (solo con autorizacion de Calidad).
  - Salida: CSV UTF-8 + resumen_ejecucion.json en una carpeta nueva fuera del repositorio, con
    .gitignore interno. Sin secretos.

.PARAMETER Servidor            Modo red: nombre EXACTO del certificado TLS (FQDN). "host,puerto" permitido. Excluyente con -Local.
.PARAMETER Local               Modo local v1.2: ejecutar EN el servidor SQL; fuerza Shared Memory (lpc:) y aborta si el transporte
                               real no es 'Shared memory'. No usa TCP ni Named Pipes. No relaja la validacion de certificados.
.PARAMETER Instancia           Solo con -Local: nombre de instancia con nombre (omitir para la instancia predeterminada).
.PARAMETER ArchivoCredencial   Ruta de un XML de Export-Clixml con un PSCredential de qcc_audit_ro. Si se omite, pide la clave.
.PARAMETER DirSalida           Por defecto %USERPROFILE%\auditoria_calidad_operadores\resultados_<fecha>.
.PARAMETER ConNombres          Operadores en claro.
.PARAMETER SoloProbarConexion  Solo conecta, verifica TLS e identidad y termina (no consulta datos de negocio).

Codigos de salida: 0 ok; 1 alguna consulta fallo; 2 conexion/credencial/TLS; 3 identidad o permisos no validos; 4 parametros.
#>
[CmdletBinding()]
param(
    [string]$Servidor = '',
    [switch]$Local,
    [string]$Instancia = '',
    [string]$Base = 'calidad_db',
    [string]$Usuario = 'qcc_audit_ro',
    [string]$ArchivoCredencial = '',
    [string]$DirSalida = '',
    [switch]$ConNombres,
    [switch]$SoloProbarConexion
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
$ScriptVersion = '1.2-20261110'
$script:Codigo = 0
$cn = $null
$clave = $null

function Fail([string]$mensaje, [int]$codigo) {
    $script:Codigo = $codigo
    [Console]::Error.WriteLine('ERROR: ' + $mensaje)
    throw 'ABORT'
}

# ---------------------------------------------------------------- utilidades
function Test-SqlSoloLectura([string]$sql) {
    if ($sql -notmatch '^\s*(SELECT|WITH)\b') { return $false }
    # Los literales entre comillas simples (p. ej. 'CREATE TABLE' en HAS_PERMS_BY_NAME) no se ejecutan: se vacian antes de revisar.
    $sql = [regex]::Replace($sql, "'(?:[^']|'')*'", "''")
    if ($sql -match ';') { return $false }
    if ($sql -match '(?i)\b(INSERT|UPDATE|DELETE|MERGE|DROP|ALTER|CREATE|TRUNCATE|EXEC|EXECUTE|GRANT|REVOKE|DENY|INTO|OPENROWSET|OPENQUERY|OPENDATASOURCE|BULK|BACKUP|RESTORE|SHUTDOWN|WAITFOR|xp_\w+|sp_\w+)\b') { return $false }
    return $true
}

function ConvertTo-CsvCampo($v) {
    if ($v -is [System.DBNull] -or $null -eq $v) { return '' }
    $esTexto = $false
    if ($v -is [datetime]) { $t = $v.ToString('yyyy-MM-dd HH:mm:ss') }
    elseif ($v -is [System.IFormattable]) { $t = $v.ToString($null, [System.Globalization.CultureInfo]::InvariantCulture) }
    else { $t = [string]$v; $esTexto = $true }
    # Texto que Excel interpretaria como formula: se neutraliza.
    if ($esTexto -and $t -match '^[=+\-@]') { $t = "'" + $t }
    if ($t -match '[",\r\n]') { return '"' + $t.Replace('"', '""') + '"' }
    return $t
}

function Write-Csv([System.Data.DataTable]$dt, [string]$ruta) {
    $sb = New-Object System.Text.StringBuilder
    $nombres = @($dt.Columns | ForEach-Object { $_.ColumnName })
    [void]$sb.AppendLine((($nombres | ForEach-Object { ConvertTo-CsvCampo $_ }) -join ','))
    foreach ($row in $dt.Rows) {
        $campos = foreach ($c in $nombres) { ConvertTo-CsvCampo $row[$c] }
        [void]$sb.AppendLine(($campos -join ','))
    }
    [System.IO.File]::WriteAllText($ruta, $sb.ToString(), (New-Object System.Text.UTF8Encoding($true)))
}

function Invoke-Consulta([string]$sql, [hashtable]$parametros) {
    if (-not (Test-SqlSoloLectura $sql)) { throw 'Consulta rechazada por la guarda de solo lectura.' }
    $cmd = $cn.CreateCommand()
    $cmd.CommandText = $sql
    $cmd.CommandTimeout = 60
    foreach ($k in $parametros.Keys) { [void]$cmd.Parameters.AddWithValue($k, $parametros[$k]) }
    $dt = New-Object System.Data.DataTable
    $da = New-Object System.Data.SqlClient.SqlDataAdapter($cmd)
    [void]$da.Fill($dt)
    return , $dt
}

try {
    # ------------------------------------------------------------ parametros
    if ($Usuario -ne 'qcc_audit_ro') { Fail 'Solo se permite la cuenta qcc_audit_ro.' 4 }
    if ($Base -ne 'calidad_db') { Fail 'Solo se permite la base calidad_db.' 4 }
    if ($Local -and $Servidor -ne '') { Fail 'Use -Local o -Servidor, no ambos.' 4 }
    if (-not $Local -and $Servidor -eq '') { Fail 'Indique -Servidor (red, TLS validado) o -Local (Shared Memory en el propio servidor).' 4 }
    if ($Servidor -match '[;=]') { Fail 'Servidor invalido.' 4 }
    if ($Instancia -ne '' -and -not $Local) { Fail '-Instancia solo se usa con -Local.' 4 }
    if ($Instancia -ne '' -and $Instancia -notmatch '^[A-Za-z0-9_$#]{1,64}$') { Fail 'Instancia invalida.' 4 }
    if ([string]::IsNullOrWhiteSpace($DirSalida)) {
        $DirSalida = Join-Path $env:USERPROFILE ('auditoria_calidad_operadores\resultados_' + (Get-Date -Format 'yyyyMMdd_HHmmss'))
    }
    if (Test-Path -LiteralPath $DirSalida) { Fail "La carpeta de salida ya existe: $DirSalida" 4 }

    Add-Type -AssemblyName System.Data

    # -------------------------------------------------------------- credencial
    if ($ArchivoCredencial -ne '') {
        if (-not (Test-Path -LiteralPath $ArchivoCredencial -PathType Leaf)) { Fail 'No existe el archivo de credencial indicado.' 2 }
        try { $pc = Import-Clixml -LiteralPath $ArchivoCredencial }
        catch { Fail 'No se pudo leer el archivo de credencial (DPAPI: solo lo abre la misma cuenta de Windows, en el mismo equipo, que lo creo).' 2 }
        if ($pc -isnot [System.Management.Automation.PSCredential]) { Fail 'El archivo no contiene un PSCredential (Export-Clixml).' 2 }
        if ($pc.UserName -ne $Usuario) { Fail 'El archivo de credencial no corresponde a qcc_audit_ro.' 2 }
        $clave = $pc.Password.Copy()
    }
    else {
        $clave = Read-Host -AsSecureString -Prompt "Clave de $Usuario (no se muestra)"
    }
    if ($clave.Length -eq 0) { Fail 'Clave vacia.' 2 }
    $clave.MakeReadOnly()
    $cred = New-Object System.Data.SqlClient.SqlCredential($Usuario, $clave)

    # ------------------------------------------------------ conexion (TLS validado)
    if ($Local) {
        # Modo local: prefijo lpc: = SOLO Shared Memory (sin respaldo a TCP ni Named Pipes). Nunca sale de la maquina,
        # por eso no hay canal de red que cifrar; el paquete de login igual viaja cifrado por SQL Server.
        # TrustServerCertificate queda en False: si el servidor tuviera "Force Encryption", la validacion del
        # certificado fallaria y el script se detiene (no se relaja).
        $Servidor = 'lpc:' + $env:COMPUTERNAME
        if ($Instancia -ne '') { $Servidor += '\' + $Instancia }
        $cs = "Server=$Servidor;Database=$Base;Application Name=auditoria_calidad_operadores_ro;Connect Timeout=15;Encrypt=False;TrustServerCertificate=False"
        $transporteEsperado = 'Shared memory'
    }
    else {
        $cs = "Server=$Servidor;Database=$Base;Application Name=auditoria_calidad_operadores_ro;Connect Timeout=15;Encrypt=True;TrustServerCertificate=False"
        $transporteEsperado = ''
    }
    $cn = New-Object System.Data.SqlClient.SqlConnection($cs, $cred)
    try { $cn.Open() }
    catch {
        if ($Local) {
            Fail ('No se pudo conectar por Shared Memory: ' + $_.Exception.Message.Split("`n")[0] + ' | Ejecute el script EN el servidor SQL, con el protocolo Shared Memory habilitado (SQL Server Configuration Manager, solo lectura de configuracion). Si el error habla de certificado, el servidor fuerza cifrado: no se relaja la validacion.') 2
        }
        Fail ('No se pudo conectar con TLS validado: ' + $_.Exception.Message.Split("`n")[0] + ' | Si el mensaje habla de certificado/cadena de confianza/nombre: usar el nombre exacto del certificado en -Servidor o pedir al DBA/TI un certificado de confianza. No se desactiva la validacion.') 2
    }

    # Parametros de sesion fijos (no pasan por la guarda; son constantes del script).
    foreach ($set in @('SET LOCK_TIMEOUT 10000', 'SET DEADLOCK_PRIORITY LOW')) {
        $c0 = $cn.CreateCommand(); $c0.CommandText = $set; [void]$c0.ExecuteNonQuery()
    }

    # ------------------------------------------------- verificacion de identidad
    $sqlId = @'
SELECT SUSER_NAME() AS usuario, DB_NAME() AS base,
 CONVERT(varchar(10), CONNECTIONPROPERTY('encrypt_option')) AS conexion_cifrada,
 CONVERT(varchar(40), CONNECTIONPROPERTY('net_transport')) AS transporte,
 CONVERT(varchar(128), SERVERPROPERTY('MachineName')) AS maquina_servidor,
 IS_SRVROLEMEMBER('sysadmin') AS es_sysadmin,
 IS_MEMBER('db_owner') AS es_db_owner,
 IS_MEMBER('db_datareader') AS es_db_datareader,
 HAS_PERMS_BY_NAME('dbo.no_conformidades','OBJECT','SELECT') AS sel_nc,
 HAS_PERMS_BY_NAME('dbo.maquinas','OBJECT','SELECT') AS sel_maq,
 HAS_PERMS_BY_NAME('dbo.no_conformidades','OBJECT','INSERT') AS ins_nc,
 HAS_PERMS_BY_NAME('dbo.no_conformidades','OBJECT','UPDATE') AS upd_nc,
 HAS_PERMS_BY_NAME('dbo.no_conformidades','OBJECT','DELETE') AS del_nc,
 HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','CREATE TABLE') AS create_table,
 HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','ALTER') AS alter_db
'@
    try {
        $id = Invoke-Consulta $sqlId @{}
        $f = $id.Rows[0]
        if ($Local) {
            # Solo Shared Memory y en esta misma maquina; cualquier otro transporte aborta.
            $transOk = ($f['transporte'] -eq 'Shared memory') -and ([string]$f['maquina_servidor'] -ieq $env:COMPUTERNAME)
        }
        else { $transOk = ($f['conexion_cifrada'] -eq 'TRUE') }
        $ok = ($f['usuario'] -eq $Usuario) -and ($f['base'] -eq $Base) -and $transOk -and
              ($f['es_sysadmin'] -eq 0) -and ($f['es_db_owner'] -eq 0) -and ($f['es_db_datareader'] -eq 0) -and
              ($f['sel_nc'] -eq 1) -and ($f['sel_maq'] -eq 1) -and
              ($f['ins_nc'] -eq 0) -and ($f['upd_nc'] -eq 0) -and ($f['del_nc'] -eq 0) -and
              ($f['create_table'] -eq 0) -and ($f['alter_db'] -eq 0)
    }
    catch { Fail ('Fallo la verificacion de identidad: ' + $_.Exception.Message.Split("`n")[0]) 3 }
    if (-not $ok) { Fail 'Identidad, cifrado o permisos no cumplen el minimo privilegio esperado. Abortado sin consultar datos de negocio.' 3 }

    New-Item -ItemType Directory -Path $DirSalida -Force | Out-Null
    Set-Content -LiteralPath (Join-Path $DirSalida '.gitignore') -Value '*' -Encoding ASCII
    Write-Csv $id (Join-Path $DirSalida '00_identidad_permisos.csv')
    if ($Local) { Write-Host 'Transporte Shared Memory local confirmado (sin red). Identidad verificada: solo lectura, sin roles administrativos.' }
    else { Write-Host 'Conexion cifrada y validada. Identidad verificada: solo lectura, sin roles administrativos.' }
    if ($SoloProbarConexion) {
        Write-Host "Prueba de conexion OK. Resultado en: $DirSalida"
        throw 'FIN'
    }

    # ------------------------------------------------------------------ consultas
    if ($ConNombres) { $opVis = "ISNULL(op,'(sin operador)')" }
    else { $opVis = "CASE WHEN op IS NULL THEN '(sin operador)' ELSE 'OP-' + LEFT(CONVERT(varchar(64), HASHBYTES('SHA2_256', @sal + op), 2), 6) END" }

    $B = @"
WITH b0 AS (
 SELECT n.id, n.empresa, n.fecha_fabricacion AS ff, n.fecha_ingreso AS fi, n.np_nv,
  CASE WHEN LEFT(UPPER(LTRIM(RTRIM(n.nivel))),2)='CR' THEN 'CRITICO'
       WHEN LEFT(UPPER(LTRIM(RTRIM(n.nivel))),3)='MAY' THEN 'MAYOR'
       WHEN LEFT(UPPER(LTRIM(RTRIM(n.nivel))),3)='MEN' THEN 'MENOR'
       WHEN NULLIF(LTRIM(RTRIM(n.nivel)),'') IS NULL THEN 'SIN_NIVEL'
       ELSE 'NIVEL_OTRO' END AS nc,
  n.operador AS op_raw,
  NULLIF(UPPER(LTRIM(RTRIM(n.operador))),'') AS op,
  NULLIF(UPPER(LTRIM(RTRIM(n.maquina))),'') AS mq
 FROM dbo.no_conformidades n
 WHERE n.eliminado = 0 AND n.ambito = 'PRODUCTO'),
b AS (
 SELECT b0.*, $opVis AS op_vis,
  CASE nc WHEN 'CRITICO' THEN 10 WHEN 'MAYOR' THEN 5 WHEN 'MENOR' THEN 1 ELSE 0 END AS pts
 FROM b0)
"@

    $cols = @"
COUNT(*) AS total,
 SUM(CASE WHEN nc='CRITICO' THEN 1 ELSE 0 END) AS criticos,
 SUM(CASE WHEN nc='MAYOR' THEN 1 ELSE 0 END) AS mayores,
 SUM(CASE WHEN nc='MENOR' THEN 1 ELSE 0 END) AS menores,
 SUM(CASE WHEN nc IN ('SIN_NIVEL','NIVEL_OTRO') THEN 1 ELSE 0 END) AS sin_clasificar,
 SUM(pts) AS puntos_10_5_1
"@

    $consultas = [ordered]@{}

    $consultas['01_esquema'] = @"
SELECT TABLE_NAME, ORDINAL_POSITION, COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME IN ('no_conformidades','maquinas')
ORDER BY TABLE_NAME, ORDINAL_POSITION
"@

    $consultas['02_conteos_reales'] = @"
SELECT 'no_conformidades' AS tabla, COUNT(*) AS filas FROM dbo.no_conformidades
UNION ALL SELECT 'maquinas', COUNT(*) FROM dbo.maquinas
"@

    $consultas['03_ambito_empresa_eliminado'] = @"
SELECT ambito, empresa, eliminado, COUNT(*) AS filas
FROM dbo.no_conformidades GROUP BY ambito, empresa, eliminado ORDER BY filas DESC
"@

    $consultas['04_cobertura'] = @"
$B
SELECT CASE WHEN GROUPING(empresa)=1 THEN '(TODAS)' ELSE ISNULL(empresa,'(NULL)') END AS empresa, COUNT(*) AS total,
 SUM(CASE WHEN ff IS NULL THEN 1 ELSE 0 END) AS sin_fecha_fabricacion,
 SUM(CASE WHEN nc IN ('SIN_NIVEL','NIVEL_OTRO') THEN 1 ELSE 0 END) AS sin_nivel_valido,
 SUM(CASE WHEN op IS NULL THEN 1 ELSE 0 END) AS sin_operador,
 SUM(CASE WHEN mq IS NULL THEN 1 ELSE 0 END) AS sin_maquina,
 SUM(CASE WHEN NULLIF(LTRIM(RTRIM(np_nv)),'') IS NULL THEN 1 ELSE 0 END) AS sin_np_nv,
 SUM(CASE WHEN ff IS NOT NULL AND op IS NOT NULL AND nc IN ('CRITICO','MAYOR','MENOR') THEN 1 ELSE 0 END) AS atribuibles_a_puntos
FROM b GROUP BY ROLLUP(empresa)
"@

    $consultas['05_valores_nivel'] = @"
SELECT nivel, DATALENGTH(nivel) AS bytes, COUNT(*) AS filas
FROM dbo.no_conformidades WHERE eliminado=0 AND ambito='PRODUCTO'
GROUP BY nivel ORDER BY filas DESC
"@

    $consultas['06_valores_severidad'] = @"
SELECT severidad, COUNT(*) AS filas
FROM dbo.no_conformidades WHERE eliminado=0 AND ambito='PRODUCTO'
GROUP BY severidad ORDER BY filas DESC
"@

    $consultas['07_nivel_por_severidad'] = @"
SELECT nivel, severidad, COUNT(*) AS filas
FROM dbo.no_conformidades WHERE eliminado=0 AND ambito='PRODUCTO'
GROUP BY nivel, severidad ORDER BY filas DESC
"@

    $consultas['08_por_mes_fabricacion'] = @"
$B
SELECT ISNULL(CONVERT(char(7), ff, 120),'(sin fecha)') AS mes_fabricacion, $cols,
 SUM(CASE WHEN op IS NULL THEN 1 ELSE 0 END) AS sin_operador,
 SUM(CASE WHEN mq IS NULL THEN 1 ELSE 0 END) AS sin_maquina
FROM b GROUP BY CONVERT(char(7), ff, 120) ORDER BY 1
"@

    $consultas['09_octubre_2026_fabricacion_vs_ingreso'] = @"
$B
SELECT
 SUM(CASE WHEN ff >= '20261001' AND ff < '20261101' THEN 1 ELSE 0 END) AS oct_por_fabricacion,
 SUM(CASE WHEN fi >= '20261001' AND fi < '20261101' THEN 1 ELSE 0 END) AS oct_por_ingreso,
 SUM(CASE WHEN ff >= '20261001' AND ff < '20261101' AND NOT (fi >= '20261001' AND fi < '20261101') THEN 1 ELSE 0 END) AS fab_oct_ingreso_otro_mes,
 SUM(CASE WHEN fi >= '20261001' AND fi < '20261101' AND (ff IS NULL OR NOT (ff >= '20261001' AND ff < '20261101')) THEN 1 ELSE 0 END) AS ingreso_oct_fab_otro_mes_o_nula
FROM b
"@

    $consultas['10_fechas_retraso_inconsistencias'] = @"
$B
SELECT COUNT(*) AS con_ambas_fechas,
 MIN(DATEDIFF(day, ff, fi)) AS retraso_min_dias,
 AVG(CAST(DATEDIFF(day, ff, fi) AS float)) AS retraso_prom_dias,
 MAX(DATEDIFF(day, ff, fi)) AS retraso_max_dias,
 SUM(CASE WHEN ff > fi THEN 1 ELSE 0 END) AS fabricacion_posterior_a_ingreso,
 SUM(CASE WHEN ff > CAST(GETDATE() AS date) THEN 1 ELSE 0 END) AS fabricacion_futura,
 SUM(CASE WHEN ff < '20240101' THEN 1 ELSE 0 END) AS fabricacion_anterior_2024
FROM b WHERE ff IS NOT NULL AND fi IS NOT NULL
"@

    $consultas['11_por_maquina'] = @"
$B
SELECT ISNULL(mq,'(sin maquina)') AS maquina, $cols,
 CASE WHEN mq IS NULL THEN NULL WHEN EXISTS (SELECT 1 FROM dbo.maquinas m WHERE UPPER(LTRIM(RTRIM(m.nombre))) = mq) THEN 1 ELSE 0 END AS existe_en_catalogo,
 COUNT(DISTINCT op) AS operadores_distintos
FROM b GROUP BY mq ORDER BY total DESC
"@

    # SQL Server no permite SUM sobre una expresion con subconsulta: se calcula en una tabla derivada.
    $consultas['12_catalogo_maquinas'] = @"
$B
SELECT x.activo, COUNT(*) AS maquinas_catalogo, SUM(x.con_nc) AS con_nc
FROM (SELECT m.activo, CASE WHEN EXISTS (SELECT 1 FROM b WHERE b.mq = UPPER(LTRIM(RTRIM(m.nombre)))) THEN 1 ELSE 0 END AS con_nc
      FROM dbo.maquinas m) x
GROUP BY x.activo
"@

    $consultas['13_por_operador'] = @"
$B
SELECT op_vis AS operador, $cols,
 COUNT(DISTINCT CAST(op_raw AS varbinary(400))) AS variantes_de_escritura,
 COUNT(DISTINCT CONVERT(char(7), ff, 120)) AS meses_distintos,
 COUNT(DISTINCT mq) AS maquinas_distintas
FROM b GROUP BY op_vis ORDER BY total DESC
"@

    $consultas['14_patrones_operador'] = @"
$B
SELECT categoria, COUNT(*) AS filas FROM (
 SELECT CASE
   WHEN op IS NULL THEN 'vacio'
   WHEN op IN ('N/A','NA','S/D','SD','-','--','VARIOS','NO APLICA','SIN OPERADOR','NINGUNO','GENERAL','TODOS') THEN 'generico'
   WHEN op LIKE '%/%' OR op LIKE '%,%' OR op LIKE '% Y %' OR op LIKE '%+%' OR op LIKE '%' + CHAR(59) + '%' THEN 'multiple_separador'
   WHEN LEN(op) <= 3 THEN 'muy_corto'
   ELSE 'ok' END AS categoria
 FROM b) x GROUP BY categoria ORDER BY filas DESC
"@

    $consultas['15_duplicados_potenciales'] = @"
$B, d AS (
 SELECT np_nv, op, ff, mq, nc, COUNT(*) AS n FROM b
 WHERE NULLIF(LTRIM(RTRIM(np_nv)),'') IS NOT NULL AND op IS NOT NULL AND ff IS NOT NULL
 GROUP BY np_nv, op, ff, mq, nc HAVING COUNT(*) > 1)
SELECT n AS filas_por_grupo, COUNT(*) AS grupos, SUM(n) AS filas_totales FROM d GROUP BY n ORDER BY n
"@

    $consultas['16_formato_np_nv'] = @"
$B
SELECT CASE WHEN NULLIF(LTRIM(RTRIM(np_nv)),'') IS NULL THEN 'vacio'
            WHEN LTRIM(RTRIM(np_nv)) NOT LIKE '%[^0-9]%' THEN 'solo_digitos'
            WHEN UPPER(LTRIM(RTRIM(np_nv))) LIKE 'NV%' THEN 'empieza_NV'
            ELSE 'otro_formato' END AS formato_np_nv, COUNT(*) AS filas
FROM b GROUP BY CASE WHEN NULLIF(LTRIM(RTRIM(np_nv)),'') IS NULL THEN 'vacio'
            WHEN LTRIM(RTRIM(np_nv)) NOT LIKE '%[^0-9]%' THEN 'solo_digitos'
            WHEN UPPER(LTRIM(RTRIM(np_nv))) LIKE 'NV%' THEN 'empieza_NV'
            ELSE 'otro_formato' END ORDER BY filas DESC
"@

    $consultas['17_simulacion_mes_operador_maquina'] = @"
$B
SELECT CONVERT(char(7), ff, 120) AS mes_fabricacion, op_vis AS operador, ISNULL(mq,'(sin maquina)') AS maquina,
 SUM(CASE WHEN nc='CRITICO' THEN 1 ELSE 0 END) AS criticos,
 SUM(CASE WHEN nc='MAYOR' THEN 1 ELSE 0 END) AS mayores,
 SUM(CASE WHEN nc='MENOR' THEN 1 ELSE 0 END) AS menores,
 SUM(pts) AS puntos_10_5_1
FROM b WHERE ff IS NOT NULL AND op IS NOT NULL AND nc IN ('CRITICO','MAYOR','MENOR')
GROUP BY CONVERT(char(7), ff, 120), op_vis, mq ORDER BY mes_fabricacion, puntos_10_5_1 DESC
"@

    $consultas['18_simulacion_mes_incluidos_vs_excluidos'] = @"
$B
SELECT ISNULL(CONVERT(char(7), ff, 120),'(sin fecha)') AS mes_fabricacion,
 CASE WHEN ff IS NULL THEN 'EXCLUIDA_sin_fecha_fabricacion'
      WHEN nc NOT IN ('CRITICO','MAYOR','MENOR') THEN 'EXCLUIDA_nivel_sin_clasificar'
      WHEN op IS NULL THEN 'EXCLUIDA_sin_operador'
      ELSE 'INCLUIDA' END AS estado,
 $cols
FROM b
GROUP BY CONVERT(char(7), ff, 120),
 CASE WHEN ff IS NULL THEN 'EXCLUIDA_sin_fecha_fabricacion'
      WHEN nc NOT IN ('CRITICO','MAYOR','MENOR') THEN 'EXCLUIDA_nivel_sin_clasificar'
      WHEN op IS NULL THEN 'EXCLUIDA_sin_operador'
      ELSE 'INCLUIDA' END
ORDER BY 1, 2
"@

    $consultas['19_octubre_2026_cobertura'] = @"
$B
SELECT COUNT(*) AS nc_fabricadas_octubre,
 SUM(CASE WHEN op IS NULL THEN 1 ELSE 0 END) AS sin_operador,
 SUM(CASE WHEN mq IS NULL THEN 1 ELSE 0 END) AS sin_maquina,
 SUM(CASE WHEN nc NOT IN ('CRITICO','MAYOR','MENOR') THEN 1 ELSE 0 END) AS sin_nivel_valido,
 SUM(CASE WHEN op IS NOT NULL AND nc IN ('CRITICO','MAYOR','MENOR') THEN 1 ELSE 0 END) AS atribuibles,
 COUNT(DISTINCT op) AS operadores_distintos,
 COUNT(DISTINCT mq) AS maquinas_distintas
FROM b WHERE ff >= '20261001' AND ff < '20261101'
"@

    # Validacion minima de estructura del resultado (filas esperadas como minimo).
    $minFilas = @{ '01_esquema' = 20; '02_conteos_reales' = 2; '04_cobertura' = 1 }

    # ---------------------------------------------------------------- ejecucion
    $sal = [guid]::NewGuid().ToString('N')   # sal de esta corrida; no se guarda
    $resumen = New-Object System.Collections.ArrayList
    $fallos = 0
    foreach ($k in $consultas.Keys) {
        $sw = [System.Diagnostics.Stopwatch]::StartNew()
        $estado = 'OK'; $filas = 0; $detalleError = ''; $columnas = @()
        try {
            $p = @{}
            if ($consultas[$k] -match '@sal') { $p['@sal'] = $sal }
            $dt = Invoke-Consulta $consultas[$k] $p
            if ($dt.Columns.Count -eq 0) { throw 'Resultado sin columnas.' }
            $columnas = @($dt.Columns | ForEach-Object { $_.ColumnName })
            $filas = $dt.Rows.Count
            if ($minFilas.ContainsKey($k) -and $filas -lt $minFilas[$k]) { throw "Estructura inesperada: $filas fila(s), se esperaban al menos $($minFilas[$k])." }
            Write-Csv $dt (Join-Path $DirSalida ($k + '.csv'))
        }
        catch {
            $estado = 'ERROR'; $fallos++
            $detalleError = $_.Exception.Message.Split("`n")[0]
        }
        $sw.Stop()
        [void]$resumen.Add([pscustomobject]@{ consulta = $k; estado = $estado; filas = $filas; columnas = ($columnas -join '|'); ms = $sw.ElapsedMilliseconds; error = $detalleError })
        Write-Host ('{0,-45} {1,-6} filas={2}' -f $k, $estado, $filas)
    }
    $sal = $null

    $meta = [pscustomobject]@{
        script_version = $ScriptVersion
        script_sha256 = (Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash
        fecha_ejecucion = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
        servidor = $Servidor; base = $Base; usuario = $Usuario
        tls = $(if ($Local) { 'Local: Shared Memory verificado (net_transport); sin red; TrustServerCertificate=False' } else { 'Encrypt=True; TrustServerCertificate=False (validado)' })
        operadores_en_claro = [bool]$ConNombres
        pesos = 'CRITICO=10; MAYOR=5; MENOR=1 (provisional, formula NO aprobada)'
        filtro_base = "eliminado=0 AND ambito='PRODUCTO'"
        consultas = $resumen
    }
    $meta | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $DirSalida 'resumen_ejecucion.json') -Encoding UTF8

    Write-Host ''
    Write-Host "Resultados en: $DirSalida"
    if ($fallos -gt 0) { Write-Host "ATENCION: $fallos consulta(s) fallaron; ver resumen_ejecucion.json."; $script:Codigo = 1 }
    else { Write-Host 'Auditoria completada sin errores.' }
}
catch {
    $m = $_.Exception.Message
    if ($m -ne 'ABORT' -and $m -ne 'FIN') {
        [Console]::Error.WriteLine('ERROR inesperado: ' + $m.Split("`n")[0])
        if ($script:Codigo -eq 0) { $script:Codigo = 1 }
    }
}
finally {
    if ($null -ne $cn) { try { $cn.Close(); $cn.Dispose() } catch { } }
    if ($null -ne $clave) { try { $clave.Dispose() } catch { } }
}
exit $script:Codigo
