using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.Tasks;
using Photino.NET;
using QualityControlCenter.Backend.Services;
using QualityControlCenter.Backend.Services.FaretApi;
using QualityControlCenter.Backend.Services.FpsApi;
using QualityControlCenter.Backend.Services.InnpackApi;
using QualityControlCenter.Backend.Services.PlanificacionApi;
using QualityControlCenter.Backend.Services.SapRecepcionApi;
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
                // Migrado a QualityControlInnpack.Api (JWT) — ya no valida contra MySQL directo
                // desde el desktop. AuthRepository queda sin uso, se retira cuando el resto de
                // los módulos INNPACK también esté migrado (ver contex.md).
                var session = new CurrentUserSessionService();
                var innpackApiSettings = InnpackApiSettings.Load();
                var innpackApiClient = new InnpackApiClient(innpackApiSettings);
                var authService = new AuthService(innpackApiClient, session);
                var authHandler = new AuthHandler(authService);

                // =========================
                // 🌐 API FARET
                // =========================
                var faretApiSettings = FaretApiSettings.Load();
                var faretApiClient = new FaretApiClient(faretApiSettings);

                var faretMejoraContinuaSettings = FaretApiSettings.Load("MejoraContinuaFaretApi");
                var faretMejoraContinuaClient = new FaretApiClient(faretMejoraContinuaSettings);

                var faretCalidadSettings = FaretApiSettings.Load("CalidadFaretApi");
                var faretCalidadClient = new FaretApiClient(faretCalidadSettings);

                // =========================
                // 🏭 API FPS (Talleres Externos INNPACK, ver contex.md)
                // =========================
                var fpsApiSettings = FpsApiSettings.Load();
                var fpsApiClient = new FpsApiClient(fpsApiSettings);
                var fpsLiberacionesApiService = new FpsLiberacionesApiService(fpsApiClient);
                var fpsMaterialesApiService = new FpsMaterialesApiService(fpsApiClient);

                // =========================
                // 🧭 API Planificación FARET (Trazabilidad INNPACK, ver contex.md)
                // =========================
                var planificacionApiSettings = PlanificacionApiSettings.Load();
                var planificacionApiClient = new PlanificacionApiClient(planificacionApiSettings);

                // =========================
                // 🧪 API SAP Recepción (Control de Recepción - Calidad, apisapfaret, ver contex.md)
                // =========================
                var sapRecepcionApiSettings = SapRecepcionApiSettings.Load();
                var sapRecepcionApiClient = new SapRecepcionApiClient(sapRecepcionApiSettings);

                // =========================
                // 🧠 ROUTER CENTRAL
                // =========================
                var router = new MessageRouter(
                    db,
                    authHandler,
                    session,
                    faretApiClient,
                    faretMejoraContinuaClient,
                    faretCalidadClient,
                    fpsLiberacionesApiService,
                    fpsMaterialesApiService,
                    planificacionApiClient,
                    sapRecepcionApiClient
                );

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
                // 🔄 CHECK UPDATE — Etapa 6: QCC ya no ejecuta ningún instalador. Solo prepara
                // Pending, arranca el relanzador no elevado (que espera el resultado y reabre
                // QCC) y dispara la Scheduled Task elevada — QCC.Updater/InstallerRunner hacen
                // el resto. QCC.exe nunca se eleva y nunca corre nada como shell genérico.
                // =========================
                try
                {
                    var updateService = new UpdateService();

                    if (updateService.IsUpdateAvailable(out var updateInfo) && updateInfo != null)
                    {
                        // Confirmación ANTES de tocar nada (Pending/relanzador/Task todavía no
                        // existen en este punto) — a diferencia del MessageBoxW que había al
                        // final del flujo (ver contex.md Paso 59, fallo E2E real: ese cuadro
                        // bloqueaba el hilo indefinidamente DESPUÉS de disparar la Scheduled
                        // Task, y mientras nadie lo cerraba, QualityControlCenter.exe seguía
                        // "en ejecución" para InstallerRunner, que agotaba su timeout de 60s y
                        // abortaba la instalación). Acá no hay ninguna carrera contra ese
                        // timeout: si el usuario tarda en responder, no pasa nada todavía.
                        const uint MB_YESNO = 0x00000004;
                        const int IDYES = 6;

                        var respuesta = MessageBoxW(
                            IntPtr.Zero,
                            $"Hay una actualización disponible (versión {updateInfo.Version}).\n\n¿Actualizar ahora?\n\nSi elige \"Sí\", Quality Control Center se cerrará y se reabrirá automáticamente al finalizar. Si elige \"No\", puede actualizar más tarde la próxima vez que abra el programa.",
                            "Actualización disponible",
                            MB_YESNO
                        );

                        if (respuesta == IDYES)
                        {
                            var preparado = updateService.PrepararActualizacionPendiente(
                                updateInfo
                            );

                            if (!preparado.Exitoso)
                            {
                                // Requisito: si falla cualquier paso ANTES de disparar la
                                // tarea, no se cierra QCC, se muestra el error, y no queda
                                // ningún flujo a medias (Pending ya se limpió en el propio
                                // fallo).
                                MessageBoxW(
                                    IntPtr.Zero,
                                    $"Se detectó una actualización disponible, pero no se pudo preparar.\n\n{preparado.Motivo}\n\nQuality Control Center continuará abierto con la versión actual.",
                                    "Error al preparar la actualización",
                                    0
                                );
                            }
                            else
                            {
                                // Fix real (ver contex.md Paso 59, "self-update lock"): QCC.Updater.exe
                                // ya NO vive en {app} — vive en una carpeta propia bajo ProgramData,
                                // fuera del árbol que reinstala el propio instalador. Antes, este
                                // proceso (el relanzador) se lanzaba desde AppContext.BaseDirectory
                                // (={app}), y quedaba corriendo toda la duración de la instalación
                                // elevada — el mismo archivo que Inno intentaba sobrescribir,
                                // provocando "acceso denegado" (exit code 5, confirmado con el log
                                // real de Inno). Ruta fija duplicada a propósito, mismo criterio ya
                                // usado para PendingDir/StagingDir/ResultsDir/RutaQccInstalada en
                                // QCC.Updater (sin ensamblado en común entre los dos binarios).
                                const string RelanzadorPathFija =
                                    @"C:\ProgramData\QualityControlCenter\Updater\Host\QCC.Updater.exe";
                                var relanzadorPath = RelanzadorPathFija;
                                var relanzadorIniciado = false;

                                try
                                {
                                    if (File.Exists(relanzadorPath))
                                    {
                                        System.Diagnostics.Process.Start(
                                            new System.Diagnostics.ProcessStartInfo
                                            {
                                                FileName = relanzadorPath,
                                                Arguments = $"--relanzar {preparado.RunId}",
                                                UseShellExecute = false,
                                            }
                                        );
                                        relanzadorIniciado = true;
                                    }
                                    else
                                    {
                                        Console.WriteLine(
                                            $"ERROR UPDATE: no se encontró el relanzador en {relanzadorPath}"
                                        );
                                    }
                                }
                                catch (Exception ex)
                                {
                                    Console.WriteLine(
                                        $"ERROR UPDATE: no se pudo iniciar el relanzador: {ex.Message}"
                                    );
                                }

                                if (!relanzadorIniciado)
                                {
                                    MessageBoxW(
                                        IntPtr.Zero,
                                        "Se detectó una actualización disponible, pero no se pudo iniciar el proceso de actualización.\n\nQuality Control Center continuará abierto con la versión actual.",
                                        "Error al iniciar la actualización",
                                        0
                                    );
                                }
                                else
                                {
                                    // El relanzador ya arrancó y quedó a la espera del
                                    // resultado — recién ahora tiene sentido disparar la
                                    // tarea elevada; nunca antes de que Pending esté
                                    // completo, y nunca sin que exista alguien esperando el
                                    // resultado para reabrir QCC.
                                    var taskDisparada =
                                        updateService.DispararScheduledTaskElevada();

                                    if (!taskDisparada)
                                    {
                                        Console.WriteLine(
                                            "ERROR UPDATE: no se pudo disparar la Scheduled Task elevada."
                                        );
                                        MessageBoxW(
                                            IntPtr.Zero,
                                            "Se detectó una actualización disponible, pero no se pudo iniciar el proceso de instalación elevado.\n\nQuality Control Center continuará abierto con la versión actual.",
                                            "Error al iniciar la actualización",
                                            0
                                        );
                                    }
                                    else
                                    {
                                        // Fix real (ver contex.md Paso 59): la Task ya está
                                        // disparada y corriendo como SYSTEM, que empieza a
                                        // contar su timeout de 60s esperando que este proceso
                                        // cierre. A partir de acá, CERO llamadas bloqueantes
                                        // antes de Exit — ya no hay ningún MessageBoxW.
                                        Environment.Exit(0);
                                    }
                                }
                            }
                        }
                        // Si el usuario eligió "No": no se prepara ni se dispara nada, QCC
                        // sigue abierto con normalidad. El chequeo se vuelve a evaluar desde
                        // cero en el próximo arranque.
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
