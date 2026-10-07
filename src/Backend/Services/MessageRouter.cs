using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Text.Json;
using System.Threading.Tasks;
using QualityControlCenter.Backend.Services.FaretApi;
using QualityControlCenter.Backend.Services.FpsApi;
using QualityControlCenter.Backend.Services.InnpackApi;
using QualityControlCenter.Backend.Services.PlanificacionApi;
using QualityControlCenter.Modules.Auth;
using QualityControlCenter.Modules.CertificadosLiberacion;
using QualityControlCenter.Modules.DespachosDiarios;
using QualityControlCenter.Modules.ControlDocumental;
using QualityControlCenter.Modules.Dashboard;
using QualityControlCenter.Modules.Faret;
using QualityControlCenter.Modules.Home;
using QualityControlCenter.Modules.LiberacionCalidad;
using QualityControlCenter.Modules.MaquinasSeguimiento;
using QualityControlCenter.Modules.NoConformidades;
using QualityControlCenter.Modules.ProductoTerminado;
using QualityControlCenter.Modules.RegistrosControl;
using QualityControlCenter.Modules.RegistrosProduccion;
using QualityControlCenter.Backend.Services.SapRecepcionApi;
using QualityControlCenter.Modules.MuestraLaboratorio;
using QualityControlCenter.Modules.FaretLaboratorio;
using QualityControlCenter.Modules.RecepcionCalidad;
using QualityControlCenter.Modules.TalleresExternos;
using QualityControlCenter.Modules.Formularios;
using QualityControlCenter.Modules.Trazabilidad;
using QualityControlCenter.Modules.Usuarios;

namespace QualityControlCenter.Services
{
    public class MessageRouter
    {
        private readonly DbService _db;
        private readonly AuthHandler _authHandler;
        private readonly CurrentUserSessionService _session;
        private readonly InnpackApiClient _innpackClient;
        private readonly FaretApiClient _faretClient;
        private readonly FaretApiClient _faretMejoraContinuaClient;
        private readonly FaretApiClient _faretCalidadClient;
        private readonly FpsLiberacionesApiService _fpsLiberaciones;
        private readonly FpsMaterialesApiService _fpsMateriales;
        private readonly PlanificacionApiClient _planificacionClient;
        private readonly SapRecepcionApiClient _sapRecepcionClient;
        private readonly FpsRegistroProduccionApiService _fpsRegistroProduccion;
        private readonly PermisosService _permisos;

        private static readonly JsonSerializerOptions _jsonOptions = new()
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        };

        public MessageRouter(
            DbService db,
            AuthHandler authHandler,
            CurrentUserSessionService session,
            InnpackApiClient innpackClient,
            FaretApiClient faretClient,
            FaretApiClient faretMejoraContinuaClient,
            FaretApiClient faretCalidadClient,
            FpsLiberacionesApiService fpsLiberaciones,
            FpsMaterialesApiService fpsMateriales,
            PlanificacionApiClient planificacionClient,
            SapRecepcionApiClient sapRecepcionClient,
            FpsRegistroProduccionApiService fpsRegistroProduccion,
            PermisosService permisos
        )
        {
            _db = db;
            _authHandler = authHandler;
            _session = session;
            _innpackClient = innpackClient;
            _faretClient = faretClient;
            _faretMejoraContinuaClient = faretMejoraContinuaClient;
            _faretCalidadClient = faretCalidadClient;
            _fpsLiberaciones = fpsLiberaciones;
            _fpsMateriales = fpsMateriales;
            _planificacionClient = planificacionClient;
            _sapRecepcionClient = sapRecepcionClient;
            _fpsRegistroProduccion = fpsRegistroProduccion;
            _permisos = permisos;
        }

        public async Task<string> Handle(string payloadJson)
        {
            var startTime = DateTime.Now;

            try
            {
                Log("INFO", $"📩 PAYLOAD: {payloadJson}");

                var data = JsonSerializer.Deserialize<Dictionary<string, object>>(payloadJson);

                if (data == null)
                    return Error("Payload inválido");

                if (!data.ContainsKey("action"))
                    return Error("Falta 'action'");

                var action = data["action"]?.ToString();

                if (string.IsNullOrEmpty(action))
                    return Error("Acción vacía");

                Log("INFO", $"🎯 ACTION: {action}");

                // Permisos por módulo: el bridge JS agrega "_modulo" (módulo abierto) a cada
                // mensaje. Bloqueo server-side, no solo botones ocultos (ver PermisosService).
                var modulo =
                    data.TryGetValue("_modulo", out var moduloRaw) && moduloRaw is JsonElement moduloEl
                    && moduloEl.ValueKind == JsonValueKind.String
                        ? moduloEl.GetString()
                        : null;
                var rechazo = _permisos.ValidarAccion(action, modulo);
                if (rechazo != null)
                {
                    Log("ERROR", $"⛔ {action} (módulo {modulo ?? "-"}): {rechazo}");
                    return Error(rechazo);
                }

                string rawResult;

                if (action.StartsWith("auth"))
                {
                    if (!data.ContainsKey("data"))
                        return Error("Falta 'data'");

                    if (data["data"] is not JsonElement authDataElement)
                        return Error("Formato inválido en 'data'");

                    rawResult = await _authHandler.Handle(action, authDataElement);

                    if (action == "auth.login" && EsRespuestaOk(rawResult))
                    {
                        var error = await CargarPermisosInnpackAsync();
                        if (error != null)
                        {
                            await _authHandler.Handle("auth.logout", authDataElement);
                            return Error(error);
                        }
                    }
                    else if (action == "auth.logout")
                    {
                        _permisos.Limpiar();
                    }
                }
                else if (action.StartsWith("inicio"))
                {
                    var handler = new HomeHandler(_innpackClient);
                    rawResult = await handler.Handle(action, data);
                }
                else if (action.StartsWith("usuarios"))
                {
                    var handler = new UsuariosHandler(_innpackClient, _session);
                    rawResult = await handler.Handle(action, data);
                }
                else if (action.StartsWith("registrosControl"))
                {
                    var handler = new RegistrosControlHandler(_innpackClient);
                    rawResult = await handler.Handle(action, data);
                }
                else if (action.StartsWith("registrosProduccion"))
                {
                    var handler = new RegistrosProduccionHandler(_innpackClient);
                    rawResult = await handler.Handle(action, data);
                }
                else if (action == "excel.guardar")
                {
                    rawResult = GuardarExcel(data);
                }
                else if (action == "permisos.mios")
                {
                    rawResult = JsonSerializer.Serialize(
                        new { ok = true, data = _permisos.NivelesEfectivos() }
                    );
                }
                else if (action.StartsWith("dashboard"))
                {
                    var handler = new DashboardHandler(_innpackClient);
                    rawResult = await handler.Handle(action, data);
                }
                else if (action.StartsWith("maquinasSeguimiento"))
                {
                    var handler = new MaquinasSeguimientoHandler(_innpackClient);
                    rawResult = await handler.Handle(action, data);
                }
                else if (action.StartsWith("noConformidades"))
                {
                    var handler = new NoConformidadesHandler(_innpackClient);
                    rawResult = await handler.Handle(action, data);
                }
                else if (action.StartsWith("controlDocumental"))
                {
                    var handler = new ControlDocumentalHandler(_innpackClient);
                    rawResult = await handler.Handle(action, data);
                }
                else if (action.StartsWith("certificadosLiberacion"))
                {
                    var handler = new CertificadosLiberacionHandler(_innpackClient);
                    rawResult = await handler.Handle(action, data);
                }
                else if (action.StartsWith("despachosDiarios"))
                {
                    var handler = new DespachosDiariosHandler(_innpackClient);
                    rawResult = await handler.Handle(action, data);
                }
                else if (action.StartsWith("talleresExternos"))
                {
                    var handler = new TalleresExternosHandler(_innpackClient, _session);
                    rawResult = await handler.Handle(action, data);
                }
                else if (action.StartsWith("productoTerminado"))
                {
                    var handler = new ProductoTerminadoHandler(_innpackClient);
                    rawResult = await handler.Handle(action, data);
                }
                else if (action.StartsWith("liberacionCalidad"))
                {
                    var handler = new LiberacionCalidadHandler(_fpsLiberaciones);
                    rawResult = await handler.Handle(action, data);
                }
                else if (action.StartsWith("trazabilidad"))
                {
                    var handler = new TrazabilidadHandler(_innpackClient, _planificacionClient, _fpsMateriales);
                    rawResult = await handler.Handle(action, data);
                }
                else if (action.StartsWith("formularios"))
                {
                    var handler = new FormulariosHandler(_innpackClient);
                    rawResult = await handler.Handle(action, data);
                }
                else if (action.StartsWith("muestraLab"))
                {
                    var handler = new MuestraLaboratorioHandler(
                        _innpackClient,
                        _session,
                        _planificacionClient,
                        _fpsRegistroProduccion,
                        _sapRecepcionClient,
                        _fpsMateriales
                    );
                    rawResult = await handler.Handle(action, data);
                }
                else if (action.StartsWith("recepcion"))
                {
                    var handler = new RecepcionCalidadHandler(_innpackClient, _sapRecepcionClient, _session);
                    rawResult = await handler.Handle(action, data);
                }
                else if (action.StartsWith("faretLab"))
                {
                    // OJO: esta rama debe ir ANTES que "faret" (más abajo) — action.StartsWith("faret")
                    // también matchearía "faretLab.xxx" y lo enviaría al FaretHandler equivocado.
                    var handler = new FaretLaboratorioHandler(_innpackClient, _session);
                    rawResult = await handler.Handle(action, data);
                }
                else if (action.StartsWith("faret"))
                {
                    var handler = new FaretHandler(
                        _faretClient,
                        _faretMejoraContinuaClient,
                        _faretCalidadClient
                    );
                    rawResult = await handler.Handle(action, data);

                    if (action == "faret.login" && EsRespuestaOk(rawResult))
                    {
                        var error = await CargarPermisosFaretAsync(rawResult);
                        if (error != null)
                        {
                            await handler.Handle("faret.logout", data);
                            return Error(error);
                        }
                    }
                    else if (action == "faret.logout")
                    {
                        _permisos.Limpiar();
                    }
                }
                else
                {
                    return Error($"Acción no reconocida en QCC: {action}");
                }

                var normalized = NormalizeResponse(rawResult);

                var duration = (DateTime.Now - startTime).TotalMilliseconds;
                Log("SUCCESS", $"⏱ {action} en {duration}ms");

                return normalized;
            }
            catch (Exception ex)
            {
                Log("ERROR", $"❌ ROUTER ERROR: {ex.Message}");
                return Error(ex.Message);
            }
        }

        private static bool EsRespuestaOk(string raw)
        {
            try
            {
                using var doc = JsonDocument.Parse(raw);
                return doc.RootElement.TryGetProperty("ok", out var ok)
                    && ok.ValueKind == JsonValueKind.True;
            }
            catch
            {
                return false;
            }
        }

        // Tras un login INNPACK correcto: rol de la sesión + permisos personalizados del usuario.
        // Si no se pueden cargar, el login se anula (no se entra con permisos desconocidos).
        private async Task<string?> CargarPermisosInnpackAsync()
        {
            var user = _session.GetCurrentUser();
            if (user == null)
                return "No se pudo leer la sesión del usuario.";

            var (ok, body) = await _innpackClient.GetAsync("api/auth/mis-permisos");
            if (!ok || !PermisosService.TryParsearPermisos(body, out var personalizados))
                return "No se pudieron cargar los permisos del usuario. Intenta nuevamente.";

            _permisos.Establecer("INNPACK", user.Rol, personalizados);
            return null;
        }

        private async Task<string?> CargarPermisosFaretAsync(string loginResult)
        {
            string rol;
            try
            {
                using var doc = JsonDocument.Parse(loginResult);
                rol =
                    doc.RootElement.TryGetProperty("data", out var d)
                    && d.TryGetProperty("role", out var r)
                    && r.ValueKind == JsonValueKind.String
                        ? r.GetString() ?? ""
                        : "";
            }
            catch
            {
                rol = "";
            }

            var (ok, body) = await _faretClient.GetAsync("api/auth/mis-permisos");
            if (!ok || !PermisosService.TryParsearPermisos(body, out var personalizados))
                return "No se pudieron cargar los permisos del usuario. Intenta nuevamente.";

            _permisos.Establecer("FARET", rol, personalizados);
            return null;
        }

        private string GuardarExcel(Dictionary<string, object> data)
        {
            try
            {
                if (
                    !data.TryGetValue("data", out var rawData)
                    || rawData is not JsonElement jsonData
                )
                {
                    return JsonSerializer.Serialize(
                        new { ok = false, error = "Falta data para guardar Excel" },
                        _jsonOptions
                    );
                }

                var fileName = jsonData.GetProperty("fileName").GetString();
                var base64 = jsonData.GetProperty("base64").GetString();

                if (string.IsNullOrWhiteSpace(fileName))
                    fileName = $"qcc_export_{DateTime.Now:yyyyMMdd_HHmmss}.xlsx";

                if (string.IsNullOrWhiteSpace(base64))
                {
                    return JsonSerializer.Serialize(
                        new { ok = false, error = "Excel vacío" },
                        _jsonOptions
                    );
                }

                fileName = Path.GetFileName(fileName);

                if (!fileName.EndsWith(".xlsx", StringComparison.OrdinalIgnoreCase))
                    fileName += ".xlsx";

                var downloads = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
                    "Downloads"
                );

                if (!Directory.Exists(downloads))
                {
                    downloads = Environment.GetFolderPath(
                        Environment.SpecialFolder.DesktopDirectory
                    );
                }

                var finalPath = Path.Combine(downloads, fileName);

                if (File.Exists(finalPath))
                {
                    var name = Path.GetFileNameWithoutExtension(fileName);
                    var ext = Path.GetExtension(fileName);
                    finalPath = Path.Combine(
                        downloads,
                        $"{name}_{DateTime.Now:yyyyMMdd_HHmmss}{ext}"
                    );
                }

                var bytes = Convert.FromBase64String(base64);
                File.WriteAllBytes(finalPath, bytes);

                try
                {
                    Process.Start(
                        new ProcessStartInfo { FileName = finalPath, UseShellExecute = true }
                    );
                }
                catch { }
                return JsonSerializer.Serialize(
                    new { ok = true, data = new { path = finalPath } },
                    _jsonOptions
                );
            }
            catch (Exception ex)
            {
                return JsonSerializer.Serialize(
                    new { ok = false, error = ex.Message },
                    _jsonOptions
                );
            }
        }

        private string NormalizeResponse(string raw)
        {
            try
            {
                if (string.IsNullOrEmpty(raw))
                {
                    return JsonSerializer.Serialize(
                        new
                        {
                            ok = true,
                            success = true,
                            data = (object?)null,
                            error = (string?)null,
                        },
                        _jsonOptions
                    );
                }

                using var doc = JsonDocument.Parse(raw);
                var root = doc.RootElement;

                if (root.TryGetProperty("ok", out var okProp))
                {
                    var ok = okProp.GetBoolean();

                    return JsonSerializer.Serialize(
                        new
                        {
                            ok = ok,
                            success = ok,
                            data = root.TryGetProperty("data", out var dataProp)
                                ? JsonSerializer.Deserialize<object>(dataProp.GetRawText())
                                : null,
                            error = root.TryGetProperty("error", out var errProp)
                                ? errProp.GetString()
                                : null,
                        },
                        _jsonOptions
                    );
                }

                return JsonSerializer.Serialize(
                    new
                    {
                        ok = true,
                        success = true,
                        data = JsonSerializer.Deserialize<object>(raw),
                        error = (string?)null,
                    },
                    _jsonOptions
                );
            }
            catch
            {
                return JsonSerializer.Serialize(
                    new
                    {
                        ok = true,
                        success = true,
                        data = raw,
                        error = (string?)null,
                    },
                    _jsonOptions
                );
            }
        }

        private string Error(string message)
        {
            return JsonSerializer.Serialize(
                new
                {
                    ok = false,
                    success = false,
                    data = (object?)null,
                    error = message,
                },
                _jsonOptions
            );
        }

        private void Log(string type, string message)
        {
            var timestamp = DateTime.Now.ToString("HH:mm:ss");

            switch (type)
            {
                case "ERROR":
                    Console.ForegroundColor = ConsoleColor.Red;
                    break;
                case "SUCCESS":
                    Console.ForegroundColor = ConsoleColor.Green;
                    break;
                default:
                    Console.ForegroundColor = ConsoleColor.Gray;
                    break;
            }

            Console.WriteLine($"[{timestamp}] [{type}] {message}");
            Console.ResetColor();
        }
    }
}
