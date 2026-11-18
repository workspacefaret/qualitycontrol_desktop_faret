# Despliegue fps-api — Trazabilidad integral Fase 1a (INNPACK)

Preparado el 17-11-2026. **No ejecutado: requiere autorización expresa.** Base: `docs/OPERACION_DESPLIEGUE_QCC.md` §7.
Cambio **solo aditivo**: 2 rutas nuevas `GET /api/produccion/trazabilidad/np` y `/trazabilidad/lote` (detrás de `apiKeyAuth`). Sin dependencias nuevas, sin variables de entorno nuevas, sin SQL.

## Paquete

Carpeta: `C:\Users\dcarrasco\Desktop\Proyectos\fps-api\paquete_trazabilidad_fase1a_20261117\` (manifiesto `MANIFIESTO_SHA256.txt`).

| Archivo a desplegar | SHA-256 nuevo | SHA-256 producción actual |
|---|---|---|
| `src\server.js` (modificado: +1 `require`, +1 `app.use`) | `BE52A6A57B7B61069EC3EAE9D1C7FA08F7D1808687AE544C2278E28E06DE433A` | `C2B0CAAF2C56FFD44B3BA97FBE67C584320850B258995408DBA395DD124D9D74` |
| `src\services\trazabilidad.service.js` (nuevo) | `C3429E29674203F6F2BEDE730A041B90A65DD739C6148EF1A246D5EAB238CCA6` | no existe |
| `src\routes\trazabilidad.routes.js` (nuevo) | `13B8215A26C7AA35119078200F47BFD8899A455EE183DE6DD61D605296DBDC95` | no existe |

Si al desplegar el hash actual de `server.js` en producción es distinto del indicado, **detenerse** (alguien cambió producción).
Verificado el 17-11-2026: los 15 `.js` de `src` en producción son idénticos al respaldo local `fps-api\respaldo_pre_trazabilidad_20261117\`. `package.json` y `tests\` (en `referencia_no_desplegar\`) **no** se despliegan.

## Procedimiento (una persona autorizada, PowerShell, una línea por orden)

```
$s = New-PSSession -ComputerName SRV-API.ad.faret.cl
$pkg = 'C:\Users\dcarrasco\Desktop\Proyectos\fps-api\paquete_trazabilidad_fase1a_20261117'
$ts = Get-Date -Format yyyyMMdd_HHmmss
```
1. Precheck: `Invoke-Command $s { (Get-FileHash 'C:\API WEB\api\fps-api\src\server.js').Hash; Test-Path 'C:\API WEB\api\fps-api\src\routes\trazabilidad.routes.js' }` → hash = `C2B0CAAF…1CC5` y `False`.
2. Respaldo: `Invoke-Command $s { param($t) $b="C:\API WEB\_backups\fps-api_pre_trazabilidad_$t"; New-Item -ItemType Directory "$b\src","$b\nuevo\src\services","$b\nuevo\src\routes" | Out-Null; Copy-Item 'C:\API WEB\api\fps-api\src\server.js' "$b\src\server.js"; (Get-FileHash "$b\src\server.js").Hash } -ArgumentList $ts`
3. Subir a `nuevo\`: `Copy-Item "$pkg\src\server.js" "C:\API WEB\_backups\fps-api_pre_trazabilidad_$ts\nuevo\src\server.js" -ToSession $s` (ídem `services\trazabilidad.service.js` y `routes\trazabilidad.routes.js`) y comparar los 3 hashes con el manifiesto.
4. Corte (~20 s): `Invoke-Command $s { Stop-ScheduledTask -TaskName FpsApi; Start-Sleep 3; Get-NetTCPConnection -LocalPort 3002 -State Listen -ErrorAction SilentlyContinue }` (debe quedar vacío) → `Invoke-Command $s { param($t) Copy-Item "C:\API WEB\_backups\fps-api_pre_trazabilidad_$t\nuevo\src\*" 'C:\API WEB\api\fps-api\src\' -Recurse; Start-ScheduledTask -TaskName FpsApi } -ArgumentList $ts`
5. Verificar: hashes en destino = manifiesto; `https://api.faret.cl/fps/api/health` = 200 (502 normal durante ~8–20 s; Node a veces tarda hasta ~75 s en abrir el puerto); puerto 3002 con PID nuevo.
6. `Remove-PSSession $s`.

**Nunca** `taskkill /IM node.exe` ni los `.bat` antiguos.

## Reversión

`Stop-ScheduledTask FpsApi` → copiar `C:\API WEB\_backups\fps-api_pre_trazabilidad_<ts>\src\server.js` sobre `src\server.js` y borrar `src\services\trazabilidad.service.js` y `src\routes\trazabilidad.routes.js` → `Start-ScheduledTask FpsApi` → health 200. Los endpoints existentes no dependen de los archivos nuevos.

## Pruebas después del despliegue

1. **Regresión (sin clave):** health 200; `GET /api/produccion/trazabilidad/np?np=4007` sin `x-api-key` → 401.
2. **Autenticada (la ejecuta una persona con `!`; lee la clave en el servidor, no la muestra):**
```
! powershell -NoProfile -Command "Invoke-Command -ComputerName SRV-API.ad.faret.cl -ScriptBlock { $k=((Get-Content 'C:\API WEB\api\fps-api\.env' | Where-Object {$_ -match '^API_KEY='} | Select-Object -First 1) -replace '^API_KEY=','').Trim().Trim('\"'); foreach($p in '/trazabilidad/np?np=4007','/trazabilidad/np?np=3951','/trazabilidad/np?np=4002','/trazabilidad/np?np=4128','/trazabilidad/lote?lote=5433-1','/trazabilidad/np?np=abc','/procesos-por-np/22924','/laboratorio/registros?np=4062'){ $w=[Diagnostics.Stopwatch]::StartNew(); try{ $r=Invoke-WebRequest -UseBasicParsing -Headers @{'x-api-key'=$k} -Uri ('http://localhost:3002/api/produccion'+$p) -TimeoutSec 60; $j=$r.Content | ConvertFrom-Json; $f=''; if($j.data.fuentes){ $f=($j.data.fuentes.PSObject.Properties | ForEach-Object { $_.Name+'='+$_.Value.ok }) -join ',' }; $p+' -> '+$r.StatusCode+' ms='+$w.ElapsedMilliseconds+' len='+$r.Content.Length+' '+$f }catch{ $p+' -> '+[int]$_.Exception.Response.StatusCode+' ms='+$w.ElapsedMilliseconds } } }"
```
   Esperado: NP 4007/3951/4002/4128 → 200 con todas las fuentes `True` y **ms < 18000**; lote → 200; `np=abc` → 400; las dos rutas antiguas → 200.
3. **En la app** (instalador 1.8.36): Trazabilidad → NP 3951, 4002, 4007, 4128 y lote 5433-1; comparar contra `docs/FASE1A_GUIA_VALIDACION_CALIDAD_20261117.md`; exportar Excel. Revisar que Inicio, Laboratorio - Muestras, Producto Terminado, Despachos y los módulos Faret abran sin errores.
