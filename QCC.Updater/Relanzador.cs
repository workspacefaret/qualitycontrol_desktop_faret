using System.Diagnostics;

namespace QCC.Updater;

// Etapa 5: el relanzador no elevado. Su único trabajo es esperar el resultado de una
// instalación ya disparada por la corrida SYSTEM (ver ResultadoStore) y reabrir
// QualityControlCenter.exe — nunca valida, promueve ni instala nada; esa responsabilidad
// completa sigue siendo exclusiva de PackageValidator/StagingPromoter/InstallerRunner, sin
// ningún cambio.
//
// Reabre QCC SIEMPRE al final, haya o no un resultado conocido — el usuario no debe quedarse sin
// la aplicación abierta solo porque el archivo de resultado tardó o no llegó. La ruta de QCC es
// fija y hardcodeada (la pasa el llamador, ver Program.cs), nunca proviene de Staging, del
// manifiesto ni de ningún argumento.
public static class Relanzador
{
    private static readonly TimeSpan TimeoutEsperaResultadoPorDefecto = TimeSpan.FromSeconds(120);
    private static readonly TimeSpan IntervaloPolling = TimeSpan.FromSeconds(1);

    public static RelanzadorResultado Ejecutar(
        string runId,
        bool esSystem,
        string resultsDir,
        string rutaQcc,
        Action<string> log,
        TimeSpan? timeoutEsperaResultado = null
    )
    {
        log($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] Relanzador iniciado — runId={runId} EsSystem={esSystem}");

        // Defensa en profundidad: el relanzamiento SIEMPRE debe hacerlo el proceso no elevado.
        // Si por algún motivo esto se invocara bajo SYSTEM, se rehúsa en vez de arriesgarse a
        // abrir QualityControlCenter.exe con privilegios elevados.
        if (esSystem)
        {
            log($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] RECHAZADO: el modo relanzador nunca debe correr como SYSTEM. No se relanza nada.");
            return RelanzadorResultado.Rechazado("El modo relanzador no puede ejecutarse como SYSTEM.");
        }

        var lectura = EsperarResultado(runId, resultsDir, log, timeoutEsperaResultado ?? TimeoutEsperaResultadoPorDefecto);

        if (lectura.Conocido)
        {
            var datos = lectura.Datos!;
            var lineaResultado = datos.Success
                ? $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] Resultado conocido: instalación EXITOSA (versión={datos.Version} exitCode={datos.ExitCode})."
                : $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] Resultado conocido: instalación FALLIDA (motivo={datos.Motivo} exitCode={datos.ExitCode}).";
            log(lineaResultado);
        }
        else
        {
            log($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] Resultado desconocido antes de relanzar: {lectura.Motivo}");
        }

        try
        {
            var psi = new ProcessStartInfo
            {
                FileName = rutaQcc,
                UseShellExecute = false,
                WorkingDirectory = Path.GetDirectoryName(rutaQcc),
            };
            Process.Start(psi);
            log($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] QualityControlCenter.exe relanzado (proceso no elevado) desde {rutaQcc}.");
            return RelanzadorResultado.Relanzado(lectura);
        }
        catch (Exception ex)
        {
            log($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] No se pudo relanzar QualityControlCenter.exe: {ex.Message}");
            return RelanzadorResultado.FalloAlRelanzar(ex.Message, lectura);
        }
    }

    // Poll por EXISTENCIA (barato) hasta el timeout; en cuanto el archivo existe, se valida una
    // sola vez y se devuelve de inmediato sea válido o no — bajo un mismo RunId, SYSTEM lo
    // escribe una única vez de forma atómica, así que un archivo corrupto no se va a "arreglar
    // solo" si se sigue esperando.
    private static ResultadoLectura EsperarResultado(string runId, string resultsDir, Action<string> log, TimeSpan timeout)
    {
        var rutaEsperada = Path.Combine(resultsDir, $"result-{runId}.json");
        var inicio = DateTime.Now;

        while (true)
        {
            if (File.Exists(rutaEsperada))
                return ResultadoStore.Leer(resultsDir, runId, null, log);

            if (DateTime.Now - inicio >= timeout)
            {
                log($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] Timeout esperando que apareciera el resultado (runId={runId}) — se reabre QCC de todas formas.");
                return ResultadoLectura.Desconocido("Timeout esperando el archivo de resultado.");
            }

            Thread.Sleep(IntervaloPolling);
        }
    }
}

public record RelanzadorResultado(bool Relanzo, bool RechazadoPorPrivilegio, string? MotivoFalloRelanzar, ResultadoLectura? Lectura)
{
    public static RelanzadorResultado Relanzado(ResultadoLectura lectura) => new(true, false, null, lectura);

    public static RelanzadorResultado Rechazado(string motivo) => new(false, true, motivo, null);

    public static RelanzadorResultado FalloAlRelanzar(string motivo, ResultadoLectura lectura) => new(false, false, motivo, lectura);
}
