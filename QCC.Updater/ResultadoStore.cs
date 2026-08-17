using System.Security.AccessControl;
using System.Security.Principal;
using System.Text;
using System.Text.Json;

namespace QCC.Updater;

// Etapa 5: persiste y lee el resultado de una instalación, correlacionado por RunId. Vive en
// C:\ProgramData\QualityControlCenter\Updater\Results — carpeta nueva, separada de Pending y
// Staging (que no se tocan). SYSTEM escribe (Escribir), el relanzador no elevado solo lee
// (Leer). El RunId es puramente de correlación, no una credencial — pero como igual se usa para
// construir una ruta de archivo que un proceso PRIVILEGIADO escribe, se valida con el mismo
// criterio estricto que PackageValidator aplica al nombre del instalador (charset restringido +
// canonicalización), para que un RunId malicioso proveniente de un manifest.json editable por
// cualquier usuario normal nunca pueda hacer que SYSTEM escriba fuera de Results.
public static class ResultadoStore
{
    private static readonly JsonSerializerOptions JsonOpciones = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    public static bool Escribir(string resultsDir, UpdateResultado resultado, Action<string> log)
    {
        if (!EsRunIdValido(resultado.RunId))
        {
            log($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] No se escribe resultado: RunId ausente o con formato inválido.");
            return false;
        }

        try
        {
            Directory.CreateDirectory(resultsDir);
            AplicarAclResults(resultsDir);

            if (!TryResolverRutaSegura(resultsDir, $"result-{resultado.RunId}.json", out var rutaFinal))
            {
                log($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] No se escribe resultado: la ruta resultante queda fuera de Results.");
                return false;
            }

            var rutaTemporal = rutaFinal + ".tmp";
            var json = JsonSerializer.Serialize(resultado, JsonOpciones);

            // Escritura atómica: se escribe completo en .tmp, se cierra, y recién ahí se mueve al
            // nombre final — el relanzador nunca puede observar un result-{RunId}.json a medio
            // escribir, porque ese nombre no existe hasta que File.Move lo crea de una vez.
            File.WriteAllText(rutaTemporal, json, new UTF8Encoding(encoderShouldEmitUTF8Identifier: true));
            File.Move(rutaTemporal, rutaFinal, overwrite: true);

            log($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] Resultado escrito — runId={resultado.RunId} success={resultado.Success} ruta={rutaFinal}");
            return true;
        }
        catch (Exception ex)
        {
            log($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] No se pudo escribir el resultado (runId={resultado.RunId}): {ex.Message}");
            return false;
        }
    }

    public static ResultadoLectura Leer(string resultsDir, string runIdEsperado, string? versionEsperada, Action<string> log)
    {
        if (!EsRunIdValido(runIdEsperado))
            return ResultadoLectura.Desconocido("RunId esperado con formato inválido.");

        if (!TryResolverRutaSegura(resultsDir, $"result-{runIdEsperado}.json", out var rutaEsperada))
            return ResultadoLectura.Desconocido("La ruta resultante queda fuera de Results.");

        if (!File.Exists(rutaEsperada))
            return ResultadoLectura.Desconocido("El archivo de resultado todavía no existe.");

        string contenido;
        try
        {
            contenido = File.ReadAllText(rutaEsperada);
        }
        catch (Exception ex)
        {
            return ResultadoLectura.Desconocido($"No se pudo leer el archivo de resultado: {ex.Message}");
        }

        UpdateResultado? resultado;
        try
        {
            resultado = JsonSerializer.Deserialize<UpdateResultado>(contenido, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
        }
        catch (JsonException)
        {
            return ResultadoLectura.Desconocido("El archivo de resultado tiene un formato JSON inválido.");
        }

        if (resultado == null)
            return ResultadoLectura.Desconocido("El archivo de resultado está vacío o es inválido.");

        if (
            string.IsNullOrWhiteSpace(resultado.RunId)
            || string.IsNullOrWhiteSpace(resultado.Version)
            || string.IsNullOrWhiteSpace(resultado.StartedAt)
            || string.IsNullOrWhiteSpace(resultado.FinishedAt)
        )
        {
            return ResultadoLectura.Desconocido("El archivo de resultado no trae todos los campos requeridos.");
        }

        if (!string.Equals(resultado.RunId, runIdEsperado, StringComparison.Ordinal))
            return ResultadoLectura.Desconocido($"El runId interno ('{resultado.RunId}') no coincide con el esperado ('{runIdEsperado}').");

        if (versionEsperada != null && !string.Equals(resultado.Version, versionEsperada, StringComparison.Ordinal))
            return ResultadoLectura.Desconocido($"La versión del resultado ('{resultado.Version}') no coincide con la esperada ('{versionEsperada}').");

        // Coherencia mínima: si dice éxito, el exit code tiene que ser exactamente 0. Cualquier
        // otra combinación es más probable que sea corrupción/inconsistencia que un caso real
        // legítimo — se trata como desconocido, nunca como éxito.
        if (resultado.Success && resultado.ExitCode != 0)
            return ResultadoLectura.Desconocido($"Resultado incoherente: success=true pero exitCode={resultado.ExitCode}.");

        return ResultadoLectura.Valido(resultado);
    }

    private static bool EsRunIdValido(string? runId) =>
        !string.IsNullOrWhiteSpace(runId) && runId.Length <= 100 && runId.All(c => char.IsLetterOrDigit(c) || c == '-');

    private static bool TryResolverRutaSegura(string resultsDir, string nombreArchivo, out string rutaResuelta)
    {
        rutaResuelta = "";
        try
        {
            var dirCanonico = Path.GetFullPath(resultsDir).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
            var candidata = Path.GetFullPath(Path.Combine(resultsDir, nombreArchivo));
            if (!candidata.StartsWith(dirCanonico, StringComparison.OrdinalIgnoreCase))
                return false;

            rutaResuelta = candidata;
            return true;
        }
        catch
        {
            return false;
        }
    }

    // Mismo mecanismo que StagingPromoter.AplicarAclStaging, con una diferencia: acá Usuarios sí
    // recibe lectura (Staging no le da nada, y eso no cambia). Se reaplica en cada corrida
    // SYSTEM — autocorrectivo si algo lo hubiera alterado.
    private static void AplicarAclResults(string resultsDir)
    {
        var dirInfo = new DirectoryInfo(resultsDir);
        var security = new DirectorySecurity();
        security.SetAccessRuleProtection(isProtected: true, preserveInheritance: false);

        var system = new SecurityIdentifier(WellKnownSidType.LocalSystemSid, null);
        var administradores = new SecurityIdentifier(WellKnownSidType.BuiltinAdministratorsSid, null);
        var usuarios = new SecurityIdentifier(WellKnownSidType.BuiltinUsersSid, null);
        var heredaATodo = InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit;

        security.AddAccessRule(
            new FileSystemAccessRule(system, FileSystemRights.FullControl, heredaATodo, PropagationFlags.None, AccessControlType.Allow)
        );
        security.AddAccessRule(
            new FileSystemAccessRule(
                administradores,
                FileSystemRights.FullControl,
                heredaATodo,
                PropagationFlags.None,
                AccessControlType.Allow
            )
        );
        security.AddAccessRule(
            new FileSystemAccessRule(
                usuarios,
                FileSystemRights.ReadAndExecute,
                heredaATodo,
                PropagationFlags.None,
                AccessControlType.Allow
            )
        );

        dirInfo.SetAccessControl(security);
    }
}

public class UpdateResultado
{
    public string RunId { get; set; } = "";
    public string Version { get; set; } = "";
    public bool Success { get; set; }
    public int? ExitCode { get; set; }
    public string? Motivo { get; set; }
    public string StartedAt { get; set; } = "";
    public string FinishedAt { get; set; } = "";
}

public record ResultadoLectura(bool Conocido, string Motivo, UpdateResultado? Datos)
{
    public static ResultadoLectura Valido(UpdateResultado datos) => new(true, "Resultado válido.", datos);

    public static ResultadoLectura Desconocido(string motivo) => new(false, motivo, null);
}
