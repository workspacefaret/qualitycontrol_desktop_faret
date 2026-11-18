# ============================================================================================================
# DESPLIEGUE fps-api - Trazabilidad Fase 1a (paquete_trazabilidad_fase1a_20261117). NO EJECUTAR SIN AUTORIZACION EXPRESA.
# Modifica EXCLUSIVAMENTE: src\server.js (existente) + src\services\trazabilidad.service.js y src\routes\trazabilidad.routes.js (nuevos).
# Reinicia SOLO la tarea FpsApi. No toca SQL, IIS, .env, package.json, otros archivos ni otros servicios.
# Se detiene ante cualquier hash inesperado. Si el servicio no responde tras el reinicio, REVIERTE solo y reinicia.
# ============================================================================================================
$ErrorActionPreference = 'Stop'
$pkg = 'C:\Users\dcarrasco\Desktop\Proyectos\fps-api\paquete_trazabilidad_fase1a_20261117'
$ts  = Get-Date -Format 'yyyyMMdd_HHmmss'
$Hashes = @{
    'src\server.js'                         = 'BE52A6A57B7B61069EC3EAE9D1C7FA08F7D1808687AE544C2278E28E06DE433A'
    'src\services\trazabilidad.service.js'  = 'C3429E29674203F6F2BEDE730A041B90A65DD739C6148EF1A246D5EAB238CCA6'
    'src\routes\trazabilidad.routes.js'     = '13B8215A26C7AA35119078200F47BFD8899A455EE183DE6DD61D605296DBDC95'
}
$ServerJsProduccionEsperado = 'C2B0CAAF2C56FFD44B3BA97FBE67C584320850B258995408DBA395DD124D9D74'

# 0. Paquete local verificado contra el manifiesto
foreach ($k in $Hashes.Keys) { if ((Get-FileHash (Join-Path $pkg $k)).Hash -ne $Hashes[$k]) { throw "Paquete local alterado: $k" } }
'0. paquete local OK (3 hashes)'

$s = New-PSSession -ComputerName SRV-API.ad.faret.cl
try {
    # 1. Precheck de produccion: server.js sin cambios y rutas nuevas ausentes; tarea corriendo
    $pre = Invoke-Command -Session $s -ScriptBlock {
        [pscustomobject]@{
            ServerJs = (Get-FileHash 'C:\API WEB\api\fps-api\src\server.js').Hash
            ExisteRuta = (Test-Path 'C:\API WEB\api\fps-api\src\routes\trazabilidad.routes.js')
            ExisteSvc = (Test-Path 'C:\API WEB\api\fps-api\src\services\trazabilidad.service.js')
            Tarea = (Get-ScheduledTask -TaskName FpsApi).State.ToString()
            LibreGB = [math]::Round((Get-PSDrive C).Free / 1GB, 1)
        }
    }
    "1. precheck: server.js=$($pre.ServerJs) rutaNueva=$($pre.ExisteRuta) svcNuevo=$($pre.ExisteSvc) tarea=$($pre.Tarea) libreGB=$($pre.LibreGB)"
    if ($pre.ServerJs -ne $ServerJsProduccionEsperado) { throw 'server.js de produccion distinto del esperado: alguien lo cambio. DETENIDO.' }
    if ($pre.ExisteRuta -or $pre.ExisteSvc) { throw 'Ya existen archivos trazabilidad.* en produccion. DETENIDO.' }
    if ($pre.Tarea -ne 'Running') { throw "La tarea FpsApi no esta Running ($($pre.Tarea)). DETENIDO." }

    # 2. Respaldo en servidor + subida a nuevo\ (sin impacto) + comparacion de hashes
    $b = "C:\API WEB\_backups\fps-api_pre_trazabilidad_$ts"
    Invoke-Command -Session $s -ArgumentList $b -ScriptBlock {
        param($b)
        New-Item -ItemType Directory -Path "$b\src", "$b\nuevo\src\services", "$b\nuevo\src\routes" | Out-Null
        Copy-Item 'C:\API WEB\api\fps-api\src\server.js' "$b\src\server.js"
    }
    foreach ($k in $Hashes.Keys) { Copy-Item -Path (Join-Path $pkg $k) -Destination "$b\nuevo\$k" -ToSession $s }
    $chk = Invoke-Command -Session $s -ArgumentList $b, $ServerJsProduccionEsperado -ScriptBlock {
        param($b, $esp)
        [pscustomobject]@{
            RespaldoServerJs = (Get-FileHash "$b\src\server.js").Hash
            Nuevo = @(Get-ChildItem "$b\nuevo" -Recurse -File | ForEach-Object { $_.FullName.Substring($b.Length + 7) + '=' + (Get-FileHash $_.FullName).Hash })
        }
    }
    "2. respaldo server.js=$($chk.RespaldoServerJs)"
    if ($chk.RespaldoServerJs -ne $ServerJsProduccionEsperado) { throw 'Respaldo de server.js no coincide con produccion. DETENIDO.' }
    foreach ($k in $Hashes.Keys) { if (-not ($chk.Nuevo -contains ($k + '=' + $Hashes[$k]))) { throw "Staging en servidor distinto del paquete: $k. DETENIDO." } }
    '   staging en servidor = paquete (3 hashes). Respaldo en: ' + $b

    # 3. Corte: detener SOLO la tarea FpsApi, confirmar puerto libre, copiar, verificar, iniciar
    $res = Invoke-Command -Session $s -ArgumentList $b, $Hashes -ScriptBlock {
        param($b, $Hashes)
        $log = @()
        $raiz = 'C:\API WEB\api\fps-api'
        Stop-ScheduledTask -TaskName FpsApi
        $t = 0; while ((Get-NetTCPConnection -LocalPort 3002 -State Listen -ErrorAction SilentlyContinue) -and $t -lt 40) { Start-Sleep -Seconds 1; $t++ }
        $puertoLibre = -not (Get-NetTCPConnection -LocalPort 3002 -State Listen -ErrorAction SilentlyContinue)
        $log += "puerto 3002 libre=$puertoLibre tras ${t}s"
        if (-not $puertoLibre) { Start-ScheduledTask -TaskName FpsApi; return @{ Ok = $false; Log = ($log + 'el puerto no se libero: se reinicio la tarea SIN copiar nada') } }
        try {
            foreach ($k in $Hashes.Keys) { Copy-Item "$b\nuevo\$k" (Join-Path $raiz $k) }
            foreach ($k in $Hashes.Keys) {
                $h = (Get-FileHash (Join-Path $raiz $k)).Hash
                $log += "destino $k coincide=$($h -eq $Hashes[$k])"
                if ($h -ne $Hashes[$k]) { throw "Hash en destino distinto: $k" }
            }
        } catch {
            $log += 'ERROR en copia: ' + $_.Exception.Message + ' -> REVERTIENDO'
            Copy-Item "$b\src\server.js" "$raiz\src\server.js"
            Remove-Item "$raiz\src\services\trazabilidad.service.js", "$raiz\src\routes\trazabilidad.routes.js" -ErrorAction SilentlyContinue
            Start-ScheduledTask -TaskName FpsApi
            return @{ Ok = $false; Log = $log }
        }
        Start-ScheduledTask -TaskName FpsApi
        # Espera a que Node abra el puerto y /api/health responda 200 (hasta 150 s; Node a veces tarda ~75 s)
        $listo = $false; $seg = 0
        while (-not $listo -and $seg -lt 150) {
            Start-Sleep -Seconds 3; $seg += 3
            try { $r = Invoke-WebRequest -Uri 'http://localhost:3002/api/health' -UseBasicParsing -TimeoutSec 5; if ($r.StatusCode -eq 200) { $listo = $true } } catch { }
        }
        $log += "health local 200=$listo tras ~${seg}s"
        if (-not $listo) {
            $log += 'NO levanto: REVIRTIENDO'
            Stop-ScheduledTask -TaskName FpsApi
            $t = 0; while ((Get-NetTCPConnection -LocalPort 3002 -State Listen -ErrorAction SilentlyContinue) -and $t -lt 40) { Start-Sleep -Seconds 1; $t++ }
            Copy-Item "$b\src\server.js" "$raiz\src\server.js"
            Remove-Item "$raiz\src\services\trazabilidad.service.js", "$raiz\src\routes\trazabilidad.routes.js" -ErrorAction SilentlyContinue
            Start-ScheduledTask -TaskName FpsApi
            return @{ Ok = $false; Log = $log }
        }
        $pidNuevo = (Get-NetTCPConnection -LocalPort 3002 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1).OwningProcess
        $log += "PID escuchando en 3002: $pidNuevo; tarea=" + (Get-ScheduledTask -TaskName FpsApi).State
        return @{ Ok = $true; Log = $log }
    }
    $res.Log | ForEach-Object { '3. ' + $_ }
    if (-not $res.Ok) { throw 'DESPLIEGUE FALLIDO (revertido o no aplicado). Ver el registro.' }
    '3. DESPLEGADO. Respaldo para reversion manual: ' + $b
}
finally { Remove-PSSession $s }
