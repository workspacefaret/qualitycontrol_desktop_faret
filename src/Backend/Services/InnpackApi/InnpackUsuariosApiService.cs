using System.Threading.Tasks;

namespace QualityControlCenter.Backend.Services.InnpackApi
{
    // Wrapper delgado sobre InnpackApiClient para el módulo "Gestión de Usuarios" INNPACK —
    // mismo patrón que FaretUsuariosApiService (Services/FaretApi/). Ver contex.md sobre la
    // migración de INNPACK a arquitectura API.
    public class InnpackUsuariosApiService
    {
        private readonly InnpackApiClient _client;

        public InnpackUsuariosApiService(InnpackApiClient client)
        {
            _client = client;
        }

        public Task<(bool ok, string body)> GetListAsync() => _client.GetAsync("api/usuarios");

        public Task<(bool ok, string body)> CreateAsync(
            string codigoUsuario,
            string nombreCompleto,
            string password,
            string rol,
            bool activo
        ) =>
            _client.PostJsonAsync(
                "api/usuarios",
                new
                {
                    codigoUsuario,
                    nombreCompleto,
                    password,
                    rol,
                    activo,
                }
            );

        public Task<(bool ok, string body)> DeleteAsync(int id) => _client.DeleteAsync($"api/usuarios/{id}");

        public Task<(bool ok, string body)> ResetPasswordAsync(int id, string nuevaPassword) =>
            _client.PutJsonAsync($"api/usuarios/{id}/password", new { nuevaPassword });

        // Borrado físico: la API solo lo permite si el usuario no tiene historial.
        public Task<(bool ok, string body)> EliminarDefinitivoAsync(int id) =>
            _client.DeleteAsync($"api/usuarios/{id}/definitivo");

        public Task<(bool ok, string body)> SetActivoAsync(int id, bool activo) =>
            _client.PutJsonAsync($"api/usuarios/{id}/activo", new { activo });

        public Task<(bool ok, string body)> CambiarRolAsync(int id, string rol) =>
            _client.PutJsonAsync($"api/usuarios/{id}/rol", new { rol });

        // Permisos por módulo (solo admin_ti, la API lo exige).
        public Task<(bool ok, string body)> GetPermisosAsync(int id) =>
            _client.GetAsync($"api/usuarios/{id}/permisos");

        public Task<(bool ok, string body)> GuardarPermisosAsync(int id, object permisos) =>
            _client.PutJsonAsync($"api/usuarios/{id}/permisos", new { permisos });

        public Task<(bool ok, string body)> RestablecerPermisosAsync(int id) =>
            _client.DeleteAsync($"api/usuarios/{id}/permisos");
    }
}
