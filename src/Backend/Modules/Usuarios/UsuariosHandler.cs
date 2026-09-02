using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using QualityControlCenter.Backend.Services.InnpackApi;
using QualityControlCenter.Services;

namespace QualityControlCenter.Modules.Usuarios
{
    // Migrado a QualityControlInnpack.Api — ya no consulta MySQL directo desde el desktop
    // (UsuariosRepository.cs se retiró en el Paso 16 de la migración). La validación de negocio
    // (contraseña, rol, duplicados, "no puedes eliminarte a ti mismo") vive ahora en
    // UsuariosService de la API; este Handler valida solo presencia de campos y reenvía. Ver
    // contex.md sobre la migración de INNPACK a arquitectura API.
    public class UsuariosHandler
    {
        private readonly InnpackApiClient _client;
        private readonly InnpackUsuariosApiService _usuariosApi;
        private readonly CurrentUserSessionService _session;

        public UsuariosHandler(InnpackApiClient client, CurrentUserSessionService session)
        {
            _client = client;
            _usuariosApi = new InnpackUsuariosApiService(client);
            _session = session;
        }

        public async Task<string> Handle(string action, Dictionary<string, object> payload)
        {
            try
            {
                if (!IsAdmin())
                    return Error("Acceso no autorizado");

                if (!_client.HasToken)
                    return Error("No autenticado en API Innpack");

                return action switch
                {
                    "usuarios.list" => await ListAsync(),
                    "usuarios.create" => await CreateAsync(payload),
                    "usuarios.delete" => await DeleteAsync(payload),
                    "usuarios.resetPassword" => await ResetPasswordAsync(payload),
                    _ => Error($"Acción no soportada: {action}"),
                };
            }
            catch (Exception ex)
            {
                return Error(ex.Message);
            }
        }

        private bool IsAdmin()
        {
            var user = _session.GetCurrentUser();

            if (user == null)
                return false;

            return user.Rol == "admin" || user.Rol == "admin_ti";
        }

        // La API nueva devuelve camelCase (default de ASP.NET Core), pero el frontend
        // (usuarios.controller.js) espera PascalCase — así serializaba el código C# viejo por
        // defecto, sin política de naming. Reproyectar acá (en vez de pasar el JSON crudo)
        // mantiene el frontend intacto. Bug real encontrado en dotnet run: un passthrough directo
        // dejaba la tabla con N filas pero todos los campos en blanco (la llamada sí funcionaba,
        // solo los nombres de propiedad no calzaban). Ver contex.md.
        private async Task<string> ListAsync()
        {
            var (ok, body) = await _usuariosApi.GetListAsync();

            if (!TryUnwrapApiResponse(body, out var data, out var error) || !ok)
                return Error(error);

            var jsonOpts = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
            var usuarios =
                JsonSerializer.Deserialize<List<UsuarioApiDto>>(data.GetRawText(), jsonOpts)
                ?? new List<UsuarioApiDto>();

            var proyectado = usuarios.Select(u => new
            {
                u.Id,
                u.CodigoUsuario,
                u.NombreCompleto,
                u.Rol,
                u.Activo,
                u.CreadoEn,
                u.ActualizadoEn,
            });

            return Ok(proyectado);
        }

        private class UsuarioApiDto
        {
            public int Id { get; set; }
            public string CodigoUsuario { get; set; } = "";
            public string NombreCompleto { get; set; } = "";
            public string Rol { get; set; } = "";
            public bool Activo { get; set; }
            public DateTime? CreadoEn { get; set; }
            public DateTime? ActualizadoEn { get; set; }
        }

        private async Task<string> CreateAsync(Dictionary<string, object> payload)
        {
            var data = ExtractData(payload);

            if (data.ValueKind != JsonValueKind.Object)
                return Error("Datos inválidos");

            var codigoUsuario = GetString(data, "codigoUsuario");
            var nombreCompleto = GetString(data, "nombreCompleto");
            var password = GetString(data, "password");
            var rol = GetString(data, "rol");
            var activo = GetBool(data, "activo", true);

            if (string.IsNullOrWhiteSpace(codigoUsuario))
                return Error("El código de usuario es obligatorio");

            if (string.IsNullOrWhiteSpace(nombreCompleto))
                return Error("El nombre completo es obligatorio");

            if (string.IsNullOrWhiteSpace(password))
                return Error("La contraseña es obligatoria");

            if (string.IsNullOrWhiteSpace(rol))
                return Error("El rol es obligatorio");

            var (ok, body) = await _usuariosApi.CreateAsync(
                codigoUsuario,
                nombreCompleto,
                password,
                rol,
                activo
            );

            if (!TryUnwrapApiResponse(body, out var responseData, out var error) || !ok)
                return Error(error);

            var newId =
                responseData.ValueKind == JsonValueKind.Object
                && responseData.TryGetProperty("id", out var idProp)
                && idProp.TryGetInt32(out var idValue)
                    ? idValue
                    : (int?)null;

            return Ok(new { message = "Usuario creado correctamente", id = newId });
        }

        private async Task<string> DeleteAsync(Dictionary<string, object> payload)
        {
            var data = ExtractData(payload);

            if (data.ValueKind != JsonValueKind.Object)
                return Error("Datos inválidos");

            var id = GetInt(data, "id");

            if (id <= 0)
                return Error("Id inválido");

            var (ok, body) = await _usuariosApi.DeleteAsync(id);

            if (!TryUnwrapApiResponse(body, out _, out var error) || !ok)
                return Error(error);

            return Ok(new { message = "Usuario eliminado correctamente" });
        }

        private async Task<string> ResetPasswordAsync(Dictionary<string, object> payload)
        {
            var data = ExtractData(payload);

            if (data.ValueKind != JsonValueKind.Object)
                return Error("Datos inválidos");

            var id = GetInt(data, "id");
            var nuevaPassword = GetString(data, "nuevaPassword");

            if (id <= 0)
                return Error("Id inválido");

            if (string.IsNullOrWhiteSpace(nuevaPassword))
                return Error("La nueva contraseña es obligatoria");

            var (ok, body) = await _usuariosApi.ResetPasswordAsync(id, nuevaPassword);

            if (!TryUnwrapApiResponse(body, out _, out var error) || !ok)
                return Error(error);

            return Ok(new { message = "Contraseña actualizada correctamente" });
        }

        // Desenvuelve el shape ApiResponse<T> {success, message, data, errors} de
        // QualityControlInnpack.Api — mismo criterio que TryUnwrapApiResponse en FaretHandler.cs
        // para la API `qualitycontrol` de Faret (mismo shape, misma librería ApiResponse<T>).
        private static bool TryUnwrapApiResponse(string body, out JsonElement data, out string error)
        {
            data = default;
            error = "Error al comunicarse con la API Innpack";

            try
            {
                using var doc = JsonDocument.Parse(body);
                var root = doc.RootElement;

                if (root.TryGetProperty("success", out var s))
                {
                    if (!s.GetBoolean())
                    {
                        error = root.TryGetProperty("message", out var m) ? (m.GetString() ?? error) : error;
                        return false;
                    }

                    if (root.TryGetProperty("data", out var d))
                    {
                        data = d.Clone();
                        return true;
                    }

                    return true;
                }

                return false;
            }
            catch
            {
                return false;
            }
        }

        private JsonElement ExtractData(Dictionary<string, object> payload)
        {
            if (!payload.TryGetValue("data", out var rawData))
                return JsonDocument.Parse("{}").RootElement.Clone();

            if (rawData is JsonElement jsonElement)
                return jsonElement;

            return JsonDocument.Parse("{}").RootElement.Clone();
        }

        private string GetString(JsonElement data, string propertyName)
        {
            if (!data.TryGetProperty(propertyName, out var prop))
                return string.Empty;

            return prop.GetString()?.Trim() ?? string.Empty;
        }

        private int GetInt(JsonElement data, string propertyName)
        {
            if (!data.TryGetProperty(propertyName, out var prop))
                return 0;

            if (prop.ValueKind == JsonValueKind.Number && prop.TryGetInt32(out var value))
                return value;

            if (prop.ValueKind == JsonValueKind.String && int.TryParse(prop.GetString(), out value))
                return value;

            return 0;
        }

        private bool GetBool(JsonElement data, string propertyName, bool defaultValue = false)
        {
            if (!data.TryGetProperty(propertyName, out var prop))
                return defaultValue;

            if (prop.ValueKind == JsonValueKind.True)
                return true;
            if (prop.ValueKind == JsonValueKind.False)
                return false;

            if (prop.ValueKind == JsonValueKind.String && bool.TryParse(prop.GetString(), out var value))
                return value;

            return defaultValue;
        }

        private string Ok(object? data)
        {
            return JsonSerializer.Serialize(
                new
                {
                    ok = true,
                    data,
                    error = (string?)null,
                }
            );
        }

        private string Error(string message)
        {
            return JsonSerializer.Serialize(
                new
                {
                    ok = false,
                    data = (object?)null,
                    error = message,
                }
            );
        }
    }
}
