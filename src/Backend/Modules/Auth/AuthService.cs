using System;
using System.Text.Json;
using System.Threading.Tasks;
using QualityControlCenter.Backend.Services.InnpackApi;
using QualityControlCenter.Models;
using QualityControlCenter.Services;

namespace QualityControlCenter.Modules.Auth
{
    public class AuthService
    {
        private readonly InnpackApiClient _api;
        private readonly CurrentUserSessionService _session;

        private static readonly JsonSerializerOptions _jsonOpts = new()
        {
            PropertyNameCaseInsensitive = true,
        };

        public AuthService(InnpackApiClient api, CurrentUserSessionService session)
        {
            _api = api;
            _session = session;
        }

        // Mismos 3 mensajes/comportamiento que antes (validación ahora ocurre en
        // QualityControlInnpack.Api, no contra MySQL directo desde el desktop) — el frontend de
        // login y el resto de la app no notan la diferencia.
        public async Task<LoginResponse> LoginAsync(LoginRequest request)
        {
            var (ok, body) = await _api.PostJsonAsync(
                "api/auth/login",
                new { codigoUsuario = request.CodigoUsuario, password = request.Password }
            );

            string? mensaje;
            try
            {
                using var doc = JsonDocument.Parse(body);
                mensaje = doc.RootElement.TryGetProperty("message", out var m) ? m.GetString() : null;
            }
            catch
            {
                mensaje = null;
            }

            if (!ok)
            {
                return new LoginResponse
                {
                    Success = false,
                    Message = mensaje ?? "Error al comunicarse con la API",
                };
            }

            ApiLoginData? data;
            try
            {
                using var doc = JsonDocument.Parse(body);
                data = doc.RootElement.GetProperty("data").Deserialize<ApiLoginData>(_jsonOpts);
            }
            catch
            {
                data = null;
            }

            if (data == null || string.IsNullOrEmpty(data.Token))
            {
                return new LoginResponse { Success = false, Message = "Respuesta inválida de la API" };
            }

            _api.SetToken(data.Token);

            var user = new User
            {
                Id = data.UserId,
                CodigoUsuario = data.CodigoUsuario,
                NombreCompleto = data.NombreCompleto,
                Rol = data.Rol,
                Activo = true,
            };
            _session.SetCurrentUser(user);

            return new LoginResponse
            {
                Success = true,
                Message = mensaje ?? "Login correcto",
                UserId = user.Id,
                CodigoUsuario = user.CodigoUsuario,
                NombreCompleto = user.NombreCompleto,
                Rol = user.Rol,
            };
        }

        public void Logout()
        {
            _api.ClearToken();
            _session.Clear();
        }

        public User? GetCurrentUser()
        {
            return _session.GetCurrentUser();
        }

        public bool IsAuthenticated()
        {
            return _session.IsAuthenticated;
        }

        private class ApiLoginData
        {
            public string Token { get; set; } = "";
            public int UserId { get; set; }
            public string CodigoUsuario { get; set; } = "";
            public string NombreCompleto { get; set; } = "";
            public string Rol { get; set; } = "";
        }
    }
}
