<#
.SYNOPSIS
  Verificacion de SOLO LECTURA del estado real de la migracion de tipos de desviacion de NC Internas.

.DESCRIPTION
  No modifica nada: solo SELECT (se valida estaticamente cada consulta antes de enviarla). No usa los SQL 02/03,
  no usa -v, no hay DryRun ni COMMIT. Debe ejecutarse con la sesion AD\Administrador (sqlcmd -E).

  Muestra: servidor/base/usuario conectados, existencia de la tabla de respaldo, filas respaldadas por empresa,
  cantidades actuales de las 5 categorias antiguas y las 5 nuevas por empresa, y si el estado coincide con
  "intacta" (antes de migrar) o "aplicada" (despues de migrar). Ademas compara fila por fila la base actual con
  las fotografias R0 y R2 de la ejecucion fallida (si la carpeta de evidencia es legible).

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\verificar_estado_nci.ps1
#>
[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ----------------------------- Constantes (fijas) -----------------------------
$Servidor         = '192.168.1.230'
$BaseDatos        = 'calidad_db'
$UsuarioEsperado  = 'AD\Administrador'
$LoteNombre       = 'Consolidacion tipos NC Internas 2026-10-28'
$CarpetaEvidencia = 'C:\Users\administrador\Desktop\nci_migracion_20261028_172005'

# Estado esperado por grupo (V = nombre antiguo, N = nombre nuevo). Incluye eliminadas. Grupos ausentes = 0.
$EstadoIntacto = @{
    FARET   = @{ V1 = 12; V2 = 5; V3 = 11; V4 = 3; V5 = 15; N1 = 18; N2 = 1; N3 = 3; N4 = 2; N5 = 2 }
    INNPACK = @{ V1 = 10; V2 = 1; V3 = 6;  V4 = 1; V5 = 5;  N1 = 0;  N2 = 0; N3 = 0; N4 = 0; N5 = 0 }
}
$EstadoAplicado = @{
    FARET   = @{ V1 = 0; V2 = 0; V3 = 0; V4 = 0; V5 = 0; N1 = 30; N2 = 6; N3 = 14; N4 = 5; N5 = 17 }
    INNPACK = @{ V1 = 0; V2 = 0; V3 = 0; V4 = 0; V5 = 0; N1 = 10; N2 = 1; N3 = 6;  N4 = 1; N5 = 5 }
}
$TotalesEsperados = @{ FARET = @(129, 2); INNPACK = @(36, 0) }

# ----------------------------- Utilidades -----------------------------
function Q([string]$s) { '"' + ($s -replace '"', '\"') + '"' }
function Leer([string]$ruta) { if (Test-Path $ruta) { (Get-Content $ruta -Raw -Encoding UTF8) } else { '' } }
function Linea([string]$t) { Write-Host $t; Add-Content -Path $script:Resumen -Value $t -Encoding UTF8 }

function Assert-ArgsSeguros([string[]]$a) {
    foreach ($prohibido in @('-f', '-U', '-P', '-v', '-Q')) { if ($a -contains $prohibido) { throw "Argumentos invalidos: $prohibido no esta permitido en esta verificacion." } }
    foreach ($requerido in @('-E', '-b', '-i')) { if ($a -notcontains $requerido) { throw "Argumentos invalidos: falta $requerido." } }
    $i = [array]::IndexOf($a, '-S'); if ($i -lt 0 -or $a[$i + 1] -ne $Servidor)  { throw 'Argumentos invalidos: servidor distinto del esperado.' }
    $i = [array]::IndexOf($a, '-d'); if ($i -lt 0 -or $a[$i + 1] -ne $BaseDatos) { throw 'Argumentos invalidos: base distinta de la esperada.' }
}

# Cada consulta se revisa antes de enviarla: ninguna escritura/DDL; EXEC solo para sp_executesql (consulta de lectura fija)
function Assert-SoloLectura([string]$sql, [bool]$permiteExec) {
    if ($sql -match '(?i)\b(INSERT|UPDATE|DELETE|MERGE|ALTER|CREATE|DROP|TRUNCATE|GRANT|REVOKE|BACKUP|RESTORE|SHUTDOWN|KILL|COMMIT|ROLLBACK|BEGIN\s+TRAN)\b') { throw 'Consulta rechazada: contiene una palabra de escritura/DDL/transaccion.' }
    if (-not $permiteExec -and $sql -match '(?i)\bEXEC(UTE)?\b') { throw 'Consulta rechazada: contiene EXEC.' }
}

function Invoke-SqlcmdExe([string[]]$Argumentos, [string]$Salida, [string]$Errores) {
    $linea = (($Argumentos | ForEach-Object { Q $_ }) -join ' ')
    $p = Start-Process -FilePath $script:SqlcmdExe -ArgumentList $linea -NoNewWindow -PassThru `
         -RedirectStandardOutput $Salida -RedirectStandardError $Errores
    $null = $p.Handle
    $p.WaitForExit()
    return [int]$p.ExitCode
}

function Invoke-ConsultaLectura([string]$Nombre, [string]$Texto, [bool]$PermiteExec = $false) {
    Assert-SoloLectura $Texto $PermiteExec
    $f = Join-Path $script:Wd "$Nombre.sql"
    Set-Content -Path $f -Value $Texto -Encoding ASCII
    $a = $script:ArgsConexion + @('-i', $f)
    Assert-ArgsSeguros $a
    $o = Join-Path $script:Wd "$Nombre.out.txt"; $e = Join-Path $script:Wd "$Nombre.err.txt"
    $rc = Invoke-SqlcmdExe $a $o $e
    $t = Leer $o
    if ($rc -ne 0) { throw "sqlcmd fallo en '$Nombre' (exit=$rc): $(Leer $e) $t" }
    if ($t -match '(?im)^\s*(Msg \d+|mssql:|Sqlcmd:)') { throw "Errores SQL en '$Nombre'. Ver $o" }
    return $t
}

# Fotografia por fila (mismo formato que la de aplicar_migracion_nci.ps1): id | huella sin categoria | categoria
$SqlFilas = @'
SET NOCOUNT ON;
DECLARE @cols NVARCHAR(MAX) = STUFF((SELECT ', ' + QUOTENAME(COLUMN_NAME)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'no_conformidades' AND COLUMN_NAME <> 'categoria_defecto'
      AND DATA_TYPE NOT IN ('text', 'ntext', 'image', 'xml', 'timestamp')
    ORDER BY ORDINAL_POSITION FOR XML PATH('')), 1, 2, '');
DECLARE @q NVARCHAR(MAX) = N'SELECT id, BINARY_CHECKSUM(' + @cols + N') AS h, categoria_defecto FROM dbo.no_conformidades ORDER BY id';
EXEC sp_executesql @q;
'@

function Read-Filas([string]$texto) {
    $d = @{}
    foreach ($l in ($texto -split "`r?`n")) {
        if ($l -match '^\s*(\d+)\s*\|\s*(-?\d+)\s*\|(.*)$') { $d[[int]$Matches[1]] = @{ H = $Matches[2]; Cat = $Matches[3].Trim() } }
    }
    return $d
}

function Compare-Filas($referencia, $actual) {
    $catCambiada = 0; $otroCambiado = 0; $faltantes = 0
    foreach ($id in @($referencia.Keys)) {
        if (-not $actual.ContainsKey($id)) { $faltantes++; continue }
        if ($referencia[$id].H -ne $actual[$id].H) { $otroCambiado++ }
        if ($referencia[$id].Cat -ne $actual[$id].Cat) { $catCambiada++ }
    }
    $nuevas = 0; foreach ($id in @($actual.Keys)) { if (-not $referencia.ContainsKey($id)) { $nuevas++ } }
    return [pscustomobject]@{ FilasReferencia = $referencia.Count; FilasActuales = $actual.Count; CategoriaCambiada = $catCambiada
                              OtraColumnaCambiada = $otroCambiado; FilasFaltantes = $faltantes; FilasNuevas = $nuevas }
}

# ----------------------------- Ejecucion -----------------------------
$script:Wd = Join-Path $env:USERPROFILE ('Desktop\nci_verificacion_' + (Get-Date -Format 'yyyyMMdd_HHmmss'))
New-Item -ItemType Directory -Path $script:Wd | Out-Null
$script:Resumen = Join-Path $script:Wd 'resumen.txt'
$script:SqlcmdExe = $null
$script:ArgsConexion = $null
$codigoFinal = 1

try {
    Linea "Verificacion de SOLO LECTURA - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') - Evidencia: $script:Wd"
    $script:SqlcmdExe = (Get-Command sqlcmd -ErrorAction Stop | Select-Object -First 1).Source
    $script:ArgsConexion = @('-S', $Servidor, '-d', $BaseDatos, '-E', '-b', '-W', '-s', '|')

    # 1) Servidor, base y usuario conectados
    $t = Invoke-ConsultaLectura 'v1_contexto' "SET NOCOUNT ON; SELECT 'CTX' AS k, @@SERVERNAME AS servidor, DB_NAME() AS base, SUSER_SNAME() AS usuario;"
    $m = [regex]::Match($t, '(?m)^\s*CTX\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*(.+?)\s*$')
    if (-not $m.Success) { throw 'No se pudo leer el contexto de conexion.' }
    Linea "Conectado a: servidor SQL '$($m.Groups[1].Value)' (por $Servidor), base '$($m.Groups[2].Value)', usuario '$($m.Groups[3].Value)'"
    if ($m.Groups[3].Value -ine $UsuarioEsperado) { throw "Usuario '$($m.Groups[3].Value)' distinto de '$UsuarioEsperado'. Ejecutar con AD\Administrador." }
    if ($m.Groups[2].Value -ine $BaseDatos) { throw "Base '$($m.Groups[2].Value)' distinta de '$BaseDatos'." }

    # 2) Tabla de respaldo y filas respaldadas por empresa
    $t = Invoke-ConsultaLectura 'v2_respaldo' @"
SET NOCOUNT ON;
IF OBJECT_ID(N'dbo.nc_tipo_desviacion_migracion', N'U') IS NULL
BEGIN
    SELECT 'BKP' AS k, 'SIN TABLA' AS empresa, 0 AS filas;
END
ELSE
BEGIN
    SELECT 'BKP' AS k, empresa, COUNT(*) AS filas FROM dbo.nc_tipo_desviacion_migracion WHERE lote = N'$LoteNombre' GROUP BY empresa;
    SELECT 'BKPTOTAL' AS k, 'TODOS LOS LOTES' AS empresa, COUNT(*) AS filas FROM dbo.nc_tipo_desviacion_migracion;
END
"@
    $respaldo = @{}
    $sinTabla = $false
    foreach ($l in ($t -split "`r?`n")) {
        if ($l -match '^\s*BKP\s*\|\s*SIN TABLA') { $sinTabla = $true }
        elseif ($l -match '^\s*BKP\s*\|\s*(\w+)\s*\|\s*(\d+)') { $respaldo[$Matches[1]] = [int]$Matches[2] }
    }
    if ($sinTabla) { Linea 'Tabla de respaldo dbo.nc_tipo_desviacion_migracion: NO EXISTE' }
    else {
        Linea 'Tabla de respaldo dbo.nc_tipo_desviacion_migracion: EXISTE'
        foreach ($emp in @('FARET', 'INNPACK')) {
            $n = if ($respaldo.ContainsKey($emp)) { $respaldo[$emp] } else { 0 }
            Linea "  Filas respaldadas del lote '$LoteNombre' para ${emp}: $n"
        }
    }
    $hayRespaldo = (-not $sinTabla) -and (($respaldo.Values | Measure-Object -Sum).Sum -gt 0)

    # 3) Cantidades actuales: 5 categorias antiguas (V) y 5 nuevas (N), por empresa. Incluye eliminadas.
    $t = Invoke-ConsultaLectura 'v3_categorias' @'
SET NOCOUNT ON;
SELECT 'CAT' AS k, COALESCE(empresa, 'INNPACK') AS empresa, grupo, COUNT(*) AS n, SUM(CASE WHEN eliminado <> 0 THEN 1 ELSE 0 END) AS elim
FROM (SELECT empresa, eliminado,
        CASE
          WHEN categoria_defecto LIKE N'C%digo SAP / arte incorrecto'          THEN 'V1'
          WHEN categoria_defecto LIKE N'Informaci%n incompleta en carpeta'     THEN 'V2'
          WHEN categoria_defecto LIKE N'Barniz / Folia / Serigraf%a'           THEN 'V3'
          WHEN categoria_defecto LIKE N'Cambio de m%quina / Planificaci%n'     THEN 'V4'
          WHEN categoria_defecto LIKE N'Troquel / MFG no coincide'             THEN 'V5'
          WHEN categoria_defecto LIKE N'C%digo SAP/Perfil'                     THEN 'N1'
          WHEN categoria_defecto LIKE N'Informaci%n incompleta en la carpeta'  THEN 'N2'
          WHEN categoria_defecto LIKE N'Barniz/Folia/Serigraf%a'               THEN 'N3'
          WHEN categoria_defecto LIKE N'Cambio de m%quina/planificaci%n'       THEN 'N4'
          WHEN categoria_defecto LIKE N'Troquel/MFG'                           THEN 'N5'
        END AS grupo
      FROM dbo.no_conformidades WHERE ambito = N'INTERNA') t
WHERE grupo IS NOT NULL
GROUP BY COALESCE(empresa, 'INNPACK'), grupo;
SELECT 'TOT' AS k, COALESCE(empresa, 'INNPACK') AS empresa, COUNT(*) AS total, SUM(CASE WHEN eliminado <> 0 THEN 1 ELSE 0 END) AS elim
FROM dbo.no_conformidades WHERE ambito = N'INTERNA' GROUP BY COALESCE(empresa, 'INNPACK');
'@
    $actual = @{ FARET = @{}; INNPACK = @{} }
    $totales = @{}
    foreach ($l in ($t -split "`r?`n")) {
        if ($l -match '^\s*CAT\s*\|\s*(FARET|INNPACK)\s*\|\s*(V[1-5]|N[1-5])\s*\|\s*(\d+)') { $actual[$Matches[1]][$Matches[2]] = [int]$Matches[3] }
        elseif ($l -match '^\s*TOT\s*\|\s*(FARET|INNPACK)\s*\|\s*(\d+)\s*\|\s*(\d+)') { $totales[$Matches[1]] = @([int]$Matches[2], [int]$Matches[3]) }
    }
    $nombres = [ordered]@{ V1 = 'ANTIGUA Codigo SAP / arte incorrecto'; V2 = 'ANTIGUA Informacion incompleta en carpeta'; V3 = 'ANTIGUA Barniz / Folia / Serigrafia'
                           V4 = 'ANTIGUA Cambio de maquina / Planificacion'; V5 = 'ANTIGUA Troquel / MFG no coincide'
                           N1 = 'NUEVA   Codigo SAP/Perfil'; N2 = 'NUEVA   Informacion incompleta en la carpeta'; N3 = 'NUEVA   Barniz/Folia/Serigrafia'
                           N4 = 'NUEVA   Cambio de maquina/planificacion'; N5 = 'NUEVA   Troquel/MFG' }
    $veredicto = @{}
    foreach ($emp in @('FARET', 'INNPACK')) {
        Linea ''
        Linea "== $emp : cantidades actuales (incluye eliminadas) ==  [antes de migrar | despues de migrar]"
        $coincideIntacto = $true; $coincideAplicado = $true
        foreach ($g in $nombres.Keys) {
            $v = if ($actual[$emp].ContainsKey($g)) { $actual[$emp][$g] } else { 0 }
            Linea ('  {0}  {1,-45} actual={2,3}   [{3,3} | {4,3}]' -f $g, $nombres[$g], $v, $EstadoIntacto[$emp][$g], $EstadoAplicado[$emp][$g])
            if ($v -ne $EstadoIntacto[$emp][$g])  { $coincideIntacto = $false }
            if ($v -ne $EstadoAplicado[$emp][$g]) { $coincideAplicado = $false }
        }
        $tot = if ($totales.ContainsKey($emp)) { $totales[$emp] } else { @(-1, -1) }
        $totOk = ($tot[0] -eq $TotalesEsperados[$emp][0] -and $tot[1] -eq $TotalesEsperados[$emp][1])
        Linea "  Total NC internas / eliminadas: $($tot[0]) / $($tot[1])   (esperado $($TotalesEsperados[$emp][0]) / $($TotalesEsperados[$emp][1]))  -> $(if ($totOk) { 'OK' } else { 'DIFERENTE' })"
        $veredicto[$emp] = if ($coincideIntacto -and $totOk) { 'INTACTA (igual a antes de migrar)' }
                           elseif ($coincideAplicado -and $totOk) { 'APLICADA (igual a despues de migrar)' }
                           else { 'ESTADO INESPERADO / PARCIAL' }
    }

    # 4) Comparacion fila por fila con las fotografias R0 y R2 de la ejecucion fallida (si son legibles)
    $t = Invoke-ConsultaLectura 'v4_filas_actuales' $SqlFilas $true
    $filasActual = Read-Filas $t
    if ($filasActual.Count -lt 1) { throw 'Fotografia actual por fila vacia o ilegible.' }
    Linea ''
    Linea "== Comparacion fila por fila (filas actuales: $($filasActual.Count)) =="
    foreach ($par in @(@('R0 inicial', 'rowhash_R0_inicial.out.txt'), @('R2 justo antes de aplicar', 'rowhash_R2_pre_aplicacion.out.txt'))) {
        $ruta = Join-Path $CarpetaEvidencia $par[1]
        if (-not (Test-Path $ruta)) { Linea "  $($par[0]): archivo no encontrado ($ruta)"; continue }
        $ref = Read-Filas (Leer $ruta)
        if ($ref.Count -lt 1) { Linea "  $($par[0]): archivo ilegible"; continue }
        $c = Compare-Filas $ref $filasActual
        Linea ("  vs {0}: filas ref={1} actuales={2} | categoria cambiada={3} | otra columna cambiada={4} | faltantes={5} | nuevas={6}" -f `
               $par[0], $c.FilasReferencia, $c.FilasActuales, $c.CategoriaCambiada, $c.OtraColumnaCambiada, $c.FilasFaltantes, $c.FilasNuevas)
    }

    # 5) Rastros en la carpeta de evidencia de la ejecucion fallida
    Linea ''
    Linea "== Evidencia de la ejecucion fallida: $CarpetaEvidencia =="
    foreach ($nombre in @('aplicar_FARET.out.txt', 'post_FARET.out.txt', 'rowhash_R_tras_FARET.out.txt', 'aplicar_INNPACK.out.txt')) {
        $existe = Test-Path (Join-Path $CarpetaEvidencia $nombre)
        Linea ("  {0,-34} {1}" -f $nombre, $(if ($existe) { 'EXISTE (se llego a enviar SQL)' } else { 'no existe' }))
    }

    # 6) Veredicto
    Linea ''
    Linea '================ DIAGNOSTICO ================'
    foreach ($emp in @('FARET', 'INNPACK')) { Linea "  ${emp}: $($veredicto[$emp])" }
    Linea "  Respaldo: $(if ($hayRespaldo) { 'HAY filas respaldadas (hubo COMMIT)' } elseif ($sinTabla) { 'sin tabla de respaldo' } else { 'tabla vacia para este lote' })"
    if ($veredicto['FARET'] -like 'INTACTA*' -and $veredicto['INNPACK'] -like 'INTACTA*' -and -not $hayRespaldo) {
        Linea '  CONCLUSION: produccion INTACTA. No hubo COMMIT ni cambios.'
    } else {
        Linea '  CONCLUSION: REVISAR. El estado no coincide con "intacta" en todos los puntos: no ejecutar nada y enviar este resumen.'
    }
    $codigoFinal = 0
}
catch {
    Linea ''
    Linea "ERROR EN LA VERIFICACION: $($_.Exception.Message)"
}
finally {
    Linea "Evidencia guardada en: $script:Wd"
}
exit $codigoFinal
