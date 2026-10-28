<#
.SYNOPSIS
  APLICA (COMMIT) la consolidacion de tipos de desviacion de NC Internas: FARET (46) y luego INNPACK (23).

.DESCRIPTION
  *** ESTE SCRIPT MODIFICA PRODUCCION. *** Solo debe ejecutarse tras revisar el DryRun y con autorizacion expresa.
  No tiene parametros. Nada se aplica por defecto: despues de una compuerta de DryRun (ambas empresas, con ROLLBACK)
  pide una autorizacion escrita (frase exacta + nombre de quien autoriza). Sin ella, termina sin tocar nada.

  Flujo:
    1) Identidad (AD\Administrador, calidad_db) + huellas SHA-256 de los SQL 02 y 03 revisados.
    2) Precondicion: no hay respaldo previo de este lote. Fotografia por fila (solo lectura).
    3) Compuerta: DryRun de FARET e INNPACK con el SQL 02 (cantidades exactas 46 / 23). Base debe quedar identica.
    4) Autorizacion escrita.
    5) FARET: COMMIT con el SQL 02 (DryRun=0) -> verificacion independiente -> prueba de reversion (03 en DryRun).
       Si FARET falla, NO se ejecuta INNPACK.
    6) INNPACK: igual que FARET. Si falla tras el COMMIT de FARET: se detiene, informa el estado parcial y
       NO intenta revertir nada automaticamente.
    7) Verificacion final (solo cambio categoria_defecto en exactamente 69 filas) + manifiesto SHA-256 de la evidencia.

  El respaldo (dbo.nc_tipo_desviacion_migracion) se crea y llena dentro de la transaccion del SQL 02 y persiste con el COMMIT.
  Reversion manual y autorizada: sql\03_rollback_migracion_tipos_desviacion.sql (una empresa por vez).

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\aplicar_migracion_nci.ps1
#>
[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ----------------------------- Constantes (fijas) -----------------------------
$Servidor        = '192.168.1.230'
$Base            = 'calidad_db'
$UsuarioEsperado = 'AD\Administrador'
$HashSql02       = '0F57AEDD6F6E0A574B2C34D65B52BB3EC907C3835CA7BBE11441B22C00B51FB3'   # el que paso el DryRun
$HashSql03       = '1F5A7D53356EB737E1FAF78F749C52E6330A5BEA67976CFB05C6F0CCD74E4A10'
$Lote            = 'Consolidacion tipos NC Internas 2026-10-28'                          # igual al @Lote del SQL 02/03
$FraseAutoriza   = 'APLICAR 69 NC INTERNAS'

$Esperado = [ordered]@{
    FARET   = @{ Total = 129; Elim = 2; Alcance = 46
                 Por = [ordered]@{ 'arte incorrecto' = 12; 'incompleta en carpeta' = 5; 'Barniz / Folia' = 11; 'Cambio de m' = 3; 'Troquel / MFG no coincide' = 15 } }
    INNPACK = @{ Total = 36;  Elim = 0; Alcance = 23
                 Por = [ordered]@{ 'arte incorrecto' = 10; 'incompleta en carpeta' = 1; 'Barniz / Folia' = 6;  'Cambio de m' = 1; 'Troquel / MFG no coincide' = 5 } }
}

# ----------------------------- Utilidades -----------------------------
function Q([string]$s) { '"' + ($s -replace '"', '\"') + '"' }

function Get-HashNormalizado([string]$ruta) {
    $bytes = [IO.File]::ReadAllBytes($ruta)
    $lista = New-Object 'System.Collections.Generic.List[byte]'
    foreach ($b in $bytes) { if ($b -ne 13) { $lista.Add($b) } }
    $sha = [Security.Cryptography.SHA256]::Create()
    (($sha.ComputeHash($lista.ToArray()) | ForEach-Object { $_.ToString('X2') }) -join '')
}

function Leer([string]$ruta) { if (Test-Path $ruta) { (Get-Content $ruta -Raw -Encoding UTF8) } else { '' } }
function Linea([string]$t) { Write-Host $t; Add-Content -Path $script:Resumen -Value $t -Encoding UTF8 }

# Argumentos base: autenticacion Windows, abortar ante error, sin -f
function Assert-ArgsBase([string[]]$a) {
    if ($a -contains '-f')  { throw 'Argumentos invalidos: -f no esta permitido.' }
    if ($a -contains '-U' -or $a -contains '-P') { throw 'Argumentos invalidos: solo autenticacion Windows (-E).' }
    if ($a -notcontains '-E') { throw 'Argumentos invalidos: falta -E.' }
    if ($a -notcontains '-b') { throw 'Argumentos invalidos: falta -b.' }
    $i = [array]::IndexOf($a, '-S'); if ($i -lt 0 -or $a[$i + 1] -ne $Servidor) { throw 'Argumentos invalidos: servidor distinto del esperado.' }
    $i = [array]::IndexOf($a, '-d'); if ($i -lt 0 -or $a[$i + 1] -ne $Base)     { throw 'Argumentos invalidos: base distinta de la esperada.' }
}

# -v exacto para el SQL 02: Empresa=<x> DryRun=<0|1> Autorizado=<nombre>. DryRun=0 SOLO si ya hay autorizacion escrita.
function Assert-ArgsSql02([string[]]$a, [string]$empresa, [string]$dryRun) {
    Assert-ArgsBase $a
    if ($empresa -notin @('FARET', 'INNPACK')) { throw 'Empresa invalida.' }
    if ($dryRun -notin @('0', '1')) { throw 'DryRun invalido.' }
    $autor = if ($dryRun -eq '1') { 'NINGUNO' } else { $script:Autorizado }
    if ($dryRun -eq '0') {
        if (-not $script:AutorizacionConfirmada) { throw 'BLOQUEADO: se intento DryRun=0 sin autorizacion escrita.' }
        if ([string]::IsNullOrWhiteSpace($autor) -or $autor -ieq 'NINGUNO') { throw 'BLOQUEADO: DryRun=0 requiere el nombre de quien autoriza.' }
    }
    if (@($a | Where-Object { $_ -eq '-v' }).Count -ne 1) { throw 'Argumentos invalidos: -v debe aparecer una sola vez.' }
    $v = [array]::IndexOf($a, '-v')
    if ($a[$v + 1] -ne "Empresa=$empresa" -or $a[$v + 2] -ne "DryRun=$dryRun" -or $a[$v + 3] -ne "Autorizado=$autor") {
        throw "Argumentos invalidos: -v debe ser exactamente Empresa=$empresa DryRun=$dryRun Autorizado=$autor."
    }
}

# -v exacto para el SQL 03 (reversion): SOLO en DryRun=1 desde este script
function Assert-ArgsSql03Dry([string[]]$a, [string]$empresa) {
    Assert-ArgsBase $a
    if ($empresa -notin @('FARET', 'INNPACK')) { throw 'Empresa invalida.' }
    if (@($a | Where-Object { $_ -eq '-v' }).Count -ne 1) { throw 'Argumentos invalidos: -v debe aparecer una sola vez.' }
    $v = [array]::IndexOf($a, '-v')
    if ($a[$v + 1] -ne "Empresa=$empresa" -or $a[$v + 2] -ne 'DryRun=1') { throw 'Argumentos invalidos: la prueba de reversion solo se permite con DryRun=1.' }
    if ($a.Count -gt ($v + 3) -and $a[$v + 3] -ne '-i') { throw 'Argumentos invalidos: sobran valores en -v.' }
}

# Ejecuta sqlcmd sin que PowerShell trate stderr como error; devuelve el codigo de salida
function Invoke-SqlcmdExe([string[]]$Argumentos, [string]$Salida, [string]$Errores) {
    $linea = (($Argumentos | ForEach-Object { Q $_ }) -join ' ')
    $p = Start-Process -FilePath $script:SqlcmdExe -ArgumentList $linea -NoNewWindow -PassThru `
         -RedirectStandardOutput $Salida -RedirectStandardError $Errores
    $null = $p.Handle
    $p.WaitForExit()
    return [int]$p.ExitCode
}

function Assert-SinErroresSql([string]$txt, [string]$ctx, [string]$ruta) {
    if ($txt -match '(?im)^\s*(Msg \d+|mssql:|Sqlcmd:)') { throw "${ctx}: la salida contiene errores de SQL. Ver $ruta" }
}

# Consulta de solo lectura (texto ASCII guardado como .sql en la evidencia)
function Invoke-SqlTexto([string]$Nombre, [string]$Texto) {
    $f = Join-Path $script:Wd "$Nombre.sql"
    Set-Content -Path $f -Value $Texto -Encoding ASCII
    $a = $script:ArgsBase + @('-i', $f)
    Assert-ArgsBase $a
    $o = Join-Path $script:Wd "$Nombre.out.txt"; $e = Join-Path $script:Wd "$Nombre.err.txt"
    $rc = Invoke-SqlcmdExe $a $o $e
    $t = Leer $o
    if ($rc -ne 0) { throw "sqlcmd fallo en '$Nombre' (exit=$rc): $(Leer $e) $t" }
    Assert-SinErroresSql $t $Nombre $o
    return $t
}

function Get-CondEmpresa([string]$emp) {
    if ($emp -eq 'FARET') { "empresa = 'FARET'" } else { "(empresa = 'INNPACK' OR empresa IS NULL)" }
}

# ---- Fotografia por fila: id | huella de TODAS las columnas salvo categoria_defecto | categoria_defecto ----
$SqlRowHash = @'
SET NOCOUNT ON;
DECLARE @cols NVARCHAR(MAX) = STUFF((SELECT ', ' + QUOTENAME(COLUMN_NAME)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'no_conformidades' AND COLUMN_NAME <> 'categoria_defecto'
      AND DATA_TYPE NOT IN ('text', 'ntext', 'image', 'xml', 'timestamp')
    ORDER BY ORDINAL_POSITION FOR XML PATH('')), 1, 2, '');
DECLARE @q NVARCHAR(MAX) = N'SELECT id, BINARY_CHECKSUM(' + @cols + N') AS h, categoria_defecto FROM dbo.no_conformidades ORDER BY id';
EXEC sp_executesql @q;
'@

function Get-RowHash([string]$tag) {
    $t = Invoke-SqlTexto "rowhash_$tag" $SqlRowHash
    $d = @{}
    foreach ($l in ($t -split "`r?`n")) {
        if ($l -match '^\s*(\d+)\s*\|\s*(-?\d+)\s*\|(.*)$') { $d[[int]$Matches[1]] = @{ H = $Matches[2]; Cat = $Matches[3].Trim() } }
    }
    if ($d.Count -lt 1) { throw "Fotografia por fila '$tag' vacia o ilegible." }
    return $d
}

# Compara dos fotografias: ninguna otra columna cambia; solo cambian de categoria exactamente los ids esperados
function Assert-Cambios($antes, $despues, [int[]]$esperados, [string]$ctx) {
    if ($antes.Count -ne $despues.Count) { throw "${ctx}: cambio la cantidad de filas ($($antes.Count) -> $($despues.Count))." }
    $cambiados = New-Object 'System.Collections.Generic.List[int]'
    foreach ($id in @($antes.Keys)) {
        if (-not $despues.ContainsKey($id)) { throw "${ctx}: desaparecio la fila id=$id." }
        if ($antes[$id].H -ne $despues[$id].H) { throw "${ctx}: cambio un campo distinto de categoria_defecto en id=$id." }
        if ($antes[$id].Cat -ne $despues[$id].Cat) { $cambiados.Add([int]$id) }
    }
    $x = @($cambiados | Sort-Object); $y = @($esperados | Sort-Object)
    if ($x.Count -ne $y.Count) { throw "${ctx}: filas con categoria cambiada = $($x.Count); esperadas = $($y.Count)." }
    if ($y.Count -gt 0 -and (Compare-Object $x $y)) { throw "${ctx}: las filas cambiadas no coinciden con las respaldadas." }
}

# ---- Validaciones de la salida del SQL 02 ----
function Test-Salida02([string]$emp, [string]$txt, [string]$modo, [string]$ruta) {
    $esp = $Esperado[$emp]
    Assert-SinErroresSql $txt "SQL02 $emp" $ruta
    if ($modo -eq 'DRY') {
        if ($txt -cmatch 'APLICADO a ' -or $txt -cmatch 'YA APLICADO') { throw "ALERTA: el DryRun de $emp indica que se aplico o ya estaba aplicado. DETENIDO." }
        if ($txt -cnotmatch 'SIMULACRO \(DryRun=1\)') { throw "DryRun ${emp}: no se confirmo el ROLLBACK." }
    } else {
        if ($txt -cmatch 'SIMULACRO' -or $txt -cmatch 'YA APLICADO') { throw "Aplicacion ${emp}: la salida indica simulacro o 'ya aplicado'." }
        if ($txt -cnotmatch ('APLICADO a ' + $emp + ' por ' + [regex]::Escape($script:Autorizado))) { throw "Aplicacion ${emp}: no se confirmo 'APLICADO a $emp'." }
    }
    $filas = @(($txt -split "`r?`n") | Where-Object { $_ -match '^\s*ALCANCE\s*\|' } | ForEach-Object { , @($_ -split '\|' | ForEach-Object { $_.Trim() }) })
    if ($filas.Count -ne 5) { throw "SQL02 ${emp}: se esperaban 5 filas ALCANCE y hay $($filas.Count)." }
    $suma = 0
    foreach ($f in $filas) {
        if ($f.Count -lt 6 -or $f[1] -ne $emp) { throw "SQL02 ${emp}: fila ALCANCE mal formada o de otra empresa." }
        $suma += [int]$f[4]
    }
    foreach ($frag in $esp.Por.Keys) {
        $coinc = @($filas | Where-Object { $_[2] -match [regex]::Escape($frag) })
        if ($coinc.Count -ne 1) { throw "SQL02 ${emp}: equivalencia '$frag' encontrada $($coinc.Count) veces." }
        if ([int]$coinc[0][4] -ne $esp.Por[$frag]) { throw "SQL02 ${emp}: '$frag' afecta $($coinc[0][4]) y se esperaban $($esp.Por[$frag])." }
    }
    if ($suma -ne $esp.Alcance) { throw "SQL02 ${emp}: alcance total $suma; esperado $($esp.Alcance)." }
    $ctl = @(($txt -split "`r?`n") | Where-Object { $_ -match '^\s*CONTROL\s*\|' })
    if ($ctl.Count -ne 1) { throw "SQL02 ${emp}: falta la fila CONTROL." }
    $c = @($ctl[0] -split '\|' | ForEach-Object { $_.Trim() })
    $vals = @([int]$c[2], [int]$c[3], [int]$c[4], [int]$c[5], [int]$c[6])
    $exp  = @($esp.Total, $esp.Elim, $esp.Alcance, $esp.Alcance, $esp.Alcance)
    if ($c[1] -ne $emp -or (Compare-Object $vals $exp)) {
        throw "SQL02 ${emp}: CONTROL = $($vals -join '/'); esperado $($exp -join '/') (total/eliminadas/alcance/respaldadas/cambiadas)."
    }
}

function Invoke-Sql02([string]$emp, [string]$dryRun) {
    $autor = if ($dryRun -eq '1') { 'NINGUNO' } else { $script:Autorizado }
    $a = $script:ArgsBase + @('-v', "Empresa=$emp", "DryRun=$dryRun", "Autorizado=$autor", '-i', $script:Sql02)
    Assert-ArgsSql02 $a $emp $dryRun
    $tag = if ($dryRun -eq '1') { "dryrun_$emp" } else { "aplicar_$emp" }
    $o = Join-Path $script:Wd "$tag.out.txt"; $e = Join-Path $script:Wd "$tag.err.txt"
    if ($dryRun -eq '0') { $script:Estado[$emp] = 'ENVIADO A SQL (el COMMIT pudo ocurrir: confirmar con el estado real)' }
    $rc = Invoke-SqlcmdExe $a $o $e
    $txt = Leer $o
    if ($rc -ne 0) { throw "SQL02 $emp (DryRun=$dryRun) termino con error (exit=$rc): $(Leer $e) $txt" }
    Test-Salida02 $emp $txt $(if ($dryRun -eq '1') { 'DRY' } else { 'APLICAR' }) $o
}

# ---- Verificacion independiente posterior al COMMIT (otra conexion): respaldo, destino, conteos ----
function Get-Post([string]$emp) {
    $cond = Get-CondEmpresa $emp
    $sql = @"
SET NOCOUNT ON;
SELECT 'POST' AS k, '$emp' AS empresa,
  (SELECT COUNT(*) FROM dbo.nc_tipo_desviacion_migracion WHERE lote = N'$Lote' AND empresa = '$emp') AS respaldadas,
  (SELECT COUNT(*) FROM dbo.nc_tipo_desviacion_migracion b JOIN dbo.no_conformidades n ON n.id = b.nc_id WHERE b.lote = N'$Lote' AND b.empresa = '$emp' AND n.categoria_defecto = b.categoria_nueva) AS con_destino,
  (SELECT COUNT(*) FROM dbo.nc_tipo_desviacion_migracion b JOIN dbo.no_conformidades n ON n.id = b.nc_id WHERE b.lote = N'$Lote' AND b.empresa = '$emp' AND n.categoria_defecto = b.categoria_anterior) AS con_nombre_antiguo,
  (SELECT COUNT(*) FROM dbo.no_conformidades WHERE ambito = N'INTERNA' AND $cond) AS total,
  (SELECT COUNT(*) FROM dbo.no_conformidades WHERE ambito = N'INTERNA' AND eliminado <> 0 AND $cond) AS eliminadas;
SELECT 'RESP' AS k, categoria_anterior, categoria_nueva, COUNT(*) AS n FROM dbo.nc_tipo_desviacion_migracion WHERE lote = N'$Lote' AND empresa = '$emp' GROUP BY categoria_anterior, categoria_nueva ORDER BY n DESC;
SELECT 'ID' AS k, nc_id FROM dbo.nc_tipo_desviacion_migracion WHERE lote = N'$Lote' AND empresa = '$emp' ORDER BY nc_id;
"@
    $t = Invoke-SqlTexto "post_$emp" $sql
    $esp = $Esperado[$emp]
    $p = @(($t -split "`r?`n") | Where-Object { $_ -match '^\s*POST\s*\|' })
    if ($p.Count -ne 1) { throw "Verificacion ${emp}: falta la fila POST." }
    $c = @($p[0] -split '\|' | ForEach-Object { $_.Trim() })
    $vals = @([int]$c[2], [int]$c[3], [int]$c[4], [int]$c[5], [int]$c[6])
    $exp  = @($esp.Alcance, $esp.Alcance, 0, $esp.Total, $esp.Elim)
    if (Compare-Object $vals $exp) {
        throw "Verificacion ${emp}: respaldadas/con_destino/con_nombre_antiguo/total/eliminadas = $($vals -join '/'); esperado $($exp -join '/')."
    }
    $resp = @(($t -split "`r?`n") | Where-Object { $_ -match '^\s*RESP\s*\|' } | ForEach-Object { , @($_ -split '\|' | ForEach-Object { $_.Trim() }) })
    if ($resp.Count -ne 5) { throw "Verificacion ${emp}: el respaldo tiene $($resp.Count) grupos y se esperaban 5." }
    foreach ($frag in $esp.Por.Keys) {
        $coinc = @($resp | Where-Object { $_[1] -match [regex]::Escape($frag) })
        if ($coinc.Count -ne 1 -or [int]$coinc[0][3] -ne $esp.Por[$frag]) { throw "Verificacion ${emp}: respaldo de '$frag' no coincide con $($esp.Por[$frag])." }
    }
    $ids = @(($t -split "`r?`n") | Where-Object { $_ -match '^\s*ID\s*\|\s*\d+' } | ForEach-Object { [int](($_ -split '\|')[1].Trim()) })
    if ($ids.Count -ne $esp.Alcance) { throw "Verificacion ${emp}: $($ids.Count) ids respaldados; esperado $($esp.Alcance)." }
    return , $ids
}

# ---- Prueba de reversion SIN efecto: el SQL 03 en DryRun (ROLLBACK) debe poder restaurar todo lo respaldado ----
function Test-Rollback03([string]$emp) {
    $a = $script:ArgsBase + @('-v', "Empresa=$emp", 'DryRun=1', '-i', $script:Sql03)
    Assert-ArgsSql03Dry $a $emp
    $o = Join-Path $script:Wd "rollback03_dryrun_$emp.out.txt"; $e = Join-Path $script:Wd "rollback03_dryrun_$emp.err.txt"
    $rc = Invoke-SqlcmdExe $a $o $e
    $txt = Leer $o
    if ($rc -ne 0) { throw "Prueba de reversion $emp fallo (exit=$rc): $(Leer $e) $txt" }
    Assert-SinErroresSql $txt "Reversion $emp" $o
    if ($txt -cmatch 'REVERTIDO') { throw "ALERTA: la prueba de reversion de $emp indica REVERTIDO (debia ser simulacro)." }
    if ($txt -cnotmatch 'SIMULACRO') { throw "Prueba de reversion ${emp}: no se confirmo el ROLLBACK." }
    $r = @(($txt -split "`r?`n") | Where-Object { $_ -match '^\s*REVERSION\s*\|' })
    if ($r.Count -ne 1) { throw "Prueba de reversion ${emp}: falta la fila REVERSION." }
    $c = @($r[0] -split '\|' | ForEach-Object { $_.Trim() })
    $n = $Esperado[$emp].Alcance
    if ($c[1] -ne $emp -or [int]$c[2] -ne $n -or [int]$c[3] -ne $n -or [int]$c[4] -ne 0) {
        throw "Prueba de reversion ${emp}: respaldadas/revertibles/editadas = $($c[2])/$($c[3])/$($c[4]); esperado $n/$n/0."
    }
}

# ---- Prueba PREVIA al COMMIT del SQL 03: debe parsear y su guarda (sin respaldo -> error 50202) debe funcionar ----
function Test-Rollback03Previo {
    $emp = 'FARET'
    $a = $script:ArgsBase + @('-v', "Empresa=$emp", 'DryRun=1', '-i', $script:Sql03)
    Assert-ArgsSql03Dry $a $emp
    $o = Join-Path $script:Wd 'rollback03_previo.out.txt'; $e = Join-Path $script:Wd 'rollback03_previo.err.txt'
    $rc = Invoke-SqlcmdExe $a $o $e
    $txt = (Leer $o) + (Leer $e)
    if ($rc -ne 0) {
        if ($txt -match '50202' -or $txt -match 'No existe la tabla de respaldo') { return }
        throw "Prueba previa del SQL 03: fallo inesperado (exit=$rc): $txt"
    }
    if ($txt -cmatch 'REVERTIDO') { throw 'ALERTA: la prueba previa del SQL 03 indica REVERTIDO.' }
    if ($txt -cnotmatch 'SIMULACRO') { throw 'Prueba previa del SQL 03: no se confirmo el ROLLBACK.' }
    if ($txt -notmatch 'REVERSION\s*\|\s*FARET\s*\|\s*0\s*\|\s*0\s*\|\s*0') { throw 'Prueba previa del SQL 03: resultado inesperado con respaldo vacio.' }
}

# ---- Estado real (best effort) para el informe de fallo parcial ----
function Get-EstadoReal {
    try {
        $t = Invoke-SqlTexto 'estado_final' @"
SET NOCOUNT ON;
IF OBJECT_ID(N'dbo.nc_tipo_desviacion_migracion', N'U') IS NULL
    SELECT 'EST' AS k, 'SIN TABLA DE RESPALDO' AS empresa, 0 AS filas;
ELSE
    SELECT 'EST' AS k, empresa, COUNT(*) AS filas FROM dbo.nc_tipo_desviacion_migracion WHERE lote = N'$Lote' GROUP BY empresa;
"@
        (($t -split "`r?`n") | Where-Object { $_ -match '^\s*EST\s*\|' }) -join '; '
    } catch { "no se pudo consultar el estado real: $($_.Exception.Message)" }
}

# ----------------------------- Ejecucion -----------------------------
if (-not $PSScriptRoot) { throw 'Ejecute este archivo con -File; no se puede pegar en la consola.' }
if (-not [Environment]::UserInteractive) { throw 'Se requiere una sesion interactiva para la autorizacion escrita.' }
if ([Console]::IsInputRedirected) { throw 'La entrada esta redirigida (stdin/pipe): la autorizacion debe teclearse en una consola interactiva.' }
$raiz  = Split-Path $PSScriptRoot -Parent
$script:Sql02 = Join-Path $raiz 'sql\02_migracion_tipos_desviacion.sql'
$script:Sql03 = Join-Path $raiz 'sql\03_rollback_migracion_tipos_desviacion.sql'
$script:Wd = Join-Path $env:USERPROFILE ('Desktop\nci_migracion_' + (Get-Date -Format 'yyyyMMdd_HHmmss'))
New-Item -ItemType Directory -Path $script:Wd | Out-Null
$script:Resumen = Join-Path $script:Wd 'resumen.txt'
$script:AutorizacionConfirmada = $false
$script:Autorizado = $null
$script:Estado = [ordered]@{ FARET = 'NO EJECUTADO'; INNPACK = 'NO EJECUTADO' }
$script:SqlcmdExe = $null
$script:ArgsBase = $null
Start-Transcript -Path (Join-Path $script:Wd 'transcripcion.txt') | Out-Null
$codigoFinal = 1

try {
    Linea "Migracion definitiva NC Internas - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') - Evidencia: $script:Wd"

    # 1) sqlcmd, identidad, base, huellas
    $script:SqlcmdExe = (Get-Command sqlcmd -ErrorAction Stop | Select-Object -First 1).Source
    Linea "sqlcmd: $script:SqlcmdExe"
    foreach ($par in @(@($script:Sql02, $HashSql02), @($script:Sql03, $HashSql03))) {
        if (-not (Test-Path $par[0])) { throw "No existe: $($par[0])" }
        $h = Get-HashNormalizado $par[0]
        if ($h -ne $par[1]) { throw "El archivo $(Split-Path $par[0] -Leaf) no coincide con la version revisada (SHA-256 $h)." }
        Linea "OK  Integridad $(Split-Path $par[0] -Leaf): $h"
    }
    Linea "Huella de este script: $((Get-FileHash $PSCommandPath -Algorithm SHA256).Hash)"

    $script:ArgsBase = @('-S', $Servidor, '-d', $Base, '-E', '-b', '-W', '-s', '|')
    $t = Invoke-SqlTexto 'identidad' "SET NOCOUNT ON; SELECT 'USR=' + SUSER_SNAME() + ';DB=' + DB_NAME() AS ctx;"
    $m = [regex]::Match($t, 'USR=([^;\r\n]+);DB=(\S+)')
    if (-not $m.Success) { throw 'No se pudo leer la identidad SQL.' }
    if ($m.Groups[1].Value.Trim() -ine $UsuarioEsperado) { throw "Usuario SQL '$($m.Groups[1].Value)' distinto de '$UsuarioEsperado'. No se continua." }
    if ($m.Groups[2].Value.Trim() -ine $Base) { throw "Base '$($m.Groups[2].Value)' distinta de '$Base'." }
    Linea "OK  Conectado como $($m.Groups[1].Value) en $($m.Groups[2].Value)"

    # 2) Precondicion: sin respaldo previo de este lote
    $t = Invoke-SqlTexto 'precondicion' @"
SET NOCOUNT ON;
IF OBJECT_ID(N'dbo.nc_tipo_desviacion_migracion', N'U') IS NULL
    SELECT 'BKP' AS k, 'NOEXISTE' AS estado, 0 AS filas;
ELSE
    SELECT 'BKP' AS k, 'EXISTE' AS estado, COUNT(*) AS filas FROM dbo.nc_tipo_desviacion_migracion WHERE lote = N'$Lote';
"@
    $b = [regex]::Match($t, '(?m)^\s*BKP\s*\|\s*(\w+)\s*\|\s*(\d+)')
    if (-not $b.Success) { throw 'No se pudo leer el estado del respaldo.' }
    if ([int]$b.Groups[2].Value -ne 0) { throw "Ya existen $($b.Groups[2].Value) filas de respaldo de este lote: la migracion ya se aplico (total o parcial). No se continua." }
    Linea "OK  Precondicion: sin respaldo previo del lote ($($b.Groups[1].Value))"

    # Fotografia por fila R0 (solo lectura)
    $r0 = Get-RowHash 'R0_inicial'
    Linea "OK  Fotografia R0 por fila tomada: $($r0.Count) filas de no_conformidades"

    # 3) COMPUERTA: DryRun de ambas empresas (ROLLBACK) y base identica
    foreach ($emp in @('FARET', 'INNPACK')) {
        Invoke-Sql02 $emp '1'
        Linea "OK  Compuerta DryRun ${emp}: ROLLBACK confirmado, alcance exacto $($Esperado[$emp].Alcance)"
    }
    $r1 = Get-RowHash 'R1_tras_dryrun'
    Assert-Cambios $r0 $r1 @() 'Compuerta DryRun'
    Linea 'OK  Compuerta: la base quedo identica tras los DryRun (R1 = R0)'
    Test-Rollback03Previo
    Linea 'OK  Compuerta: el SQL 03 (reversion) parsea y su guarda funciona (aun sin respaldo)'

    # 4) AUTORIZACION ESCRITA
    Write-Host ''
    Write-Host '=================================================================' -ForegroundColor Yellow
    Write-Host ' ATENCION: se va a MODIFICAR PRODUCCION (calidad_db.dbo.no_conformidades)' -ForegroundColor Yellow
    Write-Host '   FARET  : 46 registros  |  INNPACK: 23 registros  |  Total: 69' -ForegroundColor Yellow
    Write-Host '   Solo cambia categoria_defecto; respaldo por id; COMMIT por empresa (FARET primero).' -ForegroundColor Yellow
    Write-Host '=================================================================' -ForegroundColor Yellow
    $f = Read-Host "Para autorizar escriba exactamente:  $FraseAutoriza   (cualquier otra cosa cancela)"
    if ($f -cne $FraseAutoriza) { throw 'Autorizacion NO otorgada. No se modifico nada.' }
    $nombre = (Read-Host 'Nombre de quien autoriza, SIN espacios (3 a 60 caracteres; letras, numeros . _ -; ej: DCarrasco)').Trim()
    if ($nombre -notmatch '^[\p{L}0-9][\p{L}0-9._-]{2,59}$' -or $nombre -ieq 'NINGUNO') { throw 'Nombre de autorizacion invalido. No se modifico nada.' }
    $script:Autorizado = $nombre
    $script:AutorizacionConfirmada = $true
    Linea "AUTORIZACION otorgada por: $nombre  ($(Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))"

    # Linea base inmediatamente antes de aplicar; si alguien edito NC durante la espera, se detiene SIN modificar nada
    $lineaBase = Get-RowHash 'R2_pre_aplicacion'
    Assert-Cambios $r1 $lineaBase @() 'Entre la compuerta y la aplicacion (alguien modifico datos)'
    Linea 'OK  Linea base R2 tomada justo antes de aplicar (sin cambios desde la compuerta)'

    # 5) FARET -> verificacion -> prueba de reversion. Si falla, INNPACK NO se ejecuta.
    $idsAplicados = @()
    $anterior = $lineaBase
    foreach ($emp in @('FARET', 'INNPACK')) {
        $script:Estado[$emp] = 'AUTORIZADO, AUN NO ENVIADO A SQL (no se modifico nada)'
        Linea ''
        Linea "---- Aplicando $emp ($($Esperado[$emp].Alcance) registros) ----"
        Invoke-Sql02 $emp '0'
        $script:Estado[$emp] = 'COMMIT REALIZADO - verificacion pendiente'
        Linea "OK  $emp : COMMIT realizado con el SQL 02"

        $ids = Get-Post $emp
        $idsAplicados += $ids
        $null = Invoke-SqlTexto "respaldo_copia_$emp" "SET NOCOUNT ON; SELECT nc_id, empresa, categoria_anterior, categoria_nueva, eliminado, lote, autorizado_por, fecha FROM dbo.nc_tipo_desviacion_migracion WHERE lote = N'$Lote' AND empresa = '$emp' ORDER BY nc_id;"
        Linea "OK  $emp : respaldo persistido ($($ids.Count) filas), destino correcto en $($ids.Count), 0 con nombre antiguo, total/eliminadas intactos"

        $r = Get-RowHash "R_tras_$emp"
        Assert-Cambios $anterior $r $ids "Verificacion $emp"
        Linea "OK  $emp : solo cambio categoria_defecto en exactamente $($ids.Count) filas; ninguna otra columna ni fila cambio"
        $anterior = $r

        Test-Rollback03 $emp
        Linea "OK  $emp : prueba de reversion (SQL 03, DryRun) restauraria $($ids.Count) filas, 0 editadas despues"
        $r2 = Get-RowHash "R_tras_rollback_dryrun_$emp"
        Assert-Cambios $anterior $r2 @() "Prueba de reversion $emp"
        $script:Estado[$emp] = 'APLICADO Y VERIFICADO'
    }

    # 6) Verificacion final: exactamente 69 filas respaldadas/cambiadas respecto de la linea base
    $rf = Get-RowHash 'R_final'
    Assert-Cambios $lineaBase $rf $idsAplicados 'Verificacion final'
    Linea "OK  Final: $($idsAplicados.Count) filas con categoria cambiada respecto de la linea base; ninguna otra columna ni fila cambio"
    Linea ''
    Linea ("PASS: migracion aplicada y verificada. FARET 46 + INNPACK 23 = 69 registros. Respaldo persistido en dbo.nc_tipo_desviacion_migracion (lote $Lote).")
    $codigoFinal = 0
}
catch {
    Linea ''
    Linea "FAIL: $($_.Exception.Message)"
    Linea 'EJECUCION DETENIDA. No se intenta ninguna reversion automatica.'
    Linea "Estado por empresa segun este script: FARET = $($script:Estado['FARET']) ; INNPACK = $($script:Estado['INNPACK'])"
    if ($script:SqlcmdExe -and $script:ArgsBase) { Linea "Estado real del respaldo en la base: $(Get-EstadoReal)" }
    if (($script:Estado.Values | Where-Object { $_ -match '^(ENVIADO|COMMIT|APLICADO Y)' }).Count -gt 0) {
        Linea 'ESTADO POSIBLEMENTE PARCIAL: revisar la evidencia. Reversion (solo con autorizacion): sql\03_rollback_migracion_tipos_desviacion.sql, una empresa por vez, primero con DryRun=1.'
    }
}
finally {
    Linea "Evidencia guardada en: $script:Wd"
    Stop-Transcript | Out-Null
    # Manifiesto SHA-256 de toda la evidencia + scripts usados
    $man = Join-Path $script:Wd 'manifiesto_sha256.txt'
    $lista = @(Get-ChildItem $script:Wd -File | Where-Object { $_.Name -ne 'manifiesto_sha256.txt' })
    foreach ($x in @($script:Sql02, $script:Sql03, $PSCommandPath)) { if ($x -and (Test-Path $x)) { $lista += Get-Item $x } }
    $lista | Get-FileHash -Algorithm SHA256 | ForEach-Object { "$($_.Hash)  $($_.Path)" } | Set-Content -Path $man -Encoding ASCII
}
exit $codigoFinal
