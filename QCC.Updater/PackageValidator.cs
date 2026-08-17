using System.Security.Cryptography;
using System.Text.Json;

namespace QCC.Updater;

// Valida un paquete de actualización pendiente ANTES de permitir que se ejecute — esta clase
// nunca ejecuta nada, solo dice sí/no y por qué. Existe porque el proceso elevado (SYSTEM, vía
// la Scheduled Task) no debe confiar en ninguna validación hecha antes por
// QualityControlCenter.exe (que corre sin privilegios, y en teoría podría estar comprometido o
// simplemente equivocado): vuelve a validar todo desde cero, leyendo únicamente del staging fijo
// que se le indica.
//
// Ninguna barrera es suficiente por sí sola — la aceptación depende de TODAS a la vez: manifiesto
// válido + nombre sin separadores/':'/'..' + prefijo esperado (una señal más, no la única) +
// extensión .exe + ruta canonicalizada dentro del staging + el archivo existe + SHA-256
// recalculado coincide.
//
// Punto de extensión para el futuro, sin rediseñar nada de lo de arriba: una vez que el SHA-256
// ya dio válido acá es donde se insertará, como paso adicional, la verificación de firma
// Authenticode + Publisher esperado (hoy no se implementa porque no hay certificado todavía).
public static class PackageValidator
{
    public const string PrefijoEsperado = "QualityControlCenter_Setup_";
    private const string ExtensionEsperada = ".exe";

    public static PackageValidationResult Validar(string stagingDir, string manifestPath)
    {
        // 1. Leer manifest.json — ruta fija, nunca provista por el usuario.
        string manifestJson;
        try
        {
            if (!File.Exists(manifestPath))
                return PackageValidationResult.Rechazado("No se encontró el manifiesto de actualización.");

            manifestJson = File.ReadAllText(manifestPath);
        }
        catch (Exception)
        {
            return PackageValidationResult.Rechazado("No se pudo leer el manifiesto de actualización.");
        }

        // 2. Parsear JSON — formato inválido rechaza sin filtrar detalles internos del parser.
        UpdateManifest? manifest;
        try
        {
            manifest = JsonSerializer.Deserialize<UpdateManifest>(
                manifestJson,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true }
            );
        }
        catch (JsonException)
        {
            return PackageValidationResult.Rechazado("El manifiesto de actualización tiene un formato inválido.");
        }

        if (manifest == null)
            return PackageValidationResult.Rechazado("El manifiesto de actualización tiene un formato inválido.");

        // 3. Estructura / campos requeridos.
        if (
            string.IsNullOrWhiteSpace(manifest.Version)
            || string.IsNullOrWhiteSpace(manifest.File)
            || string.IsNullOrWhiteSpace(manifest.Sha256)
            || string.IsNullOrWhiteSpace(manifest.CreatedAt)
        )
        {
            return PackageValidationResult.Rechazado("El manifiesto no trae todos los campos requeridos.");
        }

        var nombreArchivo = manifest.File.Trim();

        // 4. Nombre del archivo: cada chequeo es una barrera independiente. El prefijo esperado
        // es una señal más, deliberadamente NO es el único gate (podría fallar igual si alguien
        // logra colar separadores de ruta antes o después del prefijo correcto).
        if (nombreArchivo.IndexOfAny(new[] { '\\', '/' }) >= 0)
            return PackageValidationResult.Rechazado("El nombre del archivo no puede contener separadores de ruta.");

        if (nombreArchivo.Contains(':'))
            return PackageValidationResult.Rechazado("El nombre del archivo no puede contener ':'.");

        if (nombreArchivo.Contains(".."))
            return PackageValidationResult.Rechazado("El nombre del archivo no puede contener '..'.");

        if (!nombreArchivo.StartsWith(PrefijoEsperado, StringComparison.OrdinalIgnoreCase))
            return PackageValidationResult.Rechazado(
                $"El nombre del archivo no coincide con el patrón esperado ('{PrefijoEsperado}*')."
            );

        if (!string.Equals(Path.GetExtension(nombreArchivo), ExtensionEsperada, StringComparison.OrdinalIgnoreCase))
            return PackageValidationResult.Rechazado("Solo se acepta un instalador con extensión .exe.");

        // 5. Canonicalización: aunque los chequeos de arriba ya deberían bastar, se vuelve a
        // resolver la ruta final y se confirma que sigue estrictamente dentro del staging
        // permitido — defensa en profundidad, no se confía solo en el parsing de string de
        // arriba.
        string stagingCanonico;
        string rutaResuelta;
        try
        {
            stagingCanonico =
                Path.GetFullPath(stagingDir).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
            rutaResuelta = Path.GetFullPath(Path.Combine(stagingDir, nombreArchivo));
        }
        catch (Exception)
        {
            return PackageValidationResult.Rechazado("No se pudo resolver la ruta del instalador.");
        }

        if (!rutaResuelta.StartsWith(stagingCanonico, StringComparison.OrdinalIgnoreCase))
            return PackageValidationResult.Rechazado(
                "El instalador debe estar dentro de la carpeta de staging autorizada."
            );

        // 6. Debe existir.
        if (!File.Exists(rutaResuelta))
            return PackageValidationResult.Rechazado("El instalador indicado por el manifiesto no existe en el staging.");

        // 7. SHA-256 recalculado sobre el archivo real en este mismo proceso — nunca se confía en
        // un hash reportado por otro proceso (frontera de confianza con QualityControlCenter.exe).
        string hashReal;
        try
        {
            using var stream = File.OpenRead(rutaResuelta);
            using var sha256 = SHA256.Create();
            hashReal = Convert.ToHexString(sha256.ComputeHash(stream));
        }
        catch (Exception)
        {
            return PackageValidationResult.Rechazado("No se pudo calcular el hash del instalador.");
        }

        if (!string.Equals(hashReal, manifest.Sha256.Trim(), StringComparison.OrdinalIgnoreCase))
            return PackageValidationResult.Rechazado("El hash SHA-256 del instalador no coincide con el manifiesto.");

        // 8. Todas las barreras pasaron. Nótese que esta función NUNCA ejecuta el archivo — solo
        // informa que quedó validado y cuál es su ruta resuelta.
        return PackageValidationResult.CrearAceptado(rutaResuelta, manifest);
    }
}

public class UpdateManifest
{
    public string Version { get; set; } = "";
    public string File { get; set; } = "";
    public string Sha256 { get; set; } = "";
    public string? CreatedAt { get; set; }

    // Etapa 5, aditivo: correlación de ejecución entre la corrida SYSTEM y el relanzador no
    // elevado (ver ResultadoStore). Deliberadamente NO forma parte de las barreras de seguridad
    // de este validador — no se agrega a los campos requeridos ni a ningún chequeo de arriba; un
    // manifiesto sin RunId sigue validando igual que en Etapa 2/3/4.
    public string? RunId { get; set; }
}

// Etapa 3 agregó el campo Manifest (antes solo viajaba Version) — necesario para que
// StagingPromoter pueda reescribir un manifest.json de confianza en Staging a partir de los
// datos ya validados, sin volver a leer el archivo de Pending. No cambia el comportamiento de
// ninguno de los otros campos ni de las reglas de validación de Etapa 2.
public record PackageValidationResult(bool Aceptado, string? RutaValidada, string? Version, string Motivo, UpdateManifest? Manifest = null)
{
    public static PackageValidationResult CrearAceptado(string ruta, UpdateManifest manifest) =>
        new(true, ruta, manifest.Version, "Validación exitosa.", manifest);

    public static PackageValidationResult Rechazado(string motivo) => new(false, null, null, motivo, null);
}
