using System.Text.Json;
using QualityControlCenter.Models;

namespace QualityControlCenter.Modules.Auth
{
    public class AuthHandler
    {
        private readonly AuthService _authService;

        public AuthHandler(AuthService authService)
        {
            _authService = authService;
        }

        public async Task<string> Handle(string action, JsonElement data)
        {
            try
            {
                return action switch
                {
                    "auth.login" => await Login(data),
                    "auth.logout" => Logout(),
                    "auth.me" => Me(),
                    _ => JsonSerializer.Serialize(
                        new { ok = false, error = $"Acción no soportada: {action}" }
                    ),
                };
            }
            catch (Exception ex)
            {
                return JsonSerializer.Serialize(new { ok = false, error = ex.Message });
            }
        }

        private async Task<string> Login(JsonElement data)
        {
            var request = JsonSerializer.Deserialize<LoginRequest>(data.GetRawText());

            if (request == null)
            {
                return JsonSerializer.Serialize(
                    new { ok = false, error = "Datos de login inválidos" }
                );
            }

            var result = await _authService.LoginAsync(request);

            return JsonSerializer.Serialize(
                new
                {
                    ok = result.Success,
                    data = result,
                    error = result.Success ? (string?)null : result.Message,
                }
            );
        }

        private string Logout()
        {
            _authService.Logout();

            return JsonSerializer.Serialize(
                new
                {
                    ok = true,
                    data = new { message = "Sesión cerrada correctamente" },
                    error = (string?)null,
                }
            );
        }

        private string Me()
        {
            var user = _authService.GetCurrentUser();

            if (user == null)
            {
                return JsonSerializer.Serialize(
                    new
                    {
                        ok = false,
                        data = (object?)null,
                        error = "No hay sesión activa",
                    }
                );
            }

            return JsonSerializer.Serialize(
                new
                {
                    ok = true,
                    data = new
                    {
                        user.Id,
                        user.CodigoUsuario,
                        user.NombreCompleto,
                        user.Rol,
                        user.Activo,
                    },
                    error = (string?)null,
                }
            );
        }
    }
}
