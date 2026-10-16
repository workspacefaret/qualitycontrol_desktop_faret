using System.Threading.Tasks;

namespace QualityControlCenter.Backend.Services.FaretApi
{
    public class FaretUsuariosApiService
    {
        private readonly FaretApiClient _client;

        public FaretUsuariosApiService(FaretApiClient client)
        {
            _client = client;
        }

        public Task<(bool ok, string body)> GetListAsync(bool? soloActivos) =>
            _client.GetAsync(
                soloActivos.HasValue
                    ? $"api/usuarios?soloActivos={(soloActivos.Value ? "true" : "false")}"
                    : "api/usuarios"
            );

        // Clave inicial/temporal: la escribe el ADMIN_TI (antes era siempre "Faret2026" fija,
        // origen de que todos los usuarios compartieran la misma clave). La API la marca como
        // temporal: el usuario define la suya en su primer ingreso (política de contraseñas).
        public Task<(bool ok, string body)> CreateAsync(string nombre, string username, string rol, string password) =>
            _client.PostJsonAsync(
                "api/usuarios",
                new
                {
                    nombre,
                    username,
                    password,
                    rol,
                    roles = new[] { rol },
                }
            );

        public Task<(bool ok, string body)> UpdateRolesAsync(int id, string rol) =>
            _client.PutJsonAsync($"api/usuarios/{id}/roles", new { roles = new[] { rol } });

        public Task<(bool ok, string body)> ResetPasswordAsync(int id, string password) =>
            _client.PutJsonAsync($"api/usuarios/{id}/password", new { password });

        public Task<(bool ok, string body)> ActivarAsync(int id) =>
            _client.PutJsonAsync($"api/usuarios/{id}/activar", new { });

        public Task<(bool ok, string body)> DesactivarAsync(int id) => _client.DeleteAsync($"api/usuarios/{id}");

        // Borrado físico: la API solo lo permite si el usuario no tiene historial.
        public Task<(bool ok, string body)> EliminarDefinitivoAsync(int id) =>
            _client.DeleteAsync($"api/usuarios/{id}/definitivo");

        // Permisos por módulo (solo ADMIN_TI, la API lo exige).
        public Task<(bool ok, string body)> GetPermisosAsync(int id) =>
            _client.GetAsync($"api/usuarios/{id}/permisos");

        public Task<(bool ok, string body)> GuardarPermisosAsync(int id, object permisos) =>
            _client.PutJsonAsync($"api/usuarios/{id}/permisos", new { permisos });

        public Task<(bool ok, string body)> RestablecerPermisosAsync(int id) =>
            _client.DeleteAsync($"api/usuarios/{id}/permisos");
    }
}
