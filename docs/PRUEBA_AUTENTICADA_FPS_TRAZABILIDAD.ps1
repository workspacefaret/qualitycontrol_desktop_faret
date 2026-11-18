# ============================================================================================================
# PRUEBA AUTENTICADA (solo lectura) de las rutas nuevas de fps-api: /api/produccion/trazabilidad/np y /lote
# La ejecuta UNA PERSONA desde su PowerShell (cuenta con acceso a SRV-API). La clave API se lee DENTRO de la sesion remota,
# se usa solo contra http://localhost:3002 en el servidor y NUNCA se imprime, ni se guarda, ni sale de esa sesion.
# Solo GET. No se imprimen cuerpos de respuesta: solo codigo HTTP, tiempo, largo y, por fuente, ok=True/False.
# Esperado: NP 4007/3951/4002/4128 -> 200 con fuentes ok=True y ms < 18000; lote -> 200; np=abc -> 400;
#           rutas antiguas (procesos-por-np, laboratorio/registros) -> 200 (regresion).
# Salida: pantalla + prueba_fps_trazabilidad_<fecha>.txt en la carpeta actual.
# ============================================================================================================
$ErrorActionPreference = 'Stop'
$Informe = Join-Path (Get-Location) ("prueba_fps_trazabilidad_{0}.txt" -f (Get-Date -Format 'yyyyMMdd_HHmmss'))
$salida = Invoke-Command -ComputerName SRV-API.ad.faret.cl -ScriptBlock {
    $linea = (Get-Content 'C:\API WEB\api\fps-api\.env' | Where-Object { $_ -match '^API_KEY=' } | Select-Object -First 1)
    if (-not $linea) { return @('NO SE ENCONTRO API_KEY en el .env del servidor') }
    $k = ($linea -replace '^API_KEY=', '').Trim().Trim('"')
    $linea = $null
    $rutas = '/trazabilidad/np?np=4007', '/trazabilidad/np?np=3951', '/trazabilidad/np?np=4002', '/trazabilidad/np?np=4128',
             '/trazabilidad/lote?lote=5433-1', '/trazabilidad/np?np=abc', '/procesos-por-np/22924', '/laboratorio/registros?np=4062'
    foreach ($p in $rutas) {
        $w = [Diagnostics.Stopwatch]::StartNew()
        try {
            $r = Invoke-WebRequest -UseBasicParsing -Headers @{ 'x-api-key' = $k } -Uri ('http://localhost:3002/api/produccion' + $p) -TimeoutSec 60
            $f = ''
            try {
                $j = $r.Content | ConvertFrom-Json
                if ($j.data -is [System.Array]) {                                               # rutas antiguas: {ok,total,data:[...]}
                    $f = 'filas=' + $(if ($null -ne $j.total) { $j.total } else { $j.data.Count })  # cantidad de elementos, no largo de texto
                }
                elseif ($j.data -and $j.data.PSObject.Properties['fuentes']) { $f = 'fuentes: ' + (($j.data.fuentes.PSObject.Properties | ForEach-Object { $_.Name + '=' + $_.Value.ok }) -join ',') }
                else { $f = 'objeto' }
            } catch { $f = 'no-JSON' }
            "$p -> $($r.StatusCode) ms=$($w.ElapsedMilliseconds) bytes=$($r.Content.Length) $f"
        } catch {
            $cod = 0; if ($_.Exception.Response) { $cod = [int]$_.Exception.Response.StatusCode }
            "$p -> $cod ms=$($w.ElapsedMilliseconds)"
        }
    }
    $k = $null
}
$salida | ForEach-Object { Write-Host $_ }
$salida | Set-Content -Path $Informe -Encoding UTF8
Write-Host "Informe guardado en $Informe (sin clave ni cuerpos de respuesta)" -ForegroundColor Cyan
