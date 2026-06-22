using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using BCrypt.Net;
using QualityControlCenter.Models;
using QualityControlCenter.Repositories.Usuarios;
using QualityControlCenter.Services;

namespace QualityControlCenter.Modules.Usuarios
{
    public class UsuariosHandler
    {
        private readonly UsuariosRepository _usuariosRepository;
        private readonly CurrentUserSessionService _session;

        public UsuariosHandler(DbService db, CurrentUserSessionService session)
        {
            _usuariosRepository = new UsuariosRepository(db);
            _session = session;
        }

        public async Task<string> Handle(string action, Dictionary<string, object> payload)
        {
            try
            {
                if (!IsAdmin())
                    return Error("Acceso no autorizado");

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

        private async Task<string> ListAsync()
        {
            var usuarios = await _usuariosRepository.GetAllAsync();

            var data = usuarios.Select(u => new
            {
                u.Id,
                u.CodigoUsuario,
                u.NombreCompleto,
                u.Rol,
                u.Activo,
                u.CreadoEn,
                u.ActualizadoEn,
            });

            return Ok(data);
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

            if (password.Length < 6)
                return Error("La contraseña debe tener al menos 6 caracteres");

            if (string.IsNullOrWhiteSpace(rol))
                return Error("El rol es obligatorio");

            if (rol != "admin" && rol != "operador")
                return Error("Rol inválido");

            var existe = await _usuariosRepository.ExistsByCodigoUsuarioAsync(codigoUsuario);
            if (existe)
                return Error("Ya existe un usuario con ese código");

            var passwordHash = BCrypt.Net.BCrypt.HashPassword(password);

            var user = new User
            {
                CodigoUsuario = codigoUsuario.Trim(),
                NombreCompleto = nombreCompleto.Trim(),
                PasswordHash = passwordHash,
                Rol = rol.Trim(),
                Activo = activo,
            };

            var newId = await _usuariosRepository.CreateAsync(user);

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

            var currentUser = _session.GetCurrentUser();
            if (currentUser != null && currentUser.Id == id)
                return Error("No puedes eliminar tu propio usuario");

            var existingUser = await _usuariosRepository.GetByIdAsync(id);
            if (existingUser == null)
                return Error("Usuario no encontrado");

            var deleted = await _usuariosRepository.DeleteAsync(id);

            if (!deleted)
                return Error("No se pudo eliminar el usuario");

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

            if (nuevaPassword.Length < 6)
                return Error("La nueva contraseña debe tener al menos 6 caracteres");

            var currentUser = _session.GetCurrentUser();
            if (currentUser != null && currentUser.Id == id)
                return Error("No puedes cambiar tu propia contraseña desde aquí");

            var existingUser = await _usuariosRepository.GetByIdAsync(id);
            if (existingUser == null)
                return Error("Usuario no encontrado");

            var passwordHash = BCrypt.Net.BCrypt.HashPassword(nuevaPassword);

            var updated = await _usuariosRepository.UpdatePasswordAsync(id, passwordHash);

            if (!updated)
                return Error("No se pudo actualizar la contraseña");

            return Ok(new { message = "Contraseña actualizada correctamente" });
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

            if (
                prop.ValueKind == JsonValueKind.String
                && bool.TryParse(prop.GetString(), out var value)
            )
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
