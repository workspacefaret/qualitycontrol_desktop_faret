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
        // { success, message, data: { token, expiresAt, usuario: { nombre, roles: ["ADMIN"] } } }
        public async Task<(bool ok, LoginResponse? data, string? error)> LoginAsync(
            string identificador,
            string password
        )
        {
            var (ok, body) = await _client.PostJsonAsync(
                "api/Auth/login",
                new LoginRequest { Identificador = identificador, Password = password }
            );

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
                    return (false, null, msg ?? "Credenciales incorrectas");
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
