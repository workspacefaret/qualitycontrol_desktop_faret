<#
.SYNOPSIS
  Validacion (DryRun) de la consolidacion de tipos de desviacion de NC Internas (FARET e INNPACK).

.DESCRIPTION
  Ejecuta, contra calidad_db, el script sql\02_migracion_tipos_desviacion.sql en modo DryRun=1
  (transaccion con ROLLBACK) una empresa por vez, y comprueba que la base quede identica.
  NO tiene parametros: DryRun=1 y Autorizado=NINGUNO estan fijos en este archivo y no se pueden
  cambiar desde afuera. No existe ninguna ruta de este script que lleve a un COMMIT.
  Debe ejecutarse con la sesion de Windows AD\Administrador (autenticacion integrada, sqlcmd -E).

  Pasos: identidad -> integridad del SQL 02 -> fotografia 1 (solo lectura) -> DryRun FARET ->
         DryRun INNPACK -> fotografia 2 -> comparacion -> PASS / FAIL.
  Evidencia: Escritorio\nci_dryrun_<fecha>\  (salidas, errores, fotografias, resumen, transcripcion)

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\validar_migracion_nci.ps1
#>
[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ----------------------------- Constantes (fijas) -----------------------------
$Servidor        = '192.168.1.230'
$Base            = 'calidad_db'
$UsuarioEsperado = 'AD\Administrador'
# SHA-256 del archivo 02 con los retornos de carro (CR) quitados, para tolerar CRLF/LF
$HashSql02       = '0F57AEDD6F6E0A574B2C34D65B52BB3EC907C3835CA7BBE11441B22C00B51FB3'
$DryRunValor     = '1'
$AutorizadoValor = 'NINGUNO'

# Resultados esperados por empresa. 'Por' = fragmento (solo ASCII) del nombre antiguo -> filas a migrar
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

# Reglas de seguridad sobre los argumentos de sqlcmd: autenticacion Windows, sin -f, abortar ante error
function Assert-ArgsBase([string[]]$a) {
    if ($a -contains '-f')  { throw 'Argumentos invalidos: -f no esta permitido.' }
    if ($a -contains '-U' -or $a -contains '-P') { throw 'Argumentos invalidos: solo autenticacion Windows (-E).' }
    if ($a -notcontains '-E') { throw 'Argumentos invalidos: falta -E.' }
    if ($a -notcontains '-b') { throw 'Argumentos invalidos: falta -b (abortar ante error).' }
    $i = [array]::IndexOf($a, '-S'); if ($i -lt 0 -or $a[$i + 1] -ne $Servidor) { throw 'Argumentos invalidos: servidor distinto del esperado.' }
    $i = [array]::IndexOf($a, '-d'); if ($i -lt 0 -or $a[$i + 1] -ne $Base)     { throw 'Argumentos invalidos: base distinta de la esperada.' }
}

function Assert-ArgsDryRun([string[]]$a, [string]$empresa) {
    Assert-ArgsBase $a
    $v = [array]::IndexOf($a, '-v')
    if ($v -lt 0) { throw 'Argumentos invalidos: falta -v.' }
    if (@($a | Where-Object { $_ -eq '-v' }).Count -ne 1) { throw 'Argumentos invalidos: -v debe aparecer una sola vez.' }
    if ($a[$v + 1] -ne "Empresa=$empresa" -or $a[$v + 2] -ne "DryRun=$DryRunValor" -or $a[$v + 3] -ne "Autorizado=$AutorizadoValor") {
        throw 'Argumentos invalidos: -v debe ser exactamente Empresa=<empresa> DryRun=1 Autorizado=NINGUNO.'
    }
    if (@($a | Where-Object { $_ -like 'DryRun=*' -and $_ -ne 'DryRun=1' }).Count -gt 0) { throw 'Argumentos invalidos: DryRun distinto de 1.' }
    if (@($a | Where-Object { $_ -like 'Autorizado=*' -and $_ -ne 'Autorizado=NINGUNO' }).Count -gt 0) { throw 'Argumentos invalidos: Autorizado distinto de NINGUNO.' }
    if ($empresa -notin @('FARET', 'INNPACK')) { throw 'Empresa invalida.' }
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

function Leer([string]$ruta) { if (Test-Path $ruta) { (Get-Content $ruta -Raw -Encoding UTF8) } else { '' } }
function Linea([string]$t) { Write-Host $t; Add-Content -Path $script:Resumen -Value $t -Encoding UTF8 }

# ----------------------------- Ejecucion -----------------------------
if (-not $PSScriptRoot) { throw 'Ejecute este archivo con -File; no se puede pegar en la consola.' }
$sql02 = Join-Path (Split-Path $PSScriptRoot -Parent) 'sql\02_migracion_tipos_desviacion.sql'
$wd    = Join-Path $env:USERPROFILE ('Desktop\nci_dryrun_' + (Get-Date -Format 'yyyyMMdd_HHmmss'))
New-Item -ItemType Directory -Path $wd | Out-Null
$script:Resumen = Join-Path $wd 'resumen.txt'
Start-Transcript -Path (Join-Path $wd 'transcripcion.txt') | Out-Null
$codigoFinal = 1

try {
    Linea "Validacion DryRun NC Internas - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') - Evidencia: $wd"

    # 0) sqlcmd disponible
    $script:SqlcmdExe = (Get-Command sqlcmd -ErrorAction Stop | Select-Object -First 1).Source
    Linea "sqlcmd: $script:SqlcmdExe"

    # 1) Integridad del archivo SQL 02
    if (-not (Test-Path $sql02)) { throw "No existe el archivo SQL 02: $sql02" }
    $h = Get-HashNormalizado $sql02
    if ($h -ne $HashSql02) { throw "El SQL 02 no coincide con la version revisada (SHA-256 $h). No se ejecuta." }
    Linea "OK  Integridad SQL 02 (SHA-256 sin CR): $h"

    # 2) Identidad y base: debe ser exactamente AD\Administrador en calidad_db
    $argsBase = @('-S', $Servidor, '-d', $Base, '-E', '-b', '-W', '-s', '|')
    $ctxQ = "SET NOCOUNT ON; SELECT 'USR=' + SUSER_SNAME() + ';DB=' + DB_NAME() AS ctx;"
    $a = $argsBase + @('-Q', $ctxQ); Assert-ArgsBase $a
    $o = Join-Path $wd 'identidad.txt'; $e = Join-Path $wd 'identidad.err.txt'
    $rc = Invoke-SqlcmdExe $a $o $e
    if ($rc -ne 0) { throw "No se pudo conectar (exit=$rc): $(Leer $e)" }
    $m = [regex]::Match((Leer $o), 'USR=([^;\r\n]+);DB=(\S+)')
    if (-not $m.Success) { throw 'No se pudo leer la identidad SQL.' }
    if ($m.Groups[1].Value.Trim() -ine $UsuarioEsperado) { throw "Usuario SQL conectado '$($m.Groups[1].Value)' distinto de '$UsuarioEsperado'. No se continua." }
    if ($m.Groups[2].Value.Trim() -ine $Base) { throw "Base conectada '$($m.Groups[2].Value)' distinta de '$Base'." }
    Linea "OK  Conectado como $($m.Groups[1].Value) en $($m.Groups[2].Value)"

    # 3) Fotografia 1 (solo lectura)
    $snapQ = "SET NOCOUNT ON; SELECT SUSER_SNAME() AS usuario, DB_NAME() AS base; SELECT CASE WHEN OBJECT_ID(N'dbo.nc_tipo_desviacion_migracion',N'U') IS NULL THEN 'NO EXISTE' ELSE 'EXISTE' END AS tabla_respaldo; SELECT COUNT(*) AS filas_tabla, CHECKSUM_AGG(BINARY_CHECKSUM(*)) AS huella_tabla FROM dbo.no_conformidades; SELECT COALESCE(empresa,'INNPACK') AS empresa, categoria_defecto, eliminado, COUNT(*) AS n FROM dbo.no_conformidades WHERE ambito='INTERNA' GROUP BY COALESCE(empresa,'INNPACK'), categoria_defecto, eliminado ORDER BY 1,2,3;"
    $snap1 = Join-Path $wd 'snap_1_antes.txt'
    $a = $argsBase + @('-Q', $snapQ); Assert-ArgsBase $a
    $rc = Invoke-SqlcmdExe $a $snap1 (Join-Path $wd 'snap_1_antes.err.txt')
    if ($rc -ne 0) { throw "Fotografia 1 fallo (exit=$rc): $(Leer (Join-Path $wd 'snap_1_antes.err.txt'))" }
    Linea 'OK  Fotografia 1 tomada (solo lectura)'

    # 4) DryRun por empresa (FARET y luego INNPACK); se detiene ante cualquier diferencia
    foreach ($emp in @('FARET', 'INNPACK')) {
        $esp = $Esperado[$emp]
        $a = $argsBase + @('-v', "Empresa=$emp", "DryRun=$DryRunValor", "Autorizado=$AutorizadoValor", '-i', $sql02)
        Assert-ArgsDryRun $a $emp
        $o = Join-Path $wd "dryrun_$emp.txt"; $e = Join-Path $wd "dryrun_$emp.err.txt"
        $rc = Invoke-SqlcmdExe $a $o $e
        $txt = Leer $o
        if ($rc -ne 0) { throw "DryRun $emp termino con error (exit=$rc): $(Leer $e) $txt" }
        if ($txt -match '(?im)^\s*(Msg \d+|mssql:|Sqlcmd:)') { throw "DryRun ${emp}: la salida contiene errores de SQL. Ver $o" }
        if ($txt -match 'APLICADO a ' -or $txt -match 'YA APLICADO') { throw "ALERTA: la salida de $emp indica que se aplico o ya estaba aplicado. DETENIDO." }
        if ($txt -notmatch 'SIMULACRO \(DryRun=1\)') { throw "DryRun ${emp}: no se confirmo el ROLLBACK (falta 'SIMULACRO (DryRun=1)')." }
        Linea "OK  DryRun $emp : ROLLBACK confirmado"

        # Alcance: 5 equivalencias, con las cantidades exactas
        $filas = @(($txt -split "`r?`n") | Where-Object { $_ -match '^\s*ALCANCE\s*\|' } | ForEach-Object { , @($_ -split '\|' | ForEach-Object { $_.Trim() }) })
        if ($filas.Count -ne 5) { throw "DryRun ${emp}: se esperaban 5 filas ALCANCE y hay $($filas.Count)." }
        $suma = 0
        foreach ($f in $filas) {
            if ($f.Count -lt 6 -or $f[1] -ne $emp) { throw "DryRun ${emp}: fila ALCANCE mal formada o de otra empresa." }
            $suma += [int]$f[4]
        }
        foreach ($frag in $esp.Por.Keys) {
            $coinc = @($filas | Where-Object { $_[2] -match [regex]::Escape($frag) })
            if ($coinc.Count -ne 1) { throw "DryRun ${emp}: equivalencia '$frag' encontrada $($coinc.Count) veces (se esperaba 1)." }
            if ([int]$coinc[0][4] -ne $esp.Por[$frag]) { throw "DryRun ${emp}: '$frag' afecta $($coinc[0][4]) y se esperaban $($esp.Por[$frag])." }
        }
        if ($suma -ne $esp.Alcance) { throw "DryRun ${emp}: alcance total $suma y se esperaban $($esp.Alcance)." }
        Linea "OK  DryRun $emp : alcance exacto = $suma registros ($(($esp.Por.Values) -join ' + '))"

        # CONTROL: total, eliminadas, alcance, respaldadas, cambiadas
        $ctl = @(($txt -split "`r?`n") | Where-Object { $_ -match '^\s*CONTROL\s*\|' })
        if ($ctl.Count -ne 1) { throw "DryRun ${emp}: falta la fila CONTROL." }
        $c = @($ctl[0] -split '\|' | ForEach-Object { $_.Trim() })
        $vals = @([int]$c[2], [int]$c[3], [int]$c[4], [int]$c[5], [int]$c[6])
        $exp  = @($esp.Total, $esp.Elim, $esp.Alcance, $esp.Alcance, $esp.Alcance)
        if ($c[1] -ne $emp -or (Compare-Object $vals $exp -SyncWindow 0)) {
            throw "DryRun ${emp}: CONTROL = $($vals -join '/') y se esperaba $($exp -join '/') (total/eliminadas/alcance/respaldadas/cambiadas)."
        }
        Linea "OK  DryRun $emp : total $($esp.Total), eliminadas $($esp.Elim), respaldadas y cambiadas $($esp.Alcance) (todo revertido)"
    }

    # 5) Fotografia 2 y comparacion: la base debe quedar identica
    $snap2 = Join-Path $wd 'snap_2_despues.txt'
    $a = $argsBase + @('-Q', $snapQ); Assert-ArgsBase $a
    $rc = Invoke-SqlcmdExe $a $snap2 (Join-Path $wd 'snap_2_despues.err.txt')
    if ($rc -ne 0) { throw "Fotografia 2 fallo (exit=$rc): $(Leer (Join-Path $wd 'snap_2_despues.err.txt'))" }
    $dif = Compare-Object @(Get-Content $snap1 -Encoding UTF8) @(Get-Content $snap2 -Encoding UTF8)
    if ($dif) {
        $dif | Out-String | Add-Content -Path $script:Resumen -Encoding UTF8
        throw 'La fotografia posterior difiere de la previa: la base cambio.'
    }
    Linea 'OK  Fotografia 2 identica a la 1 (mismas filas, misma huella, sin tabla de respaldo persistente)'

    Linea ''
    Linea 'PASS: DryRun FARET (46) e INNPACK (23) = 69 registros; ROLLBACK confirmado; la base no cambio; no se ejecuto ningun COMMIT.'
    $codigoFinal = 0
}
catch {
    Linea ''
    Linea "FAIL: $($_.Exception.Message)"
    Linea 'EJECUCION DETENIDA. No continuar hasta revisar la evidencia.'
}
finally {
    Linea "Evidencia guardada en: $wd"
    Stop-Transcript | Out-Null
}
exit $codigoFinal
