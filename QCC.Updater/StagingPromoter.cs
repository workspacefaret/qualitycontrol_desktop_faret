using System.Security.AccessControl;
using System.Security.Principal;
using System.Text;
using System.Text.Json;

namespace QCC.Updater;

// Etapa 3: promueve un paquete ya validado desde Pending (no privilegiado, lo escribe
// QualityControlCenter.exe corriendo como usuario normal) hacia Staging (protegido, solo
// SYSTEM puede escribir ahí). Esta es la única función de todo el updater que escribe en la
// carpeta protegida — y solo debe invocarse cuando el contexto ya se confirmó EsSystem=True
// (esa condición se evalúa en Program.cs, no acá adentro, para que la frontera quede explícita
// y visible en el punto de entrada en vez de escondida).
//
// Principio central: nunca confiar en una validación anterior. Por eso esta función vuelve a
// llamar a PackageValidator sobre Pending DESDE CERO (ignora cualquier resultado que el
// llamador ya haya calculado), y además vuelve a validar la COPIA final ya en Staging antes de
// darla por "promovida" — así se cierra la ventana TOCTOU entre "se validó" y "se usó": el
// hash que importa es siempre el de la copia que quedó en Staging, nunca el de Pending.
//
// Todavía NO ejecuta el instalador ni ningún otro proceso — solo copia archivos ya validados y
// vuelve a validar la copia.
public static class StagingPromoter
{
    public static PromotionResult Promover(string pendingDir, string pendingManifestPath, string stagingDir, Action<string> log)
    {
        // 1. Revalidar Pending desde cero — no se recibe ni se confía en ningún resultado
        // calculado por el llamador.
        var validacionPending = PackageValidator.Validar(pendingDir, pendingManifestPath);
        if (!validacionPending.Aceptado || validacionPending.RutaValidada == null || validacionPending.Manifest == null)
        {
            return PromotionResult.Fallo($"Pending no pasó la revalidación previa a promover: {validacionPending.Motivo}");
        }

        var nombreArchivo = validacionPending.Manifest.File.Trim();
        log(
            $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] Iniciando promoción a staging — "
                + $"origen={validacionPending.RutaValidada} sha256Esperado={validacionPending.Manifest.Sha256}"
        );

        // 2. Preparar Staging: crear si falta, limpiar contenido previo (solo archivos dentro de
        // ESTA carpeta, nunca Pending ni ninguna otra), y (re)aplicar el ACL restringido en cada
        // corrida — autocorrectivo si algo lo hubiera alterado.
        try
        {
            Directory.CreateDirectory(stagingDir);
            LimpiarStaging(stagingDir);
            AplicarAclStaging(stagingDir);
        }
        catch (Exception ex)
        {
            return PromotionResult.Fallo($"No se pudo preparar la carpeta de staging: {ex.Message}");
        }

        // 3. Copiar el instalador ya validado. El nombre destino es el mismo nombre que ya pasó
        // TODAS las barreras de PackageValidator (sin separadores, sin '..', prefijo+extensión
        // correctos, dentro del staging autorizado) — el manifiesto nunca decide un directorio,
        // solo aporta un nombre de archivo simple ya verificado.
        var rutaFinal = Path.Combine(stagingDir, nombreArchivo);
        try
        {
            File.Copy(validacionPending.RutaValidada, rutaFinal, overwrite: true);
        }
        catch (Exception ex)
        {
            return PromotionResult.Fallo($"No se pudo copiar el instalador a staging: {ex.Message}");
        }

        // 4. Reescribir manifest.json en Staging a partir del OBJETO ya validado en memoria (no
        // se copia el archivo de Pending tal cual) — mismo formato camelCase que usa el resto
        // del proyecto para JSON hacia/desde el frontend.
        var manifestStagingPath = Path.Combine(stagingDir, "manifest.json");
        try
        {
            var manifestJson = JsonSerializer.Serialize(
                validacionPending.Manifest,
                new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase }
            );
            File.WriteAllText(manifestStagingPath, manifestJson, new UTF8Encoding(encoderShouldEmitUTF8Identifier: true));
        }
        catch (Exception ex)
        {
            LimpiarStaging(stagingDir);
            return PromotionResult.Fallo($"No se pudo escribir el manifiesto en staging: {ex.Message}");
        }

        // 5/6. Revalidar la COPIA que quedó en Staging — nunca se confía en el hash calculado
        // antes de copiar. Si por cualquier motivo la copia no coincide (disco corrupto, algo la
        // alteró entre el paso 3 y este), se rechaza y se limpia: no se deja un paquete a medias
        // sentado en la carpeta protegida.
        var validacionStaging = PackageValidator.Validar(stagingDir, manifestStagingPath);
        if (!validacionStaging.Aceptado || validacionStaging.Manifest == null)
        {
            LimpiarStaging(stagingDir);
            return PromotionResult.Fallo($"La copia final en staging no pasó la revalidación: {validacionStaging.Motivo}");
        }

        // 7. Recién acá se considera "staged" — Staging queda con el instalador + su manifest.json
        // propios, listos para que una etapa futura instale desde ahí sin volver a depender de
        // Pending ni del share SMB.
        return PromotionResult.Exito(validacionStaging.RutaValidada!, validacionStaging.Manifest.Sha256);
    }

    private static void LimpiarStaging(string stagingDir)
    {
        if (!Directory.Exists(stagingDir))
            return;

        foreach (var archivo in Directory.GetFiles(stagingDir))
        {
            try
            {
                File.Delete(archivo);
            }
            catch
            {
                // Mejor esfuerzo: un archivo residual que no se pudo borrar no debe tumbar la
                // promoción completa (por ejemplo si quedó bloqueado momentáneamente).
            }
        }
    }

    // Rompe la herencia desde C:\ProgramData (que otorga BUILTIN\Usuarios lectura + escritura de
    // archivos propios) y deja Staging únicamente con SYSTEM y Administradores en control total.
    // Ningún usuario estándar recibe acceso, ni siquiera lectura — es más estricto que "solo
    // lectura" a propósito, porque nada en el diseño necesita que un usuario normal lea Staging.
    private static void AplicarAclStaging(string stagingDir)
    {
        var dirInfo = new DirectoryInfo(stagingDir);
        var security = new DirectorySecurity();
        security.SetAccessRuleProtection(isProtected: true, preserveInheritance: false);

        var system = new SecurityIdentifier(WellKnownSidType.LocalSystemSid, null);
        var administradores = new SecurityIdentifier(WellKnownSidType.BuiltinAdministratorsSid, null);
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

        dirInfo.SetAccessControl(security);
    }
}

public record PromotionResult(bool Promovido, string? RutaFinal, string? Sha256Final, string Motivo)
{
    public static PromotionResult Exito(string ruta, string sha256) =>
        new(true, ruta, sha256, "Paquete promovido y revalidado en staging.");

    public static PromotionResult Fallo(string motivo) => new(false, null, null, motivo);
}
