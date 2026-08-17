# Ajusta el descriptor de seguridad (SDDL) de la Scheduled Task "QCCUpdaterElevado" para que un
# usuario normal pueda dispararla (schtasks /Run) sin poder modificarla/borrarla. Se ejecuta desde
# installers/QualityControlCenter.iss (seccion [Code], procedimiento RegisterUpdaterTask) justo
# despues de registrar la tarea con schtasks /Create.
#
# A diferencia del intento anterior (comando inline en [Run] con "try {...} catch {}; exit 0"),
# este script SIEMPRE deja constancia en un log real -- exito o fallo -- y verifica leyendo de
# vuelta el SDDL ya aplicado, en vez de asumir que SetSecurityDescriptor funciono. No traga
# errores en silencio: si algo falla, el log lo dice y el proceso termina con exit code 1 para que
# el instalador (ver [Code]) pueda mostrarlo explicitamente.

$ErrorActionPreference = "Stop"

$TaskName = "QCCUpdaterElevado"
$Sddl = "D:P(A;;GA;;;SY)(A;;GA;;;BA)(A;;GRGX;;;BU)"
$LogDir = "C:\ProgramData\QualityControlCenter\Logs\Updater"

function Write-Log([string]$Message) {
    $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
    Write-Host $line
    try {
        New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
        Add-Content -Path (Join-Path $LogDir "installer-sddl-$(Get-Date -Format 'yyyyMMdd').log") -Value $line -Encoding UTF8
    } catch {
        Write-Host "(no se pudo escribir el log: $($_.Exception.Message))"
    }
}

try {
    Write-Log "Iniciando ajuste de SDDL para la tarea '$TaskName'."

    $svc = New-Object -ComObject "Schedule.Service"
    $svc.Connect()
    $folder = $svc.GetFolder("\")
    $task = $folder.GetTask($TaskName)

    if ($null -eq $task) {
        throw "No se encontro la tarea '$TaskName' en el Task Scheduler (deberia haberse creado antes via schtasks /Create)."
    }

    $sddlAntes = $task.GetSecurityDescriptor(4)
    Write-Log "SDDL antes del cambio: $sddlAntes"

    $task.SetSecurityDescriptor($Sddl, 0)

    $sddlDespues = $task.GetSecurityDescriptor(4)
    Write-Log "SDDL despues del cambio: $sddlDespues"

    if ($sddlDespues -notmatch "BU") {
        throw "El SDDL aplicado no contiene una ACE para BUILTIN\Usuarios (BU) -- la tarea quedo creada pero un usuario normal probablemente no podra dispararla. SDDL resultante: $sddlDespues"
    }

    Write-Log "SDDL aplicado y verificado correctamente (ACE de BUILTIN\Usuarios presente)."
    exit 0
}
catch {
    Write-Log "ERROR aplicando SDDL a '$TaskName': $($_.Exception.Message)"
    exit 1
}
