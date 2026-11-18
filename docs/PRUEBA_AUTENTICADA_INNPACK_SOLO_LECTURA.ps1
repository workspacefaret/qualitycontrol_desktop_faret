# ============================================================================================================
# VALIDACION AUTENTICADA DE SOLO LECTURA - API INNPACK (Calidad NP + Trazabilidad documentos + regresion existente)
# La ejecuta UNA PERSONA en su PC (PowerShell normal). Credenciales por consola oculta: no se muestran, no se guardan,
# no pasan por Claude. El token vive solo en memoria y nunca se imprime.
# SOLO GET. El unico POST permitido es el de inicio de sesion (api/auth/login); cualquier otro metodo se rechaza por
# codigo (no se envia). No se imprimen ni guardan cuerpos de respuesta: solo codigo HTTP, success y cantidad de filas.
# Una prueba fallida se registra y el script CONTINUA con las demas lecturas.
# Salida: pantalla + resultado_solo_lectura_<fecha>.txt en la carpeta actual.
# ============================================================================================================
param([string]$Base = 'https://api.faret.cl/innpack')
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$Marca = Get-Date -Format 'yyyyMMdd_HHmmss'
$Informe = Join-Path (Get-Location) ("resultado_solo_lectura_{0}.txt" -f $Marca)
$resultados = New-Object System.Collections.Generic.List[object]
$NpInexistente = '999999'      # NP que no existe: las lecturas deben responder vacio, nunca 500
$IdInexistente = 999999999     # id que no existe (solo para GET de un recurso puntual)

function Llamar([string]$Metodo, [string]$Ruta, $Token, [string]$Cuerpo) {
    # Guarda de seguridad: solo GET, salvo el login.
    if ($Metodo -ne 'GET' -and -not ($Metodo -eq 'POST' -and $Ruta -eq 'api/auth/login')) { throw "Metodo $Metodo a '$Ruta' bloqueado: esta version es de solo lectura." }
    $h = @{}
    if ($Token) { $h['Authorization'] = 'Bearer ' + $Token }
    $p = @{ Uri = "$Base/$Ruta"; Method = $Metodo; Headers = $h; UseBasicParsing = $true; TimeoutSec = 90 }
    if ($Metodo -eq 'POST') { $p['ContentType'] = 'application/json'; $p['Body'] = $Cuerpo }
    try {
        $r = Invoke-WebRequest @p
        return [pscustomobject]@{ Codigo = [int]$r.StatusCode; Cuerpo = $r.Content }
    } catch {
        $resp = $_.Exception.Response
        if ($resp) { return [pscustomobject]@{ Codigo = [int]$resp.StatusCode; Cuerpo = '' } }   # el cuerpo de un error no se lee
        return [pscustomobject]@{ Codigo = 0; Cuerpo = '' }
    }
}
function Forma($cuerpo) {   # SOLO forma del dato: success y cantidad de filas. Nunca contenido ni mensajes.
    if (-not $cuerpo) { return '-' }
    try {
        $j = $cuerpo | ConvertFrom-Json
        $d = $j.data
        if ($null -eq $d) { return "success=$($j.success)" }
        if ($d -is [array]) { return "success=$($j.success) filas=$($d.Count)" }
        return "success=$($j.success) objeto"
    } catch { return 'no-JSON' }
}
# Aceptados = codigos que aprueban. Advertencia = codigos que NO aprueban y exigen verificar (400 sin parametros, 404 ruta o dato inexistente).
function Registrar([string]$Grupo, [string]$Prueba, [string]$Esperado, $r, [string[]]$Aceptados, [string[]]$Advertencia) {
    if ($r.Codigo -eq 0 -or $r.Codigo -ge 500) { $est = 'FALLA' }
    elseif ($Aceptados -contains [string]$r.Codigo) { $est = 'PASA' }
    elseif ($Advertencia -contains [string]$r.Codigo) { $est = 'ADVERTENCIA' }
    else { $est = 'FALLA' }
    $resultados.Add([pscustomobject]@{ Grupo = $Grupo; Prueba = $Prueba; Esperado = $Esperado; Obtenido = $r.Codigo; Estado = $est; Forma = (Forma $r.Cuerpo) })
    $color = switch ($est) { 'PASA' { 'Green' } 'ADVERTENCIA' { 'Yellow' } default { 'Red' } }
    Write-Host ("[{0,-11}] {1,-9} {2,-60} esperado {3,-4} obtenido {4}" -f $est, $Grupo, $Prueba, $Esperado, $r.Codigo) -ForegroundColor $color
}
function Contar($cuerpo, [string]$Campo) {   # cantidad de elementos de data (o data.<Campo>); devuelve $null si no se puede
    try { $j = $cuerpo | ConvertFrom-Json; $d = $j.data; if ($Campo -and $d.PSObject.Properties[$Campo]) { $d = $d.$Campo }; return @($d).Count } catch { return $null }
}

Write-Host "=== Validacion autenticada SOLO LECTURA ($Base) - $(Get-Date) ===" -ForegroundColor Cyan
$u = Read-Host 'Usuario INNPACK'
$sec = Read-Host 'Contrasena (oculta)' -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
try {
    $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    $cuerpoLogin = (@{ codigoUsuario = $u; password = $plain; soportaCambioPassword = $true } | ConvertTo-Json -Compress)
    $rl = Llamar 'POST' 'api/auth/login' $null $cuerpoLogin
} finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr); $plain = $null; $cuerpoLogin = $null; $sec = $null; $u = $null }
if ($rl.Codigo -ne 200) { throw "Login rechazado (HTTP $($rl.Codigo)). Sin sesion no se puede continuar." }
$j = $rl.Cuerpo | ConvertFrom-Json
$t = [string]$j.data.token
$rol = [string]$j.data.rol
$rl = $null; $j = $null
Write-Host "Sesion iniciada. Rol: $rol" -ForegroundColor Cyan

# --- 1. Autenticacion (GET)
Registrar 'AUTH' 'Sin token a ruta nueva (calidad-np)' '401' (Llamar 'GET' 'api/calidad-np/certificados/flujo' $null) @('401')
Registrar 'AUTH' 'Token invalido a ruta nueva (trazabilidad-documentos)' '401' (Llamar 'GET' "api/trazabilidad-documentos/np/$NpInexistente/documentos" 'token-falso') @('401')
Registrar 'AUTH' 'Sesion valida: mis-permisos' '200' (Llamar 'GET' 'api/auth/mis-permisos' $t) @('200')

# --- 2. Rutas nuevas con la sesion (GET) - leen las tablas SQL nuevas
$r = Llamar 'GET' 'api/calidad-np/certificados/flujo' $t
Registrar 'NUEVAS' 'calidad-np: flujo de aprobacion' '200' $r @('200')
$n = Contar $r.Cuerpo ''
$ok = ($n -eq 3); $e = if ($ok) { 'PASA' } else { 'FALLA' }
$resultados.Add([pscustomobject]@{ Grupo = 'NUEVAS'; Prueba = 'flujo: 3 cargos sembrados'; Esperado = '3'; Obtenido = $n; Estado = $e; Forma = '-' })
Write-Host ("[{0,-11}] NUEVAS    flujo: 3 cargos sembrados                                      esperado 3    obtenido {1}" -f $e, $n) -ForegroundColor $(if ($ok) { 'Green' } else { 'Red' })
Registrar 'NUEVAS' 'calidad-np: certificados (lista)' '200' (Llamar 'GET' 'api/calidad-np/certificados' $t) @('200')
Registrar 'NUEVAS' 'calidad-np: mermas de NP inexistente' '200' (Llamar 'GET' "api/calidad-np/np/$NpInexistente/mermas" $t) @('200')
Registrar 'NUEVAS' 'calidad-np: informes de NP inexistente' '200' (Llamar 'GET' "api/calidad-np/np/$NpInexistente/informes" $t) @('200')
Registrar 'NUEVAS' 'calidad-np: cierre NP inexistente item 1' '200' (Llamar 'GET' "api/calidad-np/np/$NpInexistente/cierre/1" $t) @('200') @('400', '404')
Registrar 'NUEVAS' 'calidad-np: certificado inexistente (404 = verificar)' '404*' (Llamar 'GET' "api/calidad-np/certificados/$IdInexistente" $t) @() @('400', '404')
$r = Llamar 'GET' "api/trazabilidad-documentos/np/$NpInexistente/documentos" $t
Registrar 'NUEVAS' 'trazabilidad-documentos: checklist de NP' '200' $r @('200')
$req = Contar $r.Cuerpo 'requisitos'
Write-Host "   (elementos de checklist reconocidos: $req; el contrato esperado devuelve los 23 requisitos sembrados)"
Registrar 'NUEVAS' 'trazabilidad-documentos: factores de NP inexistente' '200' (Llamar 'GET' "api/trazabilidad-documentos/np/$NpInexistente/factores" $t) @('200')
Registrar 'NUEVAS' 'trazabilidad-documentos: auditoria de NP inexistente' '200' (Llamar 'GET' "api/trazabilidad-documentos/np/$NpInexistente/auditoria" $t) @('200')

# --- 3. Regresion de modulos existentes (GET de listado). 400 y 404 NO aprueban: ADVERTENCIA, verificar la ruta/parametros.
$exist = 'api/no-conformidades', 'api/control-documental', 'api/producto-terminado', 'api/registros-control', 'api/talleres-externos', 'api/muestra-laboratorio', 'api/recepcion-calidad', 'api/usuarios', 'api/despachos-diarios', 'api/certificados-liberacion', 'api/faret-laboratorio'
foreach ($e2 in $exist) { Registrar 'REGRESION' $e2 '200' (Llamar 'GET' $e2 $t) @('200') @('400', '404') }
Registrar 'REGRESION' 'api/health' '200' (Llamar 'GET' 'api/health' $null) @('200')

# --- Resumen (sin cuerpos de respuesta, sin tokens, sin credenciales)
$f = @($resultados | Where-Object { $_.Estado -eq 'FALLA' }).Count
$a = @($resultados | Where-Object { $_.Estado -eq 'ADVERTENCIA' }).Count
$p = @($resultados | Where-Object { $_.Estado -eq 'PASA' }).Count
$lineas = @("=== RESUMEN SOLO LECTURA: PASA=$p ADVERTENCIA=$a FALLA=$f | rol de la sesion: $rol | $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ===")
$lineas += ($resultados | Format-Table Grupo, Prueba, Esperado, Obtenido, Estado, Forma -AutoSize | Out-String -Width 220)
$lineas += 'Solo se enviaron GET (y el POST de login). Pruebas de escritura y de rol sin privilegios (403): NO EJECUTADAS en esta version. ADVERTENCIA = no aprobada; verificar si la ruta existe / requiere parametros.'
foreach ($l in $lineas) { Write-Host $l }
$lineas | Set-Content -Path $Informe -Encoding UTF8
Write-Host "Informe guardado en $Informe" -ForegroundColor Cyan
$t = $null
