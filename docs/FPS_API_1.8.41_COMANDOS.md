# fps-api 1.8.41: respaldo, actualización y recuperación (ejecuta TI)

26-11-2026. Comandos **no ejecutados por Claude**. Requieren autorización del responsable (`.claude/DEPLOY_POLICY.md`).
Pegar bloque por bloque en **una misma ventana** de PowerShell del equipo que tiene el paquete, revisando cada salida.
Ante un error o alerta de seguridad: detenerse. No usar `taskkill`. No requiere SQL ni cambios en `.env`.
Solo cambian dos archivos y solo se reinicia la tarea `FpsApi`. `apisapfaret` no se toca.

## 0. Antes (línea base)

En la app vigente, anotar para 2 o 3 NP (una con factura de reserva) solicitado, liberado, despachado y consumos, y
cuánto tarda la consulta. Elegir una ventana sin usuarios de Trazabilidad, Laboratorio ni Talleres Externos.

## 1. Sesión, paquete y control de que producción no cambió

```powershell
$ErrorActionPreference = 'Stop'
$pkg  = 'C:\Users\dcarrasco\Desktop\Proyectos\_releases\qcc_1.8.41\fps-api\src'
$prod = @{ 'services\trazabilidad.service.js' = '6AA23A83847DB02B2309E0CEB46D8B37286D8EECB73979002A8D595D779CA7F8'
           'routes\trazabilidad.routes.js'    = '13B8215A26C7AA35119078200F47BFD8899A455EE183DE6DD61D605296DBDC95' }
$new  = @{ 'services\trazabilidad.service.js' = '9DF4FF9973341CFF5D941D3974523C6CB22BB554E7E342401E08293E3AEB87B3'
           'routes\trazabilidad.routes.js'    = '561F30ADB6518A51A3E26BE2112D047CC2063FA3AC0BA0B1BC0C49E637B22286' }
foreach ($f in $new.Keys) { if ((Get-FileHash (Join-Path $pkg $f)).Hash -ne $new[$f]) { throw "Paquete distinto: $f" } }
$s  = New-PSSession -ComputerName SRV-API.ad.faret.cl
$bk = "C:\API WEB\_backups\fps-api_pre_calidadnp_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
$bk
Invoke-Command -Session $s -ArgumentList $prod -ScriptBlock { param($h) $ErrorActionPreference = 'Stop'
  foreach ($f in $h.Keys) { $x = (Get-FileHash "C:\API WEB\api\fps-api\src\$f").Hash; "$f $x"
    if ($x -ne $h[$f]) { throw "Produccion cambio: $f. DETENER" } } }
```

**Anotar el valor de `$bk`.**

## 2. Respaldo

```powershell
Invoke-Command -Session $s -ArgumentList $bk, $prod -ScriptBlock { param($bk, $h) $ErrorActionPreference = 'Stop'
  foreach ($f in $h.Keys) {
    New-Item -ItemType Directory -Force (Split-Path "$bk\src\$f"), (Split-Path "$bk\nuevo\$f") | Out-Null
    Copy-Item "C:\API WEB\api\fps-api\src\$f" "$bk\src\$f"
    if ((Get-FileHash "$bk\src\$f").Hash -ne $h[$f]) { throw "Respaldo invalido: $f" } }
  "Respaldo verificado: $bk" }
```

## 3. Transferencia (todavía sin efecto)

```powershell
foreach ($f in $new.Keys) { Copy-Item -Path (Join-Path $pkg $f) -Destination "$bk\nuevo\$f" -ToSession $s }
Invoke-Command -Session $s -ArgumentList $bk, $new -ScriptBlock { param($bk, $h) $ErrorActionPreference = 'Stop'
  foreach ($f in $h.Keys) { if ((Get-FileHash "$bk\nuevo\$f").Hash -ne $h[$f]) { throw "Transferencia invalida: $f" } }
  "Transferencia verificada" }
```

## 4. Detener, reemplazar e iniciar

Detener. Si el puerto no queda libre, **no copiar**: revisar la causa.

```powershell
Invoke-Command -Session $s -ScriptBlock { $ErrorActionPreference = 'Stop'
  Stop-ScheduledTask -TaskName 'FpsApi'
  foreach ($i in 1..30) { if (-not (Get-NetTCPConnection -LocalPort 3002 -State Listen -ErrorAction SilentlyContinue)) { break }; Start-Sleep 1 }
  if (Get-NetTCPConnection -LocalPort 3002 -State Listen -ErrorAction SilentlyContinue) { throw 'Puerto 3002 ocupado: DETENER' }
  'FpsApi detenida' }
```

Reemplazar. Si falla, ir a **Recuperación**.

```powershell
Invoke-Command -Session $s -ArgumentList $bk, $new -ScriptBlock { param($bk, $h) $ErrorActionPreference = 'Stop'
  if (Get-NetTCPConnection -LocalPort 3002 -State Listen -ErrorAction SilentlyContinue) { throw 'FpsApi sigue activa' }
  foreach ($f in $h.Keys) { Copy-Item "$bk\nuevo\$f" "C:\API WEB\api\fps-api\src\$f" -Force
    if ((Get-FileHash "C:\API WEB\api\fps-api\src\$f").Hash -ne $h[$f]) { throw "Copia invalida: $f" } }
  'Archivos nuevos verificados' }
```

Iniciar y esperar hasta tres minutos (el puerto puede tardar más de un minuto; un 502 transitorio es normal).

```powershell
Invoke-Command -Session $s -ScriptBlock { Start-ScheduledTask -TaskName 'FpsApi' }
$ok = $false
foreach ($i in 1..36) { try { if ((Invoke-WebRequest 'https://api.faret.cl/fps/api/health' -UseBasicParsing -TimeoutSec 10).StatusCode -eq 200) { $ok = $true; break } } catch { }; Start-Sleep 5 }
"health 200: $ok"
Invoke-Command -Session $s -ScriptBlock { $c = Get-NetTCPConnection -LocalPort 3002 -State Listen; Get-Process -Id $c.OwningProcess | Select-Object Id, StartTime }
```

Debe verse `health 200: True` y un proceso con hora de inicio nueva. Si no, **Recuperación**.

## Recuperación

En la misma ventana. Si se perdió: repetir `$prod` del bloque 1, abrir `$s` con `New-PSSession` y asignar a `$bk` la
ruta anotada.

```powershell
Invoke-Command -Session $s -ArgumentList $bk, $prod -ScriptBlock { param($bk, $h) $ErrorActionPreference = 'Stop'
  foreach ($f in $h.Keys) { if ((Get-FileHash "$bk\src\$f").Hash -ne $h[$f]) { throw "Respaldo invalido: $f" } }
  Stop-ScheduledTask -TaskName 'FpsApi'
  foreach ($i in 1..30) { if (-not (Get-NetTCPConnection -LocalPort 3002 -State Listen -ErrorAction SilentlyContinue)) { break }; Start-Sleep 1 }
  if (Get-NetTCPConnection -LocalPort 3002 -State Listen -ErrorAction SilentlyContinue) { throw 'Puerto 3002 ocupado: DETENER' }
  foreach ($f in $h.Keys) { Copy-Item "$bk\src\$f" "C:\API WEB\api\fps-api\src\$f" -Force
    if ((Get-FileHash "C:\API WEB\api\fps-api\src\$f").Hash -ne $h[$f]) { throw "Restauracion invalida: $f" } }
  Start-ScheduledTask -TaskName 'FpsApi'
  'Version anterior restaurada' }
```

Repetir la comprobación de `health` del bloque 4. Al terminar: `Remove-PSSession $s`.

## 5. Validaciones posteriores (una persona, desde la app con su sesión)

| # | Prueba | Correcto | Si falla |
|---|---|---|---|
| 1 | `health` público | 200 | Recuperar |
| 2 | Las NP de la línea base en Trazabilidad | Mismos solicitado y liberado; tiempo similar | Recuperar si hay error o no responde a tiempo |
| 3 | Despachos y consumos SAP (ahora leen además `OINM`, `OITB`, `IGN1`) | Responden como antes; en el escritorio 1.8.41, fuentes "disponible" | **Recuperar** |
| 4 | NP con factura de reserva | Despachado incluye sus guías; puede subir o bajar respecto de la línea base. En 1.8.41, sin aviso "regla anterior" ni error de Service Layer | Recuperar si aparece el aviso. Una diferencia se contrasta con SAP antes de decidir |
| 5 | Fuentes nuevas: entradas, inventario, controles y etiquetas FPS | Disponibles | No bloquea: se ve "No disponible", nunca 0. Anotar y revisar permisos con el DBA |
| 6 | Con 1.8.41: buscar por código o cliente, buscar un lote y abrir el registro original de una corrida | Devuelven datos reales | No bloquea lo anterior; informar |
| 7 | Con 1.8.41: ZIP documental | Adjuntos de guía, factura, devolución y nota de crédito. Nota de venta y recepción quedan en `SAP/INDICE_ANEXOS_SAP.txt` como NO INCLUIDO (esperado con la `apisapfaret` actual) | Informar |
| 8 | Laboratorio (artículos de una NP) y Talleres Externos | Igual que antes | Recuperar |

Si una fuente falla, revisar el registro de la tarea sin copiar claves ni cabeceras en la evidencia.
