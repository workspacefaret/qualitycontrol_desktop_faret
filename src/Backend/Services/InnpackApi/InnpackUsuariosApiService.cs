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
    }
}
