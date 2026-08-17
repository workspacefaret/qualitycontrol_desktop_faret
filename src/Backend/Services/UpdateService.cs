using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using QualityControlCenter.Backend.Models;

namespace QualityControlCenter.Backend.Services
{
    // Etapa 6 (ver contex.md / diseño aprobado del updater con elevación única): este servicio ya
    // NO ejecuta ningún instalador — solo detecta la actualización, la valida y la deja lista en
    // Pending para que QCC.Updater (elevado, vía Scheduled Task) haga el resto. La ejecución del
    // instalador es responsabilidad exclusiva de InstallerRunner (QCC.Updater), que además vuelve
    // a validar todo desde cero — este servicio nunca es la única barrera.
    public class UpdateService
    {
        // Pending: la MISMA ruta fija que usa QCC.Updater (ver QCC.Updater/Program.cs,
        // PendingDir) — no hay ensamblado compartido entre los dos binarios, así que esta
        // constante está deliberadamente duplicada en ambos lados. Si se cambia acá, hay que
        // cambiarla también allá. No se hizo configurable a propósito: es el punto de
        // correlación fijo entre los dos procesos, y dejarlo editable en dos lugares distintos
        // sería un riesgo real de que se desincronicen.
        private const string PendingDir = @"C:\ProgramData\QualityControlCenter\Updater\Pending";

        // Nombre fijo de la Scheduled Task elevada que ejecutará QCC.Updater como SYSTEM. Todavía
        // NO se crea/registra en esta etapa (eso es de una etapa posterior, junto con Inno
        // Setup) — acá solo se referencia el nombre para poder dispararla si ya existe.
        private const string ScheduledTaskName = "QCCUpdaterElevado";

        // Mismo prefijo/extensión que exige PackageValidator (QCC.Updater) — duplicado acá por la
        // misma razón que PendingDir: no hay ensamblado en común. Rechazar temprano un nombre
        // inválido es una capa extra, no la única (QCC.Updater vuelve a validar todo).
        private const string PrefijoInstaladorEsperado = "QualityControlCenter_Setup_";

        public string GetCurrentVersion()
        {
            var version = Assembly.GetExecutingAssembly().GetName().Version;

            if (version == null)
                return "0.0.0";

            return $"{version.Major}.{version.Minor}.{version.Build}";
        }

        public UpdateInfo? GetLatestUpdateInfo()
        {
            try
            {
                var latestJsonPath = UpdateSettings.Load().LatestJsonPath;

                if (!File.Exists(latestJsonPath))
                    return null;

                string json = File.ReadAllText(latestJsonPath);

                var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };

                return JsonSerializer.Deserialize<UpdateInfo>(json, options);
            }
            catch
            {
                return null;
            }
        }

        public bool IsUpdateAvailable(out UpdateInfo? updateInfo)
        {
            updateInfo = GetLatestUpdateInfo();

            if (updateInfo == null || string.IsNullOrWhiteSpace(updateInfo.Version))
                return false;

            try
            {
                var currentVersion = new Version(GetCurrentVersion());
                var latestVersion = new Version(updateInfo.Version);

                return latestVersion > currentVersion;
            }
            catch
            {
                return false;
            }
        }

        // Copia el instalador del share a Pending, valida su SHA-256 (preliminar — QCC.Updater
        // vuelve a calcularlo desde cero antes de promover y antes de instalar, esto no lo
        // reemplaza), genera un RunId nuevo por intento, y escribe el manifest.json que
        // QCC.Updater espera encontrar. No ejecuta nada — el único efecto es dejar archivos
        // listos en Pending.
        public PreparedUpdate PrepararActualizacionPendiente(UpdateInfo updateInfo)
        {
            if (!EsNombreArchivoSeguro(updateInfo.Installer))
                return PreparedUpdate.Fallo("El nombre del instalador en latest.json no es válido.");

            if (string.IsNullOrWhiteSpace(updateInfo.Sha256))
                return PreparedUpdate.Fallo("latest.json no incluye sha256.");

            var settings = UpdateSettings.Load();
            var origenUnc = Path.Combine(settings.UpdatesShareRoot, updateInfo.Installer);

            if (!File.Exists(origenUnc))
                return PreparedUpdate.Fallo("El instalador indicado por latest.json no existe en el share de actualizaciones.");

            string destino;
            try
            {
                Directory.CreateDirectory(PendingDir);

                // Limpiar cualquier intento anterior antes de preparar uno nuevo — Pending no
                // debe acumular restos de intentos previos (fallidos o ya promovidos).
                foreach (var archivoPrevio in Directory.GetFiles(PendingDir))
                {
                    try
                    {
                        File.Delete(archivoPrevio);
                    }
                    catch
                    {
                        // Mejor esfuerzo — un residuo que no se pudo borrar no debe bloquear el
                        // intento nuevo.
                    }
                }

                destino = Path.Combine(PendingDir, updateInfo.Installer);
                File.Copy(origenUnc, destino, overwrite: true);
            }
            catch (Exception ex)
            {
                return PreparedUpdate.Fallo($"No se pudo copiar el instalador al staging local: {ex.Message}");
            }

            string hashReal;
            try
            {
                hashReal = CalcularSha256(destino);
            }
            catch (Exception ex)
            {
                BorrarSiExiste(destino);
                return PreparedUpdate.Fallo($"No se pudo calcular el SHA-256 del instalador descargado: {ex.Message}");
            }

            if (!string.Equals(hashReal, updateInfo.Sha256.Trim(), StringComparison.OrdinalIgnoreCase))
            {
                BorrarSiExiste(destino);
                return PreparedUpdate.Fallo("El SHA-256 del instalador descargado no coincide con el de latest.json.");
            }

            var runId = Guid.NewGuid().ToString();

            try
            {
                var manifest = new
                {
                    runId,
                    version = updateInfo.Version,
                    file = updateInfo.Installer,
                    sha256 = hashReal,
                    createdAt = DateTime.Now.ToString("O"),
                };

                var manifestJson = JsonSerializer.Serialize(manifest);
                File.WriteAllText(
                    Path.Combine(PendingDir, "manifest.json"),
                    manifestJson,
                    new UTF8Encoding(encoderShouldEmitUTF8Identifier: true)
                );
            }
            catch (Exception ex)
            {
                BorrarSiExiste(destino);
                return PreparedUpdate.Fallo($"No se pudo escribir el manifest de Pending: {ex.Message}");
            }

            return PreparedUpdate.Exito(runId);
        }

        // Dispara (no crea) la Scheduled Task elevada, si ya existe registrada. No requiere que
        // QualityControlCenter.exe se eleve: iniciar una tarea que YA está configurada para
        // correr como SYSTEM es una operación distinta de correr elevado uno mismo. schtasks.exe
        // es una utilidad puntual de Windows, no un shell genérico — el nombre de la tarea es un
        // literal fijo en el código, nunca un valor externo.
        public bool DispararScheduledTaskElevada()
        {
            try
            {
                var psi = new ProcessStartInfo
                {
                    FileName = "schtasks.exe",
                    Arguments = $"/Run /TN \"{ScheduledTaskName}\"",
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                };

                using var proceso = Process.Start(psi);
                if (proceso == null)
                    return false;

                proceso.WaitForExit();
                return proceso.ExitCode == 0;
            }
            catch
            {
                return false;
            }
        }

        private static void BorrarSiExiste(string ruta)
        {
            try
            {
                if (File.Exists(ruta))
                    File.Delete(ruta);
            }
            catch
            {
                // Mejor esfuerzo.
            }
        }

        private static bool EsNombreArchivoSeguro(string? nombre) =>
            !string.IsNullOrWhiteSpace(nombre)
            && nombre.IndexOfAny(new[] { '\\', '/' }) < 0
            && !nombre.Contains(':')
            && !nombre.Contains("..")
            && nombre.StartsWith(PrefijoInstaladorEsperado, StringComparison.OrdinalIgnoreCase)
            && string.Equals(Path.GetExtension(nombre), ".exe", StringComparison.OrdinalIgnoreCase);

        private static string CalcularSha256(string ruta)
        {
            using var stream = File.OpenRead(ruta);
            using var sha256 = SHA256.Create();
            return Convert.ToHexString(sha256.ComputeHash(stream));
        }
    }

    public class PreparedUpdate
    {
        public bool Exitoso { get; set; }
        public string? RunId { get; set; }
        public string? Motivo { get; set; }

        public static PreparedUpdate Exito(string runId) => new PreparedUpdate { Exitoso = true, RunId = runId };

        public static PreparedUpdate Fallo(string motivo) => new PreparedUpdate { Exitoso = false, Motivo = motivo };
    }

    // La raíz UNC vive en una única configuración conocida — ni latest.json ni el instalador se
    // arman con rutas hardcodeadas repetidas: ambos derivan de UpdatesShareRoot. Mismo patrón que
    // DbSettings (config.json en la raíz de la app, con default si falta la clave o el archivo).
    public class UpdateSettings
    {
        public string UpdatesShareRoot { get; set; } =
            @"\\192.168.1.71\Programas TI\Programas\Quality Control Center\Qcontrol_Updates";

        public string LatestJsonPath => Path.Combine(UpdatesShareRoot, "latest.json");

        public static UpdateSettings Load()
        {
            try
            {
                var path = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "config.json");

                if (!File.Exists(path))
                    return new UpdateSettings();

                var json = File.ReadAllText(path);
                var settings = JsonSerializer.Deserialize<UpdateSettings>(json);

                return settings ?? new UpdateSettings();
            }
            catch
            {
                return new UpdateSettings();
            }
        }
    }
}
