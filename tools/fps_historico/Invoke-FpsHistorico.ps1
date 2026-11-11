<#
.SYNOPSIS
  Lanzador (en la estacion de trabajo) de la consulta historica FPS/Calidad. SOLO LECTURA.

.DESCRIPTION
  Abre UNA sesion de PowerShell Remoting con Kerberos hacia SAP_NEW, ejecuta fps_historico_remoto.ps1 (consulta por
  Shared Memory con cuentas SQL de solo lectura) y guarda los CSV recibidos en una carpeta LOCAL nueva fuera del
  repositorio (con .gitignore interno).
  - La identidad remota se pide con Get-Credential al iniciar (la escribe una persona; no se guarda en archivos,
    variables persistentes ni registros). No hay tareas ni ejecuciones programadas.
  - No usa -ExecutionPolicy Bypass (Invoke-Command -FilePath envia el contenido, no ejecuta un archivo local).
  - Solo acepta nombres de archivo CSV de una lista permitida al recibir resultados.

  Modos individuales: buscar | esquema | cobertura | nc | nps
  Modo 'todo' (recomendado): buscar (si faltan rutas) -> esquema -> cobertura -> nc -> nps (NP de las NC, en lotes de
  500) -> analizar_cruce.py local. Una sola sesion, una sola vez las credenciales.

.EXAMPLE
  .\Invoke-FpsHistorico.ps1 -Modo todo
  .\Invoke-FpsHistorico.ps1 -Modo todo -CredFps 'C:\ruta\fps_historico_ro.xml' -CredNc 'C:\ruta\qcc_audit_ro.xml'
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][ValidateSet('todo', 'buscar', 'esquema', 'cobertura', 'nps', 'nc')][string]$Modo,
    [string]$CredFps = '',             # ruta EN EL SERVIDOR del XML DPAPI de fps_historico_ro (si se omite: se busca)
    [string]$CredNc = '',              # ruta EN EL SERVIDOR del XML DPAPI de qcc_audit_ro (si se omite: se busca)
    [string]$Servidor = 'SAP_NEW.ad.faret.cl',
    [string]$UsuarioRemoto = 'AD\Administrador',
    [string]$Instancia = '',
    [string]$Desde = '2024-01-01',
    [string]$Hasta = '',
    [string]$ArchivoNps = '',          # solo -Modo nps: archivo LOCAL con un NP por linea
    [ValidateRange(1, 50000)][int]$MaxFilas = 20000,
    [ValidateRange(5, 120)][int]$TimeoutSeg = 60,
    [string]$DirSalida = ''
)
Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

$rxRuta = '^[A-Za-z]:\\[^<>"|?*;]{1,240}\.xml$'
if ($Servidor -notmatch '^[A-Za-z0-9._\-]{1,100}$') { throw 'Servidor invalido.' }
if ($UsuarioRemoto -notmatch '^[A-Za-z0-9._\-]+\\[A-Za-z0-9._\-]+$') { throw 'UsuarioRemoto invalido (DOMINIO\usuario).' }
foreach ($r in @($CredFps, $CredNc)) { if ($r -ne '' -and $r -notmatch $rxRuta) { throw 'Ruta de credencial invalida (se espera C:\...\x.xml, ruta del servidor).' } }
if ($DirSalida -eq '') { $DirSalida = Join-Path $env:USERPROFILE ('fps_historico\resultados_' + (Get-Date -Format 'yyyyMMdd_HHmmss')) }
if (Test-Path -LiteralPath $DirSalida) { throw "La carpeta de salida ya existe: $DirSalida" }
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
if ([System.IO.Path]::GetFullPath($DirSalida).StartsWith($repo, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'La carpeta de salida no puede estar dentro del repositorio (contiene nombres de operadores).'
}
$remoto = Join-Path $PSScriptRoot 'fps_historico_remoto.ps1'
$analizador = Join-Path $PSScriptRoot 'analizar_cruce.py'

function Guardar-Archivos($res, [string]$sufijo) {
    foreach ($k in $res.archivos.Keys) {
        if ($k -notmatch '^[A-Za-z0-9_\-]{1,60}\.csv$') { throw "Nombre de archivo no permitido recibido: $k" }
        $nombre = if ($sufijo -ne '') { [System.IO.Path]::GetFileNameWithoutExtension($k) + $sufijo + '.csv' } else { $k }
        [System.IO.File]::WriteAllText((Join-Path $DirSalida $nombre), [string]$res.archivos[$k], (New-Object System.Text.UTF8Encoding($true)))
    }
}

$cred = Get-Credential -UserName $UsuarioRemoto -Message "Identidad para PowerShell Remoting hacia $Servidor (no se guarda)"
$sesion = $null
$bitacora = @()
try {
    $sesion = New-PSSession -ComputerName $Servidor -Credential $cred -Authentication Kerberos
    $cred = $null

    function Invocar([string]$modo, [string]$archivoCred, [string[]]$nps = @(), [string]$campo = 'NP') {
        $json = [ordered]@{
            modo = $modo; archivoCredencial = $archivoCred; instancia = $Instancia; desde = $Desde; hasta = $Hasta
            nps = $nps; campo = $campo; maxFilas = $MaxFilas; timeoutSeg = $TimeoutSeg
        } | ConvertTo-Json -Compress
        $r = Invoke-Command -Session $sesion -FilePath $remoto -ArgumentList $json
        $script:bitacora += [pscustomobject]@{ modo = $modo; ok = $r.ok; error = $r.error; cuentaSO = $r.cuentaSO; resumen = $r.resumen }
        return $r
    }

    New-Item -ItemType Directory -Path $DirSalida -Force | Out-Null
    Set-Content -LiteralPath (Join-Path $DirSalida '.gitignore') -Value '*' -Encoding ASCII

    # --- rutas de credenciales (solo nombres de archivo; no se lee su contenido)
    if (($Modo -in @('todo', 'buscar') -and ($CredFps -eq '' -or $CredNc -eq '')) -or $Modo -eq 'buscar') {
        $b = Invocar 'buscar' 'C:\x.xml'
        if (-not $b.ok) { throw ('buscar: ' + $b.error) }
        $rutas = @($b.resumen.rutas)
        Write-Host ('Credenciales encontradas en el perfil remoto: ' + $rutas.Count)
        $rutas | ForEach-Object { Write-Host ('  ' + $_) }
        if ($Modo -eq 'buscar') { return }
        if ($CredFps -eq '') { $c = @($rutas | Where-Object { $_ -match 'fps_historico_ro' }); if ($c.Count -eq 1) { $CredFps = $c[0] } }
        if ($CredNc -eq '') { $c = @($rutas | Where-Object { $_ -match 'qcc_audit_ro' }); if ($c.Count -eq 1) { $CredNc = $c[0] } }
        if ($CredFps -eq '' -or $CredNc -eq '') { throw 'No se pudo determinar de forma unica la ruta de una credencial: indique -CredFps y -CredNc.' }
    }

    $pasos = @()
    switch ($Modo) {
        'todo' { $pasos = @('esquema', 'cobertura', 'nc') }
        'nps' { $pasos = @() }
        default { $pasos = @($Modo) }
    }
    foreach ($m in $pasos) {
        $archivo = if ($m -eq 'nc') { $CredNc } else { $CredFps }
        if ($archivo -eq '') { throw "Falta la ruta de credencial para el modo $m." }
        Write-Host "== $m"
        $r = Invocar $m $archivo
        if (-not $r.ok) { Write-Host ("   FALLO: " + $r.error) -ForegroundColor Red; if ($Modo -ne 'todo') { throw $r.error }; if ($m -ne 'cobertura') { break } else { continue } }
        Guardar-Archivos $r ''
        Write-Host ('   OK ' + (($r.resumen | ConvertTo-Json -Compress -Depth 3)))
    }

    # --- NP: de las NC (modo todo) o de archivo (modo nps)
    $listaNps = @()
    if ($Modo -eq 'todo') {
        $ncCsv = Join-Path $DirSalida 'nc_calidad.csv'
        if (Test-Path -LiteralPath $ncCsv) {
            $listaNps = @(Import-Csv -LiteralPath $ncCsv | Where-Object { $_.eliminado -notmatch '^(True|1)$' } |
                ForEach-Object { ([string]$_.np_nv).Trim() } | Where-Object { $_ -match '^\d{1,10}$' } | Select-Object -Unique)
        }
    }
    elseif ($Modo -eq 'nps') {
        if ($ArchivoNps -eq '' -or -not (Test-Path -LiteralPath $ArchivoNps -PathType Leaf)) { throw 'Modo nps: indique -ArchivoNps.' }
        $listaNps = @(Get-Content -LiteralPath $ArchivoNps | ForEach-Object { $_.Trim() } | Where-Object { $_ -match '^\d{1,10}$' } | Select-Object -Unique)
    }
    if ($listaNps.Count -gt 0) {
        $lotes = [math]::Ceiling($listaNps.Count / 500)
        Write-Host ("== nps: {0} NP en {1} lote(s)" -f $listaNps.Count, $lotes)
        # Los NP de las NC de producto son NV Innpack; los de las internas, NP Faret: se consulta por ambas llaves.
        foreach ($campoLlave in @('NP', 'NVInnpack')) {
            for ($i = 0; $i -lt $lotes; $i++) {
                $lote = @($listaNps | Select-Object -Skip ($i * 500) -First 500)
                $r = Invocar 'nps' $CredFps $lote $campoLlave
                if (-not $r.ok) { Write-Host ("   FALLO $campoLlave lote $($i+1): " + $r.error) -ForegroundColor Red; break }
                Guardar-Archivos $r ('_{0:00}' -f ($i + 1))
                if ($r.resumen.truncado) { Write-Host '   AVISO: lote truncado por MaxFilas; el analisis es parcial para ese lote.' -ForegroundColor Yellow }
                Write-Host ('   OK {0} lote {1}: {2} filas' -f $campoLlave, ($i + 1), $r.resumen.filas)
            }
        }
    }
}
finally {
    if ($null -ne $sesion) { Remove-PSSession $sesion }
    $cred = $null
    if (Test-Path -LiteralPath $DirSalida) {
        Set-Content -LiteralPath (Join-Path $DirSalida 'resumen_ejecucion.json') -Value ($bitacora | ConvertTo-Json -Depth 6) -Encoding UTF8
    }
}

# --- analisis local (solo si hay NC y sesiones)
$ncCsv = Join-Path $DirSalida 'nc_calidad.csv'
$fps = @(Get-ChildItem -LiteralPath $DirSalida -Filter 'sesiones_por_*.csv' -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName })
if ($Modo -eq 'todo' -and (Test-Path -LiteralPath $ncCsv) -and $fps.Count -gt 0) {
    Write-Host '== analisis local'
    & python -I $analizador --fps @fps --nc $ncCsv --salida (Join-Path $DirSalida 'analisis')
}
Write-Host "Listo. Resultados en: $DirSalida"
