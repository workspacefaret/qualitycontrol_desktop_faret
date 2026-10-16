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
                new { codigoUsuario = request.CodigoUsuario, password = request.Password, soportaCambioPassword = true }
            );

            return ProcesarRespuestaSesion(ok, body, "Login correcto");
        }

        // Cambio de clave por el propio usuario (política de contraseñas, 15-10-2026). La API
        // devuelve un token nuevo (sin "cambio pendiente") que reemplaza al de la sesión.
        public async Task<LoginResponse> CambiarPasswordAsync(string passwordActual, string passwordNueva)
        {
            if (!_session.IsAuthenticated)
                return new LoginResponse { Success = false, Message = "No hay sesión activa" };

            var (ok, body) = await _api.PostJsonAsync(
                "api/auth/cambiar-password",
                new { passwordActual, passwordNueva }
            );

            return ProcesarRespuestaSesion(ok, body, "Contraseña actualizada correctamente");
        }

        // Respuesta de login y de cambio de clave: mismo shape ApiResponse<LoginResponseDto>.
        private LoginResponse ProcesarRespuestaSesion(bool ok, string body, string mensajeOk)
        {
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
                Message = mensaje ?? mensajeOk,
                UserId = user.Id,
                CodigoUsuario = user.CodigoUsuario,
                NombreCompleto = user.NombreCompleto,
                Rol = user.Rol,
                DebeCambiarPassword = data.DebeCambiarPassword,
                MotivoCambioPassword = data.MotivoCambioPassword,
                DiasParaVencer = data.DiasParaVencer,
                PasswordVenceEl = data.PasswordVenceEl,
            };
        }

        public void Logout()
        {
            _api.ClearToken(cerrarSesion: true);
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
            public bool DebeCambiarPassword { get; set; }
            public string? MotivoCambioPassword { get; set; }
            public int? DiasParaVencer { get; set; }
            public DateTime? PasswordVenceEl { get; set; }
        }
    }
}
