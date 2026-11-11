<#
.SYNOPSIS
  Consulta historica de SOLO LECTURA. Se ejecuta EN SAP_NEW (lo envia Invoke-FpsHistorico.ps1 por PowerShell Remoting).

.DESCRIPTION
  Modos (catalogo cerrado; no acepta SQL libre):
    esquema    columnas de [plan].[vw_FactProduccion]               (FPS_PRODUCCION, fps_historico_ro)
    cobertura  agregado mensual de la vista (sesiones/NP/OT/operadores/maquinas/calidad del dato)
    nps        sesiones de fabricacion de una lista de NP (hasta 500)
    nc         no conformidades de calidad_db (qcc_audit_ro, SELECT sobre dbo.no_conformidades)
  Seguridad:
    - Credencial SQL: archivo Export-Clixml (DPAPI) ya existente en el perfil con el que se ejecuta. Se usa como
      SecureString en SqlCredential: nunca se convierte a texto ni se escribe/imprime.
    - Conexion solo por Shared Memory local (lpc:), verificada (transporte y maquina). Sin TCP, sin relajar certificados.
    - Verifica identidad y minimo privilegio antes de leer datos; si no calza, aborta.
    - Guarda de solo lectura (SELECT/WITH, sin ';' ni palabras de escritura/EXEC/INTO) sobre cada consulta;
      parametros tipados; LOCK_TIMEOUT, CommandTimeout y TOP acotados.
    - Solo lee [plan].[vw_FactProduccion] (modos fps) o dbo.no_conformidades (modo nc). La columna Rut no se devuelve.
  Devuelve un objeto con CSV en texto (el wrapper los guarda localmente). No escribe archivos en el servidor.
#>
param([Parameter(Mandatory = $true)][string]$ParametrosJson)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
$ScriptVersion = '1.0-20261110'
$cn = $null

function Test-SqlSoloLectura([string]$sql) {
    if ($sql -notmatch '^\s*(SELECT|WITH)\b') { return $false }
    $sql = [regex]::Replace($sql, "'(?:[^']|'')*'", "''")
    if ($sql -match ';') { return $false }
    if ($sql -match '(?i)\b(INSERT|UPDATE|DELETE|MERGE|DROP|ALTER|CREATE|TRUNCATE|EXEC|EXECUTE|GRANT|REVOKE|DENY|INTO|OPENROWSET|OPENQUERY|OPENDATASOURCE|BULK|BACKUP|RESTORE|SHUTDOWN|WAITFOR|xp_\w+|sp_\w+)\b') { return $false }
    return $true
}

function ConvertTo-CsvCampo($v) {
    if ($v -is [System.DBNull] -or $null -eq $v) { return '' }
    $esTexto = $false
    if ($v -is [datetime]) { $t = $v.ToString('yyyy-MM-dd HH:mm:ss') }
    elseif ($v -is [bool]) { $t = $v.ToString() }
    elseif ($v -is [System.IFormattable]) { $t = $v.ToString($null, [System.Globalization.CultureInfo]::InvariantCulture) }
    else { $t = [string]$v; $esTexto = $true }
    if ($esTexto -and $t -match '^[=+\-@]') { $t = "'" + $t }
    if ($t -match '[",\r\n]') { return '"' + $t.Replace('"', '""') + '"' }
    return $t
}

function ConvertTo-CsvTexto([System.Data.DataTable]$dt, [string[]]$excluir) {
    $sb = New-Object System.Text.StringBuilder
    $nombres = @($dt.Columns | ForEach-Object { $_.ColumnName } | Where-Object { $excluir -notcontains $_ })
    [void]$sb.Append((($nombres | ForEach-Object { ConvertTo-CsvCampo $_ }) -join ',')).Append("`r`n")
    foreach ($row in $dt.Rows) {
        $campos = foreach ($c in $nombres) { ConvertTo-CsvCampo $row[$c] }
        [void]$sb.Append(($campos -join ',')).Append("`r`n")
    }
    return $sb.ToString()
}

function Invoke-Consulta([string]$sql, [hashtable]$parametros, [int]$timeout) {
    if (-not (Test-SqlSoloLectura $sql)) { throw 'Consulta rechazada por la guarda de solo lectura.' }
    $cmd = $cn.CreateCommand()
    $cmd.CommandText = $sql
    $cmd.CommandTimeout = $timeout
    foreach ($k in $parametros.Keys) { [void]$cmd.Parameters.AddWithValue($k, $parametros[$k]) }
    $dt = New-Object System.Data.DataTable
    $da = New-Object System.Data.SqlClient.SqlDataAdapter($cmd)
    [void]$da.Fill($dt)
    return , $dt
}

try {
    # ------------------------------------------------------------ parametros (validacion estricta)
    $p = $ParametrosJson | ConvertFrom-Json
    $modo = [string]$p.modo
    if (@('buscar', 'esquema', 'cobertura', 'nps', 'nc', 'esquema_ot', 'tabla_ot', 'catalogo', 'nc_completo', 'operador_sesiones', 'articulo_sesiones', 'maquina_sesiones', 'lista_maquina') -notcontains $modo) { throw 'Modo no permitido.' }

    if ($modo -eq 'buscar') {
        # Solo lista NOMBRES/RUTAS de archivos .xml cuyo nombre contiene fps_historico_ro o qcc_audit_ro, dentro del perfil
        # de la identidad remota (profundidad 4). No lee el contenido de ningun archivo.
        $rutas = @(Get-ChildItem -LiteralPath $env:USERPROFILE -Recurse -Depth 4 -File -Filter '*.xml' -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -match '(fps_historico_ro|qcc_audit_ro)' } | ForEach-Object { $_.FullName })
        return [pscustomobject]@{ ok = $true; version = $ScriptVersion; maquina = $env:COMPUTERNAME; cuentaSO = [Environment]::UserName;
                                  resumen = [ordered]@{ modo = 'buscar'; rutas = $rutas }; archivos = @{}; error = '' }
    }

    $archivoCred = [string]$p.archivoCredencial
    if ($archivoCred -notmatch '^[A-Za-z]:\\[^<>"|?*;]{1,240}\.xml$') { throw 'Ruta de credencial invalida (se espera una ruta local .xml).' }
    if (-not (Test-Path -LiteralPath $archivoCred -PathType Leaf)) { throw 'No existe el archivo de credencial indicado en el servidor.' }

    $instancia = ''
    if ($p.PSObject.Properties['instancia'] -and [string]$p.instancia -ne '') {
        $instancia = [string]$p.instancia
        if ($instancia -notmatch '^[A-Za-z0-9_$#]{1,64}$') { throw 'Instancia invalida.' }
    }

    $maxFilas = 20000
    if ($p.PSObject.Properties['maxFilas']) { $maxFilas = [int]$p.maxFilas }
    if ($maxFilas -lt 1 -or $maxFilas -gt 50000) { throw 'maxFilas fuera de rango (1..50000).' }
    $timeout = 60
    if ($p.PSObject.Properties['timeoutSeg']) { $timeout = [int]$p.timeoutSeg }
    if ($timeout -lt 5 -or $timeout -gt 120) { throw 'timeoutSeg fuera de rango (5..120).' }

    $hoy = (Get-Date).Date
    $desde = $hoy.AddDays(-1095); $hasta = $hoy
    $fmt = [System.Globalization.CultureInfo]::InvariantCulture
    if ($p.PSObject.Properties['desde'] -and [string]$p.desde -ne '') { $desde = [datetime]::ParseExact([string]$p.desde, 'yyyy-MM-dd', $fmt) }
    if ($p.PSObject.Properties['hasta'] -and [string]$p.hasta -ne '') { $hasta = [datetime]::ParseExact([string]$p.hasta, 'yyyy-MM-dd', $fmt) }
    if ($desde -gt $hasta) { throw 'desde no puede ser posterior a hasta.' }
    if (($hasta - $desde).TotalDays -gt 1830) { throw 'El rango maximo es de 5 anios.' }

    $nps = @()
    $campo = 'NP'
    if ($p.PSObject.Properties['campo'] -and [string]$p.campo -ne '') { $campo = [string]$p.campo }
    if (@('NP', 'NVInnpack') -notcontains $campo) { throw 'Campo no permitido (NP o NVInnpack).' }
    if ($modo -eq 'nps') {
        $nps = @($p.nps | ForEach-Object { [string]$_ } | Select-Object -Unique)
        if ($nps.Count -lt 1 -or $nps.Count -gt 500) { throw 'Lista de NP: se requieren entre 1 y 500.' }
        foreach ($n in $nps) { if ($n -notmatch '^\d{1,10}$') { throw 'NP invalido (solo digitos, hasta 10).' } }
    }

    $tabla = ''; $columna = ''; $valores = @()
    $nombreOp = ''
    $articulos = @(); $idsMaq = @()
    if ($modo -eq 'articulo_sesiones') {
        $articulos = @($p.articulos | ForEach-Object { [string]$_ })
        if ($articulos.Count -lt 1 -or $articulos.Count -gt 20) { throw 'Se requieren entre 1 y 20 codigos de producto.' }
        foreach ($c in $articulos) { if ($c -notmatch '^[0-9]{6,20}$') { throw 'Codigo de producto invalido (solo digitos).' } }
    }
    if ($modo -eq 'maquina_sesiones') {
        $idsMaq = @($p.maquinas | ForEach-Object { [string]$_ })
        if ($idsMaq.Count -lt 1 -or $idsMaq.Count -gt 10) { throw 'Se requieren entre 1 y 10 IdMaquina.' }
        foreach ($c in $idsMaq) { if ($c -notmatch '^[0-9]{1,6}$') { throw 'IdMaquina invalido (solo digitos).' } }
    }
    if ($modo -eq 'operador_sesiones') {
        $nombreOp = ([string]$p.nombre).Trim()
        if ($nombreOp -notmatch '^[A-Za-z\u00C1\u00C9\u00CD\u00D3\u00DA\u00DC\u00D1\u00E1\u00E9\u00ED\u00F3\u00FA\u00FC\u00F1 ]{3,60}$') { throw 'Nombre de operador invalido (solo letras y espacios).' }
    }
    if ($modo -eq 'tabla_ot') {
        $tabla = [string]$p.tabla
        if (@('WorkOrderRecords', 'ZZZMasterOT') -notcontains $tabla) { throw 'Tabla no permitida (WorkOrderRecords o ZZZMasterOT).' }
        $columna = [string]$p.columna
        if ($columna -ne '' -and $columna -notmatch '^[A-Za-z0-9_]{1,60}$') { throw 'Nombre de columna invalido.' }
        $valores = @($p.valores | ForEach-Object { [string]$_ } | Select-Object -Unique)
        if ($valores.Count -gt 500) { throw 'Maximo 500 valores por consulta.' }
        foreach ($v in $valores) { if ($v -notmatch '^\d{1,18}$') { throw 'Valor invalido (solo digitos).' } }
    }

    if ($modo -eq 'nc' -or $modo -eq 'nc_completo') { $base = 'calidad_db'; $usuario = 'qcc_audit_ro' }
    else { $base = 'FPS_PRODUCCION'; $usuario = 'fps_historico_ro' }

    # ------------------------------------------------------------ credencial (SecureString, nunca texto)
    Add-Type -AssemblyName System.Data
    try { $pc = Import-Clixml -LiteralPath $archivoCred }
    catch { throw 'No se pudo leer la credencial (DPAPI: solo la abre la misma cuenta de Windows, en este equipo, que la creo).' }
    if ($pc -isnot [System.Management.Automation.PSCredential]) { throw 'El archivo no contiene un PSCredential.' }
    if ($pc.UserName -ne $usuario) { throw "La credencial no corresponde a $usuario." }
    $clave = $pc.Password.Copy()
    if ($clave.Length -eq 0) { throw 'Clave vacia.' }
    $clave.MakeReadOnly()
    $cred = New-Object System.Data.SqlClient.SqlCredential($usuario, $clave)

    # ------------------------------------------------------------ conexion: solo Shared Memory local
    $servidorSql = 'lpc:' + $env:COMPUTERNAME
    if ($instancia -ne '') { $servidorSql += '\' + $instancia }
    $cs = "Server=$servidorSql;Database=$base;Application Name=fps_historico_ro;Connect Timeout=15;Encrypt=False;TrustServerCertificate=False"
    $cn = New-Object System.Data.SqlClient.SqlConnection($cs, $cred)
    try { $cn.Open() }
    catch { throw ('No se pudo conectar por Shared Memory: ' + $_.Exception.Message.Split("`n")[0]) }
    foreach ($set in @('SET LOCK_TIMEOUT 10000', 'SET DEADLOCK_PRIORITY LOW')) {
        $c0 = $cn.CreateCommand(); $c0.CommandText = $set; [void]$c0.ExecuteNonQuery()
    }

    # ------------------------------------------------------------ identidad y minimo privilegio
    if ($modo -eq 'nc' -or $modo -eq 'nc_completo') {
        $objeto = 'dbo.no_conformidades'
    }
    elseif ($modo -eq 'tabla_ot') { $objeto = 'dbo.' + $tabla }
    elseif ($modo -eq 'esquema_ot' -or $modo -eq 'catalogo') { $objeto = 'dbo.WorkOrderRecords' }
    else { $objeto = 'plan.vw_FactProduccion' }
    $sqlId = @"
SELECT SUSER_NAME() AS usuario, DB_NAME() AS base,
 CONVERT(varchar(40), CONNECTIONPROPERTY('net_transport')) AS transporte,
 CONVERT(varchar(128), SERVERPROPERTY('MachineName')) AS maquina_servidor,
 IS_SRVROLEMEMBER('sysadmin') AS es_sysadmin,
 IS_MEMBER('db_owner') AS es_db_owner,
 IS_MEMBER('db_datareader') AS es_db_datareader,
 HAS_PERMS_BY_NAME('$objeto','OBJECT','SELECT') AS sel_obj,
 HAS_PERMS_BY_NAME('$objeto','OBJECT','INSERT') AS ins_obj,
 HAS_PERMS_BY_NAME('$objeto','OBJECT','UPDATE') AS upd_obj,
 HAS_PERMS_BY_NAME('$objeto','OBJECT','DELETE') AS del_obj,
 HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','CREATE TABLE') AS create_table,
 HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','ALTER') AS alter_db
"@
    $id = Invoke-Consulta $sqlId @{} $timeout
    $f = $id.Rows[0]
    $ok = ($f['usuario'] -eq $usuario) -and ($f['base'] -eq $base) -and
          ($f['transporte'] -eq 'Shared memory') -and ([string]$f['maquina_servidor'] -ieq $env:COMPUTERNAME) -and
          ($f['es_sysadmin'] -eq 0) -and ($f['es_db_owner'] -eq 0) -and ($f['es_db_datareader'] -eq 0) -and
          ($f['sel_obj'] -eq 1) -and ($f['ins_obj'] -eq 0) -and ($f['upd_obj'] -eq 0) -and ($f['del_obj'] -eq 0) -and
          ($f['create_table'] -eq 0) -and ($f['alter_db'] -eq 0)
    if (-not $ok) { throw 'Identidad, transporte o permisos no cumplen el minimo privilegio esperado. Abortado sin leer datos de negocio.' }

    # ------------------------------------------------------------ consulta del modo
    $archivos = [ordered]@{}
    $resumen = [ordered]@{ modo = $modo; base = $base; usuarioSql = $usuario; maxFilas = $maxFilas }
    $excluir = @('Rut', 'RUT', 'rut', 'Password', 'Clave', 'Contrasena', 'PasswordHash')

    switch ($modo) {
        'esquema' {
            $sql = @"
SELECT c.ORDINAL_POSITION, c.COLUMN_NAME, c.DATA_TYPE, c.CHARACTER_MAXIMUM_LENGTH, c.IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS c
WHERE c.TABLE_SCHEMA = 'plan' AND c.TABLE_NAME = 'vw_FactProduccion'
ORDER BY c.ORDINAL_POSITION
"@
            $dt = Invoke-Consulta $sql @{} $timeout
            $archivos['esquema_vw_FactProduccion.csv'] = ConvertTo-CsvTexto $dt $excluir
        }
        'cobertura' {
            $sql = @"
SELECT FORMAT([FECHA INICIO], 'yyyy-MM') AS mes,
 COUNT(*) AS filas, COUNT(DISTINCT ID) AS sesiones, COUNT(DISTINCT NP) AS np_distintos, COUNT(DISTINCT OT) AS ot_distintas,
 COUNT(DISTINCT OPERADOR) AS operadores_distintos, COUNT(DISTINCT MAQUINA) AS maquinas_distintas,
 SUM(CASE WHEN OPERADOR IS NULL OR LTRIM(RTRIM(OPERADOR)) = '' THEN 1 ELSE 0 END) AS sin_operador,
 SUM(CASE WHEN LOWER(LTRIM(RTRIM(OPERADOR))) IN ('admin','administrador') THEN 1 ELSE 0 END) AS operador_generico,
 SUM(CASE WHEN [FECHA TERMINO] < [FECHA INICIO] THEN 1 ELSE 0 END) AS fechas_invertidas,
 MIN([FECHA INICIO]) AS primera_sesion, MAX([FECHA INICIO]) AS ultima_sesion
FROM [plan].[vw_FactProduccion]
WHERE [FECHA INICIO] >= @desde AND [FECHA INICIO] < DATEADD(DAY, 1, @hasta)
GROUP BY FORMAT([FECHA INICIO], 'yyyy-MM')
ORDER BY 1
"@
            $dt = Invoke-Consulta $sql @{ '@desde' = $desde; '@hasta' = $hasta } $timeout
            $archivos['cobertura_mensual.csv'] = ConvertTo-CsvTexto $dt $excluir
            $resumen['desde'] = $desde.ToString('yyyy-MM-dd'); $resumen['hasta'] = $hasta.ToString('yyyy-MM-dd')
            $resumen['meses'] = $dt.Rows.Count
        }
        'nps' {
            $ph = @(); $par = @{ '@max' = $maxFilas }
            for ($i = 0; $i -lt $nps.Count; $i++) { $ph += "@n$i"; $par["@n$i"] = $nps[$i] }
            $sql = "SELECT TOP (@max) * FROM [plan].[vw_FactProduccion] WHERE CAST($campo AS varchar(20)) IN (" + ($ph -join ',') + ") ORDER BY [FECHA INICIO], ID"
            $dt = Invoke-Consulta $sql $par $timeout
            $nombreArchivo = if ($campo -eq 'NP') { 'sesiones_por_np.csv' } else { 'sesiones_por_nv.csv' }
            $archivos[$nombreArchivo] = ConvertTo-CsvTexto $dt $excluir
            $resumen['campo'] = $campo
            $resumen['npsConsultados'] = $nps.Count
            $resumen['filas'] = $dt.Rows.Count
            $resumen['truncado'] = ($dt.Rows.Count -ge $maxFilas)
        }
        'nc_completo' {
            # Modelo real de la NC: todas las columnas (esquema) y todas las filas de producto no eliminadas, para revisar que campos existen.
            $sqlE = "SELECT c.ORDINAL_POSITION, c.COLUMN_NAME, c.DATA_TYPE, c.CHARACTER_MAXIMUM_LENGTH, c.IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS c WHERE c.TABLE_SCHEMA = 'dbo' AND c.TABLE_NAME = 'no_conformidades' ORDER BY c.ORDINAL_POSITION"
            $dtE = Invoke-Consulta $sqlE @{} $timeout
            $archivos['esquema_no_conformidades.csv'] = ConvertTo-CsvTexto $dtE $excluir
            $sqlN = "SELECT TOP (@max) * FROM dbo.no_conformidades WHERE ambito = 'PRODUCTO' ORDER BY id"
            $dtN = Invoke-Consulta $sqlN @{ '@max' = $maxFilas } $timeout
            $archivos['nc_producto_completo.csv'] = ConvertTo-CsvTexto $dtN $excluir
            $resumen['columnasNc'] = $dtE.Rows.Count; $resumen['filasNcProducto'] = $dtN.Rows.Count
        }
        'operador_sesiones' {
            # Sesiones (solo vista de hechos, sin Rut) de UNA persona: todas las palabras del nombre deben estar en OPERADOR.
            $toks = @($nombreOp -split '\s+' | Where-Object { $_.Length -ge 3 } | Select-Object -First 4)
            if ($toks.Count -lt 1) { throw 'Se requiere al menos una palabra de 3 letras.' }
            $par = @{ '@max' = $maxFilas; '@desde' = $desde; '@hasta' = $hasta }
            $cond = @()
            for ($i = 0; $i -lt $toks.Count; $i++) { $par["@t$i"] = '%' + $toks[$i] + '%'; $cond += "OPERADOR LIKE @t$i" }
            $sql = "SELECT TOP (@max) ID, OT, NP, NVInnpack, OPERADOR, MAQUINA, IdMaquina, Proceso, [FECHA INICIO], [FECHA TERMINO], CANTIDAD_PRODUCCION FROM [plan].[vw_FactProduccion] WHERE [FECHA INICIO] >= @desde AND [FECHA INICIO] < DATEADD(DAY, 1, @hasta) AND " + ($cond -join ' AND ') + " ORDER BY [FECHA INICIO], ID"
            $dt = Invoke-Consulta $sql $par $timeout
            $archivos['sesiones_operador.csv'] = ConvertTo-CsvTexto $dt $excluir
            $resumen['filas'] = $dt.Rows.Count; $resumen['truncado'] = ($dt.Rows.Count -ge $maxFilas)
        }
        'articulo_sesiones' {
            # Sesiones (solo vista de hechos, sin Rut) cuyo ARTICULO es uno de los codigos pedidos, en TODO el historial.
            $par = @{ '@max' = $maxFilas }
            $in = @()
            for ($i = 0; $i -lt $articulos.Count; $i++) { $par["@a$i"] = $articulos[$i]; $in += "@a$i" }
            $sql = "SELECT TOP (@max) ID, OT, NP, NVInnpack, ARTICULO, OPERADOR, MAQUINA, IdMaquina, Proceso, [FECHA INICIO], [FECHA TERMINO], CANTIDAD_PRODUCCION FROM [plan].[vw_FactProduccion] WHERE ARTICULO IN (" + ($in -join ',') + ") ORDER BY [FECHA INICIO], ID"
            $dt = Invoke-Consulta $sql $par $timeout
            $archivos['sesiones_articulo.csv'] = ConvertTo-CsvTexto $dt $excluir
            $resumen['filas'] = $dt.Rows.Count; $resumen['truncado'] = ($dt.Rows.Count -ge $maxFilas)
        }
        'maquina_sesiones' {
            # Todas las sesiones de las maquinas pedidas (IdMaquina) dentro de una ventana de fechas.
            $par = @{ '@max' = $maxFilas; '@desde' = $desde; '@hasta' = $hasta }
            $in = @()
            for ($i = 0; $i -lt $idsMaq.Count; $i++) { $par["@m$i"] = [int]$idsMaq[$i]; $in += "@m$i" }
            $sql = "SELECT TOP (@max) ID, OT, NP, NVInnpack, ARTICULO, OPERADOR, MAQUINA, IdMaquina, Proceso, [FECHA INICIO], [FECHA TERMINO], CANTIDAD_PRODUCCION FROM [plan].[vw_FactProduccion] WHERE IdMaquina IN (" + ($in -join ',') + ") AND [FECHA INICIO] >= @desde AND [FECHA INICIO] < DATEADD(DAY, 1, @hasta) ORDER BY [FECHA INICIO], ID"
            $dt = Invoke-Consulta $sql $par $timeout
            $archivos['sesiones_maquina.csv'] = ConvertTo-CsvTexto $dt $excluir
            $resumen['filas'] = $dt.Rows.Count; $resumen['truncado'] = ($dt.Rows.Count -ge $maxFilas)
        }
        'lista_maquina' {
            # Catalogo de maquinas (sin datos personales). Requiere el GRANT SELECT sobre dbo.ZZZListaMaquina (propuesta 27b, no ejecutada).
            $par = @{ '@max' = $maxFilas }
            $dt = Invoke-Consulta 'SELECT TOP (@max) * FROM dbo.ZZZListaMaquina' $par $timeout
            $archivos['lista_maquina.csv'] = ConvertTo-CsvTexto $dt $excluir
            $resumen['filas'] = $dt.Rows.Count
        }
        'catalogo' {
            # Solo metadatos (sys.*): nombres de objetos, filas aproximadas, si la cuenta ya tiene SELECT, y columnas cuyo nombre sugiere
            # sesiones/turnos/eventos/operadores/maquinas/defectos/historial. No lee datos de negocio.
            $sql = @"
SELECT s.name AS esquema, o.name AS objeto, o.type_desc AS tipo, o.create_date, o.modify_date,
 (SELECT SUM(p.rows) FROM sys.partitions p WHERE p.object_id = o.object_id AND p.index_id IN (0,1)) AS filas_aprox,
 HAS_PERMS_BY_NAME(s.name + '.' + o.name, 'OBJECT', 'SELECT') AS select_actual
FROM sys.objects o JOIN sys.schemas s ON s.schema_id = o.schema_id
WHERE o.type IN ('U','V') AND o.is_ms_shipped = 0
ORDER BY s.name, o.name
"@
            $dt = Invoke-Consulta $sql @{} $timeout
            $archivos['catalogo_objetos.csv'] = ConvertTo-CsvTexto $dt $excluir
            $resumen['objetosVisibles'] = $dt.Rows.Count
            $sql2 = @"
SELECT TOP (@max) s.name AS esquema, o.name AS objeto, c.name AS columna, t.name AS tipo
FROM sys.columns c JOIN sys.objects o ON o.object_id = c.object_id JOIN sys.schemas s ON s.schema_id = o.schema_id
JOIN sys.types t ON t.user_type_id = c.user_type_id
WHERE o.type IN ('U','V') AND o.is_ms_shipped = 0
 AND (c.name LIKE '%turno%' OR c.name LIKE '%shift%' OR c.name LIKE '%event%' OR c.name LIKE '%sesion%' OR c.name LIKE '%session%'
   OR c.name LIKE '%parada%' OR c.name LIKE '%defect%' OR c.name LIKE '%calidad%' OR c.name LIKE '%quality%' OR c.name LIKE '%history%'
   OR c.name LIKE '%historial%' OR c.name LIKE '%audit%' OR c.name LIKE '%operator%' OR c.name LIKE '%operador%' OR c.name LIKE '%usuario%'
   OR c.name LIKE '%resource%' OR c.name LIKE '%maquina%' OR c.name LIKE '%station%' OR c.name LIKE '%login%')
ORDER BY s.name, o.name, c.column_id
"@
            $dt2 = Invoke-Consulta $sql2 @{ '@max' = $maxFilas } $timeout
            $archivos['catalogo_columnas_candidatas.csv'] = ConvertTo-CsvTexto $dt2 $excluir
            $resumen['columnasCandidatas'] = $dt2.Rows.Count
        }
        'esquema_ot' {
            $sql = @"
SELECT c.TABLE_NAME, c.ORDINAL_POSITION, c.COLUMN_NAME, c.DATA_TYPE, c.CHARACTER_MAXIMUM_LENGTH, c.IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS c
WHERE c.TABLE_SCHEMA = 'dbo' AND c.TABLE_NAME IN ('WorkOrderRecords', 'ZZZMasterOT')
ORDER BY c.TABLE_NAME, c.ORDINAL_POSITION
"@
            $dt = Invoke-Consulta $sql @{} $timeout
            $archivos['esquema_tablas_ot.csv'] = ConvertTo-CsvTexto $dt $excluir
            $c1 = Invoke-Consulta 'SELECT COUNT_BIG(*) AS filas FROM dbo.WorkOrderRecords' @{} $timeout
            $c2 = Invoke-Consulta 'SELECT COUNT_BIG(*) AS filas FROM dbo.ZZZMasterOT' @{} $timeout
            $resumen['filasWorkOrderRecords'] = [int64]$c1.Rows[0]['filas']
            $resumen['filasZZZMasterOT'] = [int64]$c2.Rows[0]['filas']
            $m1 = Invoke-Consulta 'SELECT TOP (30) * FROM dbo.WorkOrderRecords ORDER BY 1 DESC' @{} $timeout
            $m2 = Invoke-Consulta 'SELECT TOP (30) * FROM dbo.ZZZMasterOT ORDER BY 1 DESC' @{} $timeout
            $archivos['muestra_WorkOrderRecords.csv'] = ConvertTo-CsvTexto $m1 $excluir
            $archivos['muestra_ZZZMasterOT.csv'] = ConvertTo-CsvTexto $m2 $excluir
        }
        'tabla_ot' {
            if ($columna -eq '' -or $valores.Count -eq 0) { throw 'tabla_ot requiere columna y al menos un valor.' }
            $ex = Invoke-Consulta "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME=@t AND COLUMN_NAME=@c" @{ '@t' = $tabla; '@c' = $columna } $timeout
            if ($ex.Rows.Count -ne 1) { throw 'La columna no existe en la tabla.' }
            $ph = @(); $par = @{ '@max' = $maxFilas }
            for ($i = 0; $i -lt $valores.Count; $i++) { $ph += "@v$i"; $par["@v$i"] = $valores[$i] }
            $sql = "SELECT TOP (@max) * FROM dbo.[$tabla] WHERE CAST([$columna] AS varchar(30)) IN (" + ($ph -join ',') + ")"
            $dt = Invoke-Consulta $sql $par $timeout
            $archivos["tabla_$tabla.csv"] = ConvertTo-CsvTexto $dt $excluir
            $resumen['tabla'] = $tabla; $resumen['columna'] = $columna; $resumen['filas'] = $dt.Rows.Count
            $resumen['truncado'] = ($dt.Rows.Count -ge $maxFilas)
        }
        'nc' {
            $sql = "SELECT TOP (@max) id, ambito, empresa, eliminado, np_nv, maquina, fecha_fabricacion, fecha_ingreso, nivel, operador FROM dbo.no_conformidades ORDER BY id"
            $dt = Invoke-Consulta $sql @{ '@max' = $maxFilas } $timeout
            $archivos['nc_calidad.csv'] = ConvertTo-CsvTexto $dt $excluir
            $resumen['filas'] = $dt.Rows.Count
            $resumen['truncado'] = ($dt.Rows.Count -ge $maxFilas)
        }
    }

    [pscustomobject]@{
        ok         = $true
        version    = $ScriptVersion
        maquina    = $env:COMPUTERNAME
        cuentaSO   = [Environment]::UserName
        resumen    = $resumen
        archivos   = $archivos
        error      = ''
    }
}
catch {
    [pscustomobject]@{
        ok = $false; version = $ScriptVersion; maquina = $env:COMPUTERNAME; cuentaSO = [Environment]::UserName
        resumen = $null; archivos = $null; error = $_.Exception.Message.Split("`n")[0]
    }
}
finally {
    if ($null -ne $cn) { $cn.Dispose() }
}
