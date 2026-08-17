using System.Diagnostics;

namespace QCC.Updater;

// Etapa 4: ejecuta el instalador ya promovido y revalidado en Staging. Esta clase NO decide si
// corresponde instalar (esa condición — EsSystem=True — vive en Program.cs, igual que el gate de
// promoción de Etapa 3); asume que quien la invoca ya verificó el contexto correcto.
//
// Reglas duras, todas verificadas antes de cualquier Process.Start:
// - Se revalida el paquete en Staging INMEDIATAMENTE antes de ejecutar (nunca se confía en la
//   promoción hecha en un paso anterior, por reciente que sea).
// - La ruta ejecutada es siempre la que devuelve esa revalidación (PackageValidator ya la
//   canonicalizó y confirmó dentro de Staging) — nunca una ruta armada a mano ni provista por el
//   manifiesto directamente.
// - Los argumentos del instalador son un literal fijo en el código — nunca provienen del
//   manifiesto ni de ningún dato externo.
// - UseShellExecute=false y FileName apunta directo al .exe: no hay cmd.exe, PowerShell ni
//   ningún shell de por medio.
// - Esta etapa NO relanza QualityControlCenter.exe bajo ningún resultado (éxito o fallo) — eso
//   queda para la etapa del relanzador no elevado, justamente para que QCC nunca termine
//   corriendo como SYSTEM.
// - Nunca se borra Staging acá, pase lo que pase — el resultado (éxito o fallo) se conoce recién
//   al final, y en caso de fallo esos mismos archivos son la evidencia para diagnosticar.
public static class InstallerRunner
{
    private const string NombreProcesoQcc = "QualityControlCenter";
    private static readonly TimeSpan TimeoutEsperaCierrePorDefecto = TimeSpan.FromSeconds(60);
    private static readonly TimeSpan IntervaloPolling = TimeSpan.FromSeconds(1);

    // Mismo directorio fijo que usa Program.cs (LogDir) para sus propios logs — duplicado acá a
    // propósito, mismo criterio que el resto del proyecto (no hay ensamblado en común entre
    // QCC.Updater y la app principal, y esta ruta tampoco se comparte vía uno propio): un valor
    // fijo duplicado es más simple y auditable que introducir un acoplamiento nuevo.
    private const string LogDir = @"C:\ProgramData\QualityControlCenter\Logs\Updater";

    // Switches confirmados contra installers/QualityControlCenter.iss real: script Inno Setup
    // estándar, sin [Code] ni páginas de asistente propias. El [Run] tiene
    // "Flags: nowait postinstall skipifsilent" — con /VERYSILENT ese Run NUNCA se dispara (es
    // justo lo que se necesita: el instalador no debe intentar abrir QCC en esta etapa). Se suma
    // /LOG con el RunId en el nombre (ver contex.md Paso 59, investigación del exit code 5) para
    // poder diagnosticar fallos reales de Inno sin adivinar — antes no había ningún log nativo de
    // Inno disponible.
    private static string ArgumentosInstalacionSilenciosa(string logPath) =>
        $"/VERYSILENT /SUPPRESSMSGBOXES /NORESTART /LOG=\"{logPath}\"";

    public static InstallResult Instalar(string stagingDir, Action<string> log, string? runId = null, TimeSpan? timeoutEsperaCierre = null)
    {
        // 1-3. Detectar/esperar el cierre de QualityControlCenter.exe. Nunca se lo mata — si no
        // cierra dentro del timeout, se aborta sin instalar.
        var espera = EsperarCierreQcc(log, timeoutEsperaCierre ?? TimeoutEsperaCierrePorDefecto);
        if (!espera.Cerrado)
        {
            return InstallResult.Fallo($"QualityControlCenter.exe seguía en ejecución tras el timeout de espera — no se instala. {espera.Detalle}");
        }

        // Revalidación final, inmediatamente antes de ejecutar: manifest válido + ruta válida +
        // archivo dentro de Staging + nombre permitido + SHA-256 correcto — las mismas barreras
        // de PackageValidator, nunca se reutiliza un resultado de un paso anterior.
        var manifestPath = Path.Combine(stagingDir, "manifest.json");
        var validacion = PackageValidator.Validar(stagingDir, manifestPath);
        if (!validacion.Aceptado || validacion.RutaValidada == null)
        {
            return InstallResult.Fallo($"Revalidación final antes de instalar fue rechazada: {validacion.Motivo}");
        }

        // Nombre del log de Inno: incluye el RunId cuando está disponible (correlaciona 1:1 con
        // el intento real); si no vino (manifest viejo sin ese campo), usa un sufijo genérico en
        // vez de fallar — el log sigue siendo útil aunque no se pueda correlacionar por RunId.
        var sufijoLog = string.IsNullOrWhiteSpace(runId) ? "sin-runid" : runId;
        var innoLogPath = Path.Combine(LogDir, $"inno-{sufijoLog}.log");

        try
        {
            Directory.CreateDirectory(LogDir);
        }
        catch
        {
            // Mejor esfuerzo — si no se puede crear el directorio, Inno igual intentará escribir
            // el log y fallará solo, sin bloquear la instalación por esto.
        }

        var argumentos = ArgumentosInstalacionSilenciosa(innoLogPath);

        var inicio = DateTime.Now;
        log(
            $"[{inicio:yyyy-MM-dd HH:mm:ss}] Iniciando instalación — "
                + $"instalador={validacion.RutaValidada} versión={validacion.Version} "
                + $"argumentos=\"{argumentos}\""
        );

        int exitCode;
        string salidaCapturada;
        try
        {
            var psi = new ProcessStartInfo
            {
                FileName = validacion.RutaValidada,
                Arguments = argumentos,
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
            };

            using var proceso = Process.Start(psi);
            if (proceso == null)
            {
                // Requisito explícito: Process.Start "funcionando" no es éxito. Acá ni siquiera
                // devolvió un proceso, así que es un fallo directo, sin exit code.
                return InstallResult.Fallo("Process.Start no devolvió un proceso — el instalador no se pudo iniciar.");
            }

            var stdout = proceso.StandardOutput.ReadToEndAsync();
            var stderr = proceso.StandardError.ReadToEndAsync();
            proceso.WaitForExit();
            exitCode = proceso.ExitCode;
            salidaCapturada = (stdout.Result + stderr.Result).Trim();
        }
        catch (Exception ex)
        {
            return InstallResult.Fallo($"Excepción al ejecutar el instalador: {ex.Message}");
        }

        var duracion = DateTime.Now - inicio;

        // El único criterio de éxito es el exit code real tras esperar a que el proceso termine
        // — nunca el hecho de que Process.Start no haya lanzado una excepción.
        if (exitCode != 0)
        {
            var detalle = string.IsNullOrWhiteSpace(salidaCapturada) ? "(sin salida capturada)" : Truncar(salidaCapturada, 500);
            return InstallResult.Fallo(
                $"El instalador terminó con exit code {exitCode} (se esperaba 0). Salida: {detalle}. Log de Inno: {innoLogPath}",
                exitCode,
                duracion
            );
        }

        return InstallResult.Exito(exitCode, duracion);
    }

    private static (bool Cerrado, string Detalle) EsperarCierreQcc(Action<string> log, TimeSpan timeout)
    {
        var inicio = DateTime.Now;

        if (!SigueCorriendo())
        {
            log($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] QualityControlCenter.exe no está en ejecución — se procede sin esperar.");
            return (true, "No estaba en ejecución.");
        }

        log(
            $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] QualityControlCenter.exe en ejecución — esperando cierre "
                + $"(timeout {timeout.TotalSeconds:0}s). No se fuerza el cierre en ningún momento."
        );

        while (DateTime.Now - inicio < timeout)
        {
            Thread.Sleep(IntervaloPolling);
            if (!SigueCorriendo())
            {
                var segundos = (DateTime.Now - inicio).TotalSeconds;
                log($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] QualityControlCenter.exe cerró tras {segundos:0}s de espera.");
                return (true, "Cerró dentro del timeout.");
            }
        }

        log($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] Timeout esperando el cierre de QualityControlCenter.exe (sin forzar el cierre).");
        return (false, $"Timeout de {timeout.TotalSeconds:0}s agotado.");
    }

    private static bool SigueCorriendo()
    {
        var procesos = Process.GetProcessesByName(NombreProcesoQcc);
        var corriendo = procesos.Length > 0;
        foreach (var p in procesos)
            p.Dispose();
        return corriendo;
    }

    private static string Truncar(string texto, int maxLength) => texto.Length <= maxLength ? texto : texto[..maxLength] + "…";
}

public record InstallResult(bool Exitoso, string Motivo, int? ExitCode = null, TimeSpan? Duracion = null)
{
    public static InstallResult Exito(int exitCode, TimeSpan duracion) =>
        new(true, "Instalación completada correctamente.", exitCode, duracion);

    public static InstallResult Fallo(string motivo, int? exitCode = null, TimeSpan? duracion = null) => new(false, motivo, exitCode, duracion);
}
