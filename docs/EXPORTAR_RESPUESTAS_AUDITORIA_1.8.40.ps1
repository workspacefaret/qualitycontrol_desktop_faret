# ============================================================================================================
# EXPORTACION DE SOLO LECTURA para la auditoria 1.8.40 (comparar base de datos -> API -> Photino -> informe).
# La REVISA y la EJECUTA UNA PERSONA desde su PowerShell (cuenta con acceso a SRV-API).
# - Solo GET contra fps-api en http://localhost:3002, dentro de la sesion remota.
# - La clave API se lee DENTRO de esa sesion, nunca se imprime, no se guarda y no sale de ella.
# - Guarda los cuerpos de respuesta (datos de negocio: clientes, operadores; sin credenciales) en tu equipo,
#   FUERA del repositorio: C:\Installers\Auditoria_1.8.40\respuestas
# - No escribe nada en el servidor ni en ninguna base de datos.
# ============================================================================================================
$ErrorActionPreference = 'Stop'
$Destino = 'C:\Installers\Auditoria_1.8.40\respuestas'
New-Item -ItemType Directory -Force -Path $Destino | Out-Null
$Nps = 4007, 3951, 4171, 4128, 4070, 4167, 4190, 4184, 4002

$respuestas = Invoke-Command -ComputerName SRV-API.ad.faret.cl -ArgumentList (, $Nps) -ScriptBlock {
    param($Nps)
    $linea = (Get-Content 'C:\API WEB\api\fps-api\.env' | Where-Object { $_ -match '^API_KEY=' } | Select-Object -First 1)
    if (-not $linea) { throw 'No se encontro API_KEY en el servidor' }
    $k = ($linea -replace '^API_KEY=', '').Trim().Trim('"')
    $linea = $null
    foreach ($np in $Nps) {
        $w = [Diagnostics.Stopwatch]::StartNew()
        try {
            $r = Invoke-WebRequest -UseBasicParsing -Headers @{ 'x-api-key' = $k } -Uri "http://localhost:3002/api/produccion/trazabilidad/np?np=$np" -TimeoutSec 60
            # Se transfieren los bytes tal cual (UTF-8) para no alterar acentos.
            [pscustomobject]@{ Np = $np; Codigo = [int]$r.StatusCode; Ms = $w.ElapsedMilliseconds; Bytes = $r.RawContentStream.ToArray() }
        } catch {
            $cod = 0; if ($_.Exception.Response) { $cod = [int]$_.Exception.Response.StatusCode }
            [pscustomobject]@{ Np = $np; Codigo = $cod; Ms = $w.ElapsedMilliseconds; Bytes = $null }
        }
        Start-Sleep -Seconds 2
    }
    $k = $null
}
foreach ($x in $respuestas) {
    Write-Host "NP $($x.Np) -> $($x.Codigo) ms=$($x.Ms)"
    if ($x.Bytes) { [IO.File]::WriteAllBytes((Join-Path $Destino "np_$($x.Np).json"), [byte[]]$x.Bytes) }
}
Write-Host "Respuestas guardadas en $Destino" -ForegroundColor Cyan
