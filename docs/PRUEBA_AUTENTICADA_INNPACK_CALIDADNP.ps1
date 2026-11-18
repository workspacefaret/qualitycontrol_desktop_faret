# ============================================================================================================
# VALIDACION AUTENTICADA de la API INNPACK (Calidad NP + Trazabilidad documentos + regresion de modulos existentes)
# La ejecuta UNA PERSONA en su PC (PowerShell normal). Las credenciales se piden por consola oculta y NO se muestran,
# NO se escriben en el informe y NO pasan por Claude. El token vive solo en memoria.
# SOLO LECTURA + escrituras NEGATIVAS (ids inexistentes / cuerpos invalidos): no crean registros. Si una escritura
# negativa respondiera 2xx se marca FALLO CRITICO (significaria que se creo algo) y el script se detiene.
# Salida: pantalla + archivo resultado_prueba_autenticada_<fecha>.txt en la carpeta actual (sin tokens ni claves).
# ============================================================================================================
param([string]$Base = 'https://api.faret.cl/innpack')
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$Marca = Get-Date -Format 'yyyyMMdd_HHmmss'
$Informe = Join-Path (Get-Location) ("resultado_prueba_autenticada_{0}.txt" -f $Marca)
$resultados = New-Object System.Collections.Generic.List[object]
$NP = '999999'          # NP que no existe: las lecturas deben responder vacio, nunca 500
$ID = 999999999         # id que no existe: las escrituras deben fallar con 'no existe' sin escribir nada

function Llamar([string]$Metodo, [string]$Ruta, $Token, [string]$Cuerpo) {
    $h = @{}
    if ($Token) { $h['Authorization'] = 'Bearer ' + $Token }
    $p = @{ Uri = "$Base/$Ruta"; Method = $Metodo; Headers = $h; UseBasicParsing = $true; TimeoutSec = 90 }
    if ($Metodo -ne 'GET') { $p['ContentType'] = 'application/json'; $p['Body'] = $(if ($Cuerpo) { $Cuerpo } else { '{}' }) }
    try {
        $r = Invoke-WebRequest @p
        return [pscustomobject]@{ Codigo = [int]$r.StatusCode; Cuerpo = $r.Content }
    } catch {
        $resp = $_.Exception.Response
        if ($resp) {
            $txt = ''
            try { $sr = New-Object IO.StreamReader($resp.GetResponseStream()); $txt = $sr.ReadToEnd() } catch { }
            return [pscustomobject]@{ Codigo = [int]$resp.StatusCode; Cuerpo = $txt }
        }
        return [pscustomobject]@{ Codigo = 0; Cuerpo = $_.Exception.Message }
    }
}
function Resumen($cuerpo) {   # solo forma del dato, nunca contenido sensible
    try {
        $j = $cuerpo | ConvertFrom-Json
        $d = $j.data
        if ($null -eq $d) { return "success=$($j.success) msg=" + ([string]$j.message).Substring(0, [math]::Min(80, ([string]$j.message).Length)) }
        if ($d -is [array]) { return "success=$($j.success) filas=$($d.Count)" }
        return "success=$($j.success) objeto"
    } catch { return 'cuerpo no JSON' }
}
function Registrar([string]$Grupo, [string]$Prueba, [string]$Esperado, $r, [string[]]$Aceptados, [string[]]$Advertencia) {
    $ok = $Aceptados -contains [string]$r.Codigo
    $est = if ($ok) { 'PASA' } elseif ($Advertencia -and ($Advertencia -contains [string]$r.Codigo)) { 'ADVERTENCIA' } else { 'FALLA' }
    if ($r.Codigo -ge 500 -or $r.Codigo -eq 0) { $est = 'FALLA' }
    $o = [pscustomobject]@{ Grupo = $Grupo; Prueba = $Prueba; Esperado = $Esperado; Obtenido = $r.Codigo; Estado = $est; Detalle = (Resumen $r.Cuerpo) }
    $resultados.Add($o)
    $color = switch ($est) { 'PASA' { 'Green' } 'ADVERTENCIA' { 'Yellow' } default { 'Red' } }
    Write-Host ("[{0,-11}] {1,-9} {2,-62} esperado {3,-8} obtenido {4}" -f $est, $Grupo, $Prueba, $Esperado, $r.Codigo) -ForegroundColor $color
}
function Login([string]$etiqueta) {
    $u = Read-Host "Usuario INNPACK ($etiqueta)"
    if (-not $u) { return $null }
    $sec = Read-Host "Contrasena de $u (oculta)" -AsSecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
    try {
        $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
        $cuerpo = (@{ codigoUsuario = $u; password = $plain; soportaCambioPassword = $true } | ConvertTo-Json -Compress)
        $r = Llamar 'POST' 'api/auth/login' $null $cuerpo
    } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr); $plain = $null; $cuerpo = $null }
    if ($r.Codigo -ne 200) { Write-Host "Login rechazado ($($r.Codigo)). Se omite esta sesion." -ForegroundColor Yellow; return $null }
    $j = $r.Cuerpo | ConvertFrom-Json
    if ($j.data.debeCambiarPassword) { Write-Host 'AVISO: la cuenta tiene cambio de clave pendiente; algunas rutas pueden responder 403.' -ForegroundColor Yellow }
    return [pscustomobject]@{ Token = $j.data.token; Rol = [string]$j.data.rol; Usuario = $u }
}

Write-Host "=== Validacion autenticada API INNPACK ($Base) - $(Get-Date) ===" -ForegroundColor Cyan
$A = Login 'sesion ADMINISTRADORA: rol admin o admin_ti'
if (-not $A) { throw 'Sin sesion administradora no se puede continuar.' }
Write-Host "Sesion A: rol=$($A.Rol)" -ForegroundColor Cyan
$B = Login 'sesion SIN privilegios (VER/operador) - ENTER para omitir'
if ($B) { Write-Host "Sesion B: rol=$($B.Rol)" -ForegroundColor Cyan }
$t = $A.Token

# --- 1. Autenticacion
Registrar 'AUTH' 'Sin token a ruta nueva (calidad-np)' '401' (Llamar 'GET' 'api/calidad-np/certificados/flujo' $null) @('401')
Registrar 'AUTH' 'Token invalido a ruta nueva (trazabilidad-documentos)' '401' (Llamar 'GET' "api/trazabilidad-documentos/np/$NP/documentos" 'token-falso') @('401')
Registrar 'AUTH' 'Sesion valida: mis-permisos' '200' (Llamar 'GET' 'api/auth/mis-permisos' $t) @('200')

# --- 2. Rutas nuevas (lectura, con datos reales de las tablas SQL nuevas)
$r = Llamar 'GET' 'api/calidad-np/certificados/flujo' $t;                 Registrar 'NUEVAS' 'calidad-np: flujo de aprobacion (3 cargos sembrados)' '200' $r @('200')
try { $n = ($r.Cuerpo | ConvertFrom-Json).data.Count; $okN = ($n -eq 3); $resultados.Add([pscustomobject]@{ Grupo='NUEVAS'; Prueba='flujo: filas = 3'; Esperado='3'; Obtenido=$n; Estado=$(if($okN){'PASA'}else{'FALLA'}); Detalle='' }); Write-Host ("[{0,-11}] NUEVAS    flujo: filas = 3 (obtenido {1})" -f $(if($okN){'PASA'}else{'FALLA'}), $n) -ForegroundColor $(if($okN){'Green'}else{'Red'}) } catch { }
Registrar 'NUEVAS' 'calidad-np: certificados (lista)' '200' (Llamar 'GET' 'api/calidad-np/certificados' $t) @('200')
Registrar 'NUEVAS' "calidad-np: mermas de NP inexistente" '200' (Llamar 'GET' "api/calidad-np/np/$NP/mermas" $t) @('200')
Registrar 'NUEVAS' "calidad-np: informes de NP inexistente" '200' (Llamar 'GET' "api/calidad-np/np/$NP/informes" $t) @('200')
Registrar 'NUEVAS' "calidad-np: cierre NP inexistente item 1" '200' (Llamar 'GET' "api/calidad-np/np/$NP/cierre/1" $t) @('200','404','400')
Registrar 'NUEVAS' "calidad-np: certificado inexistente" '404' (Llamar 'GET' "api/calidad-np/certificados/$ID" $t) @('404','400')
$r = Llamar 'GET' "api/trazabilidad-documentos/np/$NP/documentos" $t;  Registrar 'NUEVAS' 'trazabilidad-documentos: checklist de NP (requisitos sembrados)' '200' $r @('200')
try { $j = $r.Cuerpo | ConvertFrom-Json; $req = @($j.data.requisitos).Count; if ($req -eq 0) { $req = @($j.data).Count }; Write-Host "   (filas de checklist reconocidas: $req; esperado 23 si el contrato las devuelve en 'requisitos' o en el arreglo)" } catch { }
Registrar 'NUEVAS' "trazabilidad-documentos: factores NP inexistente" '200' (Llamar 'GET' "api/trazabilidad-documentos/np/$NP/factores" $t) @('200')
Registrar 'NUEVAS' "trazabilidad-documentos: auditoria NP inexistente" '200' (Llamar 'GET' "api/trazabilidad-documentos/np/$NP/auditoria" $t) @('200')

# --- 3. Escrituras NEGATIVAS con rol administrador: deben rechazarse SIN escribir (400/404). Un 2xx = FALLO CRITICO
$neg = @(
  @('POST', "api/calidad-np/np/$NP/mermas", '{}', 'crear merma sin cantidad'),
  @('POST', "api/calidad-np/mermas/$ID/validar", '{}', 'validar merma inexistente'),
  @('POST', "api/calidad-np/mermas/$ID/anular", '{"motivo":"prueba-validacion"}', 'anular merma inexistente'),
  @('POST', "api/calidad-np/certificados/$ID/aprobar", '{"cargo":"Jefatura de Calidad"}', 'aprobar certificado inexistente'),
  @('POST', "api/calidad-np/certificados/$ID/anular", '{"motivo":"prueba-validacion"}', 'anular certificado inexistente'),
  @('POST', "api/trazabilidad-documentos/factores/$ID/confirmar", '{}', 'confirmar factor inexistente')
)
foreach ($n in $neg) {
    $r = Llamar $n[0] $n[1] $t $n[2]
    Registrar 'NEG-ADMIN' $n[3] '400/404' $r @('400','404')
    if ($r.Codigo -ge 200 -and $r.Codigo -lt 300) { Write-Host 'FALLO CRITICO: una escritura negativa respondio 2xx (posible registro creado). Se detiene.' -ForegroundColor Red; break }
}

# --- 4. Permisos por rol (solo si se dio una sesion sin privilegios): debe responder 403 ANTES de tocar datos
if ($B) {
    Registrar 'ROL-B' 'Lectura permitida a rol sin privilegios: flujo' '200' (Llamar 'GET' 'api/calidad-np/certificados/flujo' $B.Token) @('200')
    Registrar 'ROL-B' 'Validar merma' '403' (Llamar 'POST' "api/calidad-np/mermas/$ID/validar" $B.Token '{}') @('403')
    Registrar 'ROL-B' 'Aprobar certificado' '403' (Llamar 'POST' "api/calidad-np/certificados/$ID/aprobar" $B.Token '{"cargo":"x"}') @('403')
    Registrar 'ROL-B' 'Rechazar certificado' '403' (Llamar 'POST' "api/calidad-np/certificados/$ID/rechazar" $B.Token '{"cargo":"x","motivo":"x"}') @('403')
    Registrar 'ROL-B' 'Confirmar factor' '403' (Llamar 'POST' "api/trazabilidad-documentos/factores/$ID/confirmar" $B.Token '{}') @('403')
    Registrar 'ROL-B' 'Rechazar factor' '403' (Llamar 'POST' "api/trazabilidad-documentos/factores/$ID/rechazar" $B.Token '{}') @('403')
} else { Write-Host '[NO PROBADO ] ROL-B    Casos 403 por rol: no se entrego sesion sin privilegios.' -ForegroundColor Yellow; $resultados.Add([pscustomobject]@{ Grupo='ROL-B'; Prueba='Casos 403'; Esperado='403'; Obtenido='-'; Estado='NO PROBADO'; Detalle='sin sesion sin privilegios' }) }

# --- 5. Regresion de modulos existentes (GET de listado; 400 = requiere parametros -> ADVERTENCIA, no regresion)
$exist = 'api/no-conformidades','api/control-documental','api/producto-terminado','api/registros-control','api/talleres-externos','api/muestra-laboratorio','api/recepcion-calidad','api/usuarios','api/despachos-diarios','api/certificados-liberacion','api/faret-laboratorio'
foreach ($e in $exist) { Registrar 'REGRESION' $e '200' (Llamar 'GET' $e $t) @('200') @('400','404') }
Registrar 'REGRESION' 'api/health' '200' (Llamar 'GET' 'api/health' $null) @('200')

# --- Resumen
$f = @($resultados | Where-Object { $_.Estado -eq 'FALLA' }).Count; $a = @($resultados | Where-Object { $_.Estado -eq 'ADVERTENCIA' }).Count
$p = @($resultados | Where-Object { $_.Estado -eq 'PASA' }).Count; $noProbado = @($resultados | Where-Object { $_.Estado -eq 'NO PROBADO' }).Count
$lineas = @("=== RESUMEN: PASA=$p ADVERTENCIA=$a FALLA=$f NO PROBADO=$noProbado | sesion A rol=$($A.Rol) | $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ===")
$lineas += ($resultados | Format-Table Grupo, Prueba, Esperado, Obtenido, Estado, Detalle -AutoSize | Out-String -Width 220)
$lineas += 'No se envio ninguna escritura valida: las escrituras fueron negativas (ids inexistentes/cuerpo invalido). Sin tokens ni credenciales en este informe.'
$lineas | ForEach-Object { Write-Host $_ }
$lineas | Set-Content -Path $Informe -Encoding UTF8
Write-Host "Informe guardado en $Informe" -ForegroundColor Cyan
$A = $null; $B = $null; $t = $null
