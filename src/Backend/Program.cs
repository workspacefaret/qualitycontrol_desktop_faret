using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.Tasks;
using Photino.NET;
using QualityControlCenter.Backend.Services;
using QualityControlCenter.Config;
using QualityControlCenter.Modules.Auth;
using QualityControlCenter.Repositories.Auth;
using QualityControlCenter.Services;

namespace QualityControlCenter
{
    class Program
    {
        [STAThread]
        static void Main(string[] args)
        {
            Console.WriteLine("Iniciando Quality Control Center...");
            Console.WriteLine(PasswordHelper.Hash("1234"));

            try
            {
                // =========================
                // 🔧 CONFIG + DB
                // =========================
                var settings = DbSettings.Load();
                var db = new DbService(settings);

                // =========================
                // 🔐 AUTH + SESSION
                // =========================
                var session = new CurrentUserSessionService();
                var authRepository = new AuthRepository(db);
                var authService = new AuthService(authRepository, session);
                var authHandler = new AuthHandler(authService);

                // =========================
                // 🧠 ROUTER CENTRAL
                // =========================
                var router = new MessageRouter(db, authHandler, session);

                // =========================
                // 📂 RUTA INDEX.HTML
                // =========================
                var root = AppContext.BaseDirectory;
                var indexPath = Path.Combine(root, "src", "UI", "www", "index.html");

                Console.WriteLine($"📂 Cargando HTML desde: {indexPath}");

                if (!File.Exists(indexPath))
                {
                    var appDataDir = Path.Combine(
                        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                        "QualityControlCenter"
                    );

                    Directory.CreateDirectory(appDataDir);

                    var logPath = Path.Combine(appDataDir, "startup-error.log");
                    File.AppendAllText(logPath, "ERROR: index.html no encontrado\n");
                    File.AppendAllText(logPath, $"BaseDirectory: {AppContext.BaseDirectory}\n");
                    File.AppendAllText(logPath, $"IndexPath: {indexPath}\n\n");

                    return;
                }

                // =========================
                // 🖥 VENTANA
                // =========================
                var window = new PhotinoWindow()
                    .SetTitle("Quality Control Center")
                    .SetUseOsDefaultSize(true)
                    .Center()
                    .SetChromeless(false)
                    .Load(indexPath);

                // =========================
                // 🔥 BRIDGE JS ↔ C#
                // =========================
                window.RegisterWebMessageReceivedHandler(
                    async (sender, message) =>
                    {
                        try
                        {
                            Console.WriteLine($"📥 RAW: {message}");

                            using var doc = JsonDocument.Parse(message);
                            var rootJson = doc.RootElement;

                            // =========================
                            // VALIDAR FORMATO
                            // =========================
                            if (
                                !rootJson.TryGetProperty("id", out var idProp)
                                || !rootJson.TryGetProperty("payload", out var payloadProp)
                            )
                            {
                                SendError(window, 0, "Formato inválido (id/payload faltante)");
                                return;
                            }

                            var requestId = idProp.GetInt32();
                            var payloadJson = payloadProp.GetRawText();

                            Console.WriteLine($"🎯 Request ID: {requestId}");

                            // =========================
                            // PROCESAR EN ROUTER
                            // =========================
                            var result = await router.Handle(payloadJson);

                            // =========================
                            // RESPUESTA FINAL
                            // =========================
                            var response = new
                            {
                                id = requestId,
                                data = JsonSerializer.Deserialize<JsonElement>(result),
                            };

                            var responseJson = JsonSerializer.Serialize(response);

                            Console.WriteLine($"📤 RESPONSE: {responseJson}");

                            window.SendWebMessage(responseJson);
                        }
                        catch (Exception ex)
                        {
                            Console.WriteLine($"❌ ERROR BRIDGE: {ex}");

                            SendError(window, 0, "Error interno servidor");
                        }
                    }
                );
                // =========================
                // 🔄 CHECK UPDATE NATIVO
                // =========================
                try
                {
                    var updateService = new UpdateService();

                    if (updateService.IsUpdateAvailable(out var updateInfo) && updateInfo != null)
                    {
                        MessageBoxW(
                            IntPtr.Zero,
                            $"Hemos detectado una actualización disponible.\n\nVersión nueva: {updateInfo.Version}\n\nSe iniciará el instalador para actualizar Quality Control Center.",
                            "Actualización disponible",
                            0
                        );

                        System.Diagnostics.Process.Start(
                            new System.Diagnostics.ProcessStartInfo
                            {
                                FileName = updateInfo.Installer,
                                UseShellExecute = true,
                            }
                        );

                        Environment.Exit(0);
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"ERROR UPDATE: {ex.Message}");
                }

                // =========================
                // 🚀 RUN
                // =========================
                window.WaitForClose();
            }
            catch (Exception ex)
            {
                Console.WriteLine($"❌ ERROR FATAL: {ex}");
            }
        }

        // =========================
        // 🔴 ERROR STANDARD
        // =========================
        static void SendError(PhotinoWindow window, int id, string message)
        {
            var errorResponse = new { id = id, data = new { ok = false, error = message } };

            window.SendWebMessage(JsonSerializer.Serialize(errorResponse));
        }

        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        static extern int MessageBoxW(IntPtr hWnd, string text, string caption, uint type);
    }
}
