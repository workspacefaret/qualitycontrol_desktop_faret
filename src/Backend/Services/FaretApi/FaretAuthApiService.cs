using System;
using System.Text.Json;
using System.Threading.Tasks;
using QualityControlCenter.Backend.Models.FaretApi;

namespace QualityControlCenter.Backend.Services.FaretApi
{
    public class FaretAuthApiService
    {
        private readonly FaretApiClient _client;

        public FaretAuthApiService(FaretApiClient client)
        {
            _client = client;
        }

        // Respuesta real de la API:
        // { success, message, data: { token, expiresAt, usuario: { nombre, roles: ["ADMIN"] },
        //   debeCambiarPassword, motivoCambioPassword, diasParaVencer, passwordVenceEl } }
        public async Task<(bool ok, LoginResponse? data, string? error)> LoginAsync(
            string identificador,
            string password
        )
        {
            var (ok, body) = await _client.PostJsonAsync(
                "api/Auth/login",
                new LoginRequest { Identificador = identificador, Password = password }
            );

            return ProcesarRespuestaSesion(ok, body, "Credenciales incorrectas");
        }

        // Cambio de clave por el propio usuario (política de contraseñas, 15-10-2026). La API
        // devuelve un token nuevo (sin "cambio pendiente") que reemplaza al de la sesión.
        public async Task<(bool ok, LoginResponse? data, string? error)> CambiarPasswordAsync(
            string passwordActual,
            string passwordNueva
        )
        {
            var (ok, body) = await _client.PostJsonAsync(
                "api/Auth/cambiar-password",
                new { passwordActual, passwordNueva }
            );

            return ProcesarRespuestaSesion(ok, body, "No se pudo cambiar la contraseña");
        }

        private (bool ok, LoginResponse? data, string? error) ProcesarRespuestaSesion(
            bool ok,
            string body,
            string errorPorDefecto
        )
        {
            try
            {
                using var doc = JsonDocument.Parse(body);
                var root = doc.RootElement;

                // Caso error (ok=false o success=false en la respuesta)
                if (!ok || (root.TryGetProperty("success", out var s) && !s.GetBoolean()))
                {
                    string? msg = null;
                    if (root.TryGetProperty("message", out var m)) msg = m.GetString();
                    else if (root.TryGetProperty("error", out var e)) msg = e.GetString();
                    return (false, null, msg ?? errorPorDefecto);
                }

                // Extraer data anidada
                if (!root.TryGetProperty("data", out var dataEl) || dataEl.ValueKind == JsonValueKind.Null)
                    return (false, null, "Respuesta de login inválida");

                var token = dataEl.TryGetProperty("token", out var t) ? t.GetString() : null;
                if (string.IsNullOrEmpty(token))
                    return (false, null, "Token no recibido en la respuesta");

                string nombre = "";
                string role = "";

                if (dataEl.TryGetProperty("usuario", out var usuario))
                {
                    nombre = usuario.TryGetProperty("nombre", out var n) ? n.GetString() ?? "" : "";

                    if (usuario.TryGetProperty("roles", out var roles) && roles.ValueKind == JsonValueKind.Array)
                    {
                        foreach (var r in roles.EnumerateArray())
                        {
                            role = r.GetString() ?? "";
                            break;
                        }
                    }
                }

                var loginResp = new LoginResponse
                {
                    Token = token,
                    Username = nombre,
                    Role = role,
                    DebeCambiarPassword =
                        dataEl.TryGetProperty("debeCambiarPassword", out var dc)
                        && dc.ValueKind == JsonValueKind.True,
                    MotivoCambioPassword =
                        dataEl.TryGetProperty("motivoCambioPassword", out var mo) && mo.ValueKind == JsonValueKind.String
                            ? mo.GetString()
                            : null,
                    DiasParaVencer =
                        dataEl.TryGetProperty("diasParaVencer", out var dv) && dv.ValueKind == JsonValueKind.Number
                            ? dv.GetInt32()
                            : null,
                    PasswordVenceEl =
                        dataEl.TryGetProperty("passwordVenceEl", out var ve) && ve.ValueKind == JsonValueKind.String
                            ? ve.GetString()
                            : null,
                };

                _client.SetToken(loginResp.Token);
                return (true, loginResp, null);
            }
            catch (Exception ex)
            {
                return (false, null, $"Error al procesar respuesta: {ex.Message}");
            }
        }

        public void Logout() => _client.ClearToken();
    }
}
