<#
.SYNOPSIS
  Fase 25: consulta de SOLO LECTURA a dbo.WorkOrderRecords y dbo.ZZZMasterOT (FPS_PRODUCCION) para las OT de las NC de producto.

.DESCRIPTION
  Una sola sesion de PowerShell Remoting con Kerberos hacia SAP_NEW (la identidad se pide con Get-Credential; no se guarda).
  Reutiliza fps_historico_remoto.ps1 (cuenta SQL fps_historico_ro, Shared Memory, guarda de solo lectura, sin SQL libre).
  Pasos: 1) esquema + conteo + muestra de ambas tablas; 2) filas de cada tabla para las OT del archivo -ArchivoOt
  (la columna se elige entre candidatas que existan en el esquema recibido; la validacion final la hace el servidor).
  Resultados en una carpeta LOCAL nueva fuera del repositorio. No usa -ExecutionPolicy Bypass.

.EXAMPLE
  powershell -NoProfile -File C:/Users/dcarrasco/Desktop/Proyectos/qualitycontrol_desktop_faret/tools/fps_historico/Invoke-FpsOt.ps1 -ArchivoOt C:/Users/dcarrasco/fps_historico/ots_nc_producto.txt
#>
[CmdletBinding()]
param(
    [string]$ArchivoOt = '',
    [switch]$Fase26,                   # modelo completo de la NC (qcc_audit_ro) + sesiones por NP Faret (fps_historico_ro)
    [string]$CredNc = 'C:\Users\administrador.AD\qcc_audit_ro.xml',
    [string]$ArchivoNpFaret = '',      # NP Faret (uno por linea) para -Fase26
    [string[]]$Operadores = @(),       # -Fase26: nombres (letras y espacios) cuyas sesiones se consultan en la vista
    [string]$DesdeOperador = '2026-01-01',
    [string[]]$Articulos = @(),        # -Fase27: codigos de producto (solo digitos) para buscar sus sesiones en todo el historial
    [string[]]$IdMaquinas = @(),       # -Fase27: IdMaquina (solo digitos) cuyas sesiones se consultan
    [switch]$ListaMaquina,             # lee dbo.ZZZListaMaquina (solo si una persona autorizada concedio el SELECT)
    [string]$MaquinaDesde = '2026-02-01',
    [string]$MaquinaHasta = '2026-04-30',
    [switch]$SoloCatalogo,             # solo metadatos de catalogo (sys.*), sin leer datos de negocio
    [string]$ArchivoNv = '',           # NV Innpack (uno por linea) para ZZZMasterOT.NotaVentaInnpack

    [string]$CredFps = 'C:\Users\administrador.AD\fps_historico_ro.xml',
    [string]$Servidor = 'SAP_NEW.ad.faret.cl',
    [string]$UsuarioRemoto = 'AD\Administrador',
    [ValidateRange(1, 50000)][int]$MaxFilas = 20000,
    [ValidateRange(5, 120)][int]$TimeoutSeg = 60,
    [string]$DirSalida = ''
)
Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

if ($CredFps -notmatch '^[A-Za-z]:\\[^<>"|?*;]{1,240}\.xml$') { throw 'Ruta de credencial invalida.' }
if ($Servidor -notmatch '^[A-Za-z0-9._\-]{1,100}$') { throw 'Servidor invalido.' }
if ($UsuarioRemoto -notmatch '^[A-Za-z0-9._\-]+\\[A-Za-z0-9._\-]+$') { throw 'UsuarioRemoto invalido.' }
if (-not $SoloCatalogo -and -not $Fase26 -and -not (Test-Path -LiteralPath $ArchivoOt -PathType Leaf)) { throw 'No existe -ArchivoOt.' }
$ots = @()
if (-not $SoloCatalogo -and -not $Fase26) { $ots = @(Get-Content -LiteralPath $ArchivoOt | ForEach-Object { $_.Trim() } | Where-Object { $_ -match '^\d{1,18}$' } | Select-Object -Unique) }
if (-not $SoloCatalogo -and -not $Fase26 -and $ots.Count -lt 1) { throw 'El archivo de OT no contiene valores validos.' }
if ($DirSalida -eq '') { $DirSalida = Join-Path $env:USERPROFILE ('fps_historico\ot_' + (Get-Date -Format 'yyyyMMdd_HHmmss')) }
if (Test-Path -LiteralPath $DirSalida) { throw "La carpeta de salida ya existe: $DirSalida" }
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
if ([System.IO.Path]::GetFullPath($DirSalida).StartsWith($repo, [StringComparison]::OrdinalIgnoreCase)) { throw 'La salida no puede estar dentro del repositorio.' }
$remoto = Join-Path $PSScriptRoot 'fps_historico_remoto.ps1'

function Guardar-Archivos($res, [string]$sufijo) {
    foreach ($k in $res.archivos.Keys) {
        if ($k -notmatch '^[A-Za-z0-9_\-]{1,60}\.csv$') { throw "Nombre de archivo no permitido: $k" }
        $nombre = if ($sufijo -ne '') { [System.IO.Path]::GetFileNameWithoutExtension($k) + $sufijo + '.csv' } else { $k }
        [System.IO.File]::WriteAllText((Join-Path $DirSalida $nombre), [string]$res.archivos[$k], (New-Object System.Text.UTF8Encoding($true)))
    }
}

# Con -File, 'a,b,c' llega como UN texto: se separa por comas y se recortan espacios.
$Articulos = @($Articulos | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' })
$IdMaquinas = @($IdMaquinas | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' })
$cred = Get-Credential -UserName $UsuarioRemoto -Message "Identidad para PowerShell Remoting hacia $Servidor (no se guarda)"
$sesion = $null; $bitacora = @()
try {
    $sesion = New-PSSession -ComputerName $Servidor -Credential $cred -Authentication Kerberos
    $cred = $null
    function Invocar($obj) {
        $json = $obj | ConvertTo-Json -Compress
        $r = Invoke-Command -Session $sesion -FilePath $remoto -ArgumentList $json
        $script:bitacora += [pscustomobject]@{ modo = $obj.modo; tabla = $obj['tabla']; ok = $r.ok; error = $r.error; cuentaSO = $r.cuentaSO; resumen = $r.resumen }
        return $r
    }
    New-Item -ItemType Directory -Path $DirSalida -Force | Out-Null
    Set-Content -LiteralPath (Join-Path $DirSalida '.gitignore') -Value '*' -Encoding ASCII

    if ($Fase26) {
        if ($CredNc -notmatch '^[A-Za-z]:\\[^<>"|?*;]{1,240}\.xml$') { throw 'Ruta de credencial de Calidad invalida.' }
        Write-Host '== nc_completo'
        $r = Invocar ([ordered]@{ modo = 'nc_completo'; archivoCredencial = $CredNc; instancia = ''; maxFilas = $MaxFilas; timeoutSeg = $TimeoutSeg })
        if (-not $r.ok) { throw ('nc_completo: ' + $r.error) }
        Guardar-Archivos $r ''
        Write-Host ('   OK ' + (($r.resumen | ConvertTo-Json -Compress -Depth 3)))
        $k = 0
        foreach ($nom in $Operadores) {
            $k++
            Write-Host ('== operador_sesiones ' + $k)
            $r = Invocar ([ordered]@{ modo = 'operador_sesiones'; archivoCredencial = $CredFps; instancia = ''; nombre = $nom; desde = $DesdeOperador; hasta = ''; maxFilas = $MaxFilas; timeoutSeg = $TimeoutSeg })
            if (-not $r.ok) { Write-Host ('   FALLO: ' + $r.error) -ForegroundColor Red; continue }
            Guardar-Archivos $r ('_{0:00}' -f $k)
            Write-Host ('   OK {0} sesiones' -f $r.resumen.filas)
        }
        if ($Articulos.Count -gt 0) {
            Write-Host '== articulo_sesiones'
            $r = Invocar ([ordered]@{ modo = 'articulo_sesiones'; archivoCredencial = $CredFps; instancia = ''; articulos = $Articulos; maxFilas = $MaxFilas; timeoutSeg = $TimeoutSeg })
            if (-not $r.ok) { Write-Host ('   FALLO: ' + $r.error) -ForegroundColor Red } else { Guardar-Archivos $r ''; Write-Host ('   OK {0} sesiones' -f $r.resumen.filas) }
        }
        if ($ListaMaquina) {
            Write-Host '== lista_maquina'
            $r = Invocar ([ordered]@{ modo = 'lista_maquina'; archivoCredencial = $CredFps; instancia = ''; maxFilas = $MaxFilas; timeoutSeg = $TimeoutSeg })
            if (-not $r.ok) { Write-Host ('   FALLO (probable falta de SELECT): ' + $r.error) -ForegroundColor Yellow } else { Guardar-Archivos $r ''; Write-Host ('   OK {0} maquinas' -f $r.resumen.filas) }
        }
        if ($IdMaquinas.Count -gt 0) {
            Write-Host '== maquina_sesiones'
            $r = Invocar ([ordered]@{ modo = 'maquina_sesiones'; archivoCredencial = $CredFps; instancia = ''; maquinas = $IdMaquinas; desde = $MaquinaDesde; hasta = $MaquinaHasta; maxFilas = $MaxFilas; timeoutSeg = $TimeoutSeg })
            if (-not $r.ok) { Write-Host ('   FALLO: ' + $r.error) -ForegroundColor Red } else { Guardar-Archivos $r ''; Write-Host ('   OK {0} sesiones' -f $r.resumen.filas) }
        }
        if ($ArchivoNpFaret -ne '' -and (Test-Path -LiteralPath $ArchivoNpFaret -PathType Leaf)) {
            $npf = @(Get-Content -LiteralPath $ArchivoNpFaret | ForEach-Object { $_.Trim() } | Where-Object { $_ -match '^\d{1,10}$' } | Select-Object -Unique)
            if ($npf.Count -gt 0 -and $npf.Count -le 500) {
                Write-Host ('== nps (NP Faret): ' + $npf.Count)
                $r = Invocar ([ordered]@{ modo = 'nps'; archivoCredencial = $CredFps; instancia = ''; desde = ''; hasta = ''; nps = $npf; campo = 'NP'; maxFilas = $MaxFilas; timeoutSeg = $TimeoutSeg })
                if (-not $r.ok) { throw ('nps: ' + $r.error) }
                Guardar-Archivos $r '_npfaret'
                Write-Host ('   OK {0} sesiones' -f $r.resumen.filas)
            }
        }
        return
    }
    if ($SoloCatalogo) {
        Write-Host '== catalogo'
        $r = Invocar ([ordered]@{ modo = 'catalogo'; archivoCredencial = $CredFps; instancia = ''; maxFilas = $MaxFilas; timeoutSeg = $TimeoutSeg })
        if (-not $r.ok) { throw ('catalogo: ' + $r.error) }
        Guardar-Archivos $r ''
        Write-Host ('   OK ' + (($r.resumen | ConvertTo-Json -Compress -Depth 3)))
        return
    }
    Write-Host '== esquema_ot'
    $r = Invocar ([ordered]@{ modo = 'esquema_ot'; archivoCredencial = $CredFps; instancia = ''; maxFilas = $MaxFilas; timeoutSeg = $TimeoutSeg })
    if (-not $r.ok) { throw ('esquema_ot: ' + $r.error) }
    Guardar-Archivos $r ''
    Write-Host ('   OK ' + (($r.resumen | ConvertTo-Json -Compress -Depth 3)))

    $esq = @(Import-Csv -LiteralPath (Join-Path $DirSalida 'esquema_tablas_ot.csv'))
    $candidatas = @{ 'WorkOrderRecords' = @('WorkOrderKey', 'OT', 'IdOT'); 'ZZZMasterOT' = @('NotaVentaInnpack') }
    foreach ($t in @('WorkOrderRecords', 'ZZZMasterOT')) {
        $cols = @($esq | Where-Object { $_.TABLE_NAME -eq $t } | ForEach-Object { $_.COLUMN_NAME })
        $col = $null
        foreach ($c in $candidatas[$t]) { $m = @($cols | Where-Object { $_ -ieq $c }); if ($m.Count -ge 1) { $col = $m[0]; break } }
        if ($null -eq $col) { Write-Host "   $t : ninguna columna candidata de OT entre: $($cols -join ', ')" -ForegroundColor Yellow; continue }
        $vals = $ots
        if ($t -eq 'ZZZMasterOT') {
            if ($ArchivoNv -eq '' -or -not (Test-Path -LiteralPath $ArchivoNv -PathType Leaf)) { Write-Host '   ZZZMasterOT: indique -ArchivoNv' -ForegroundColor Yellow; continue }
            $vals = @(Get-Content -LiteralPath $ArchivoNv | ForEach-Object { $_.Trim() } | Where-Object { $_ -match '^\d{1,18}$' } | Select-Object -Unique)
        }
        $lotes = [math]::Ceiling($vals.Count / 500)
        for ($i = 0; $i -lt $lotes; $i++) {
            $lote = @($vals | Select-Object -Skip ($i * 500) -First 500)
            Write-Host "== tabla_ot $t ($col) lote $($i+1)/$lotes"
            $r = Invocar ([ordered]@{ modo = 'tabla_ot'; archivoCredencial = $CredFps; instancia = ''; tabla = $t; columna = $col; valores = $lote; maxFilas = $MaxFilas; timeoutSeg = $TimeoutSeg })
            if (-not $r.ok) { Write-Host ('   FALLO: ' + $r.error) -ForegroundColor Red; break }
            Guardar-Archivos $r ('_{0:00}' -f ($i + 1))
            Write-Host ('   OK {0} filas' -f $r.resumen.filas)
        }
    }
}
finally {
    if ($null -ne $sesion) { Remove-PSSession $sesion }
    $cred = $null
    if (Test-Path -LiteralPath $DirSalida) { Set-Content -LiteralPath (Join-Path $DirSalida 'resumen_ejecucion.json') -Value ($bitacora | ConvertTo-Json -Depth 6) -Encoding UTF8 }
}
Write-Host "Listo. Resultados en: $DirSalida"
