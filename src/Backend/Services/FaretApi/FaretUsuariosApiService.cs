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

        public Task<(bool ok, string body)> CreateAsync(string nombre, string username, string rol) =>
            _client.PostJsonAsync(
                "api/usuarios",
                new
                {
                    nombre,
                    username,
                    password = "Faret2026",
                    rol,
                    roles = new[] { rol },
                }
            );

        public Task<(bool ok, string body)> ResetPasswordAsync(int id) =>
            _client.PutJsonAsync($"api/usuarios/{id}/password", new { password = "Faret2026" });

        public Task<(bool ok, string body)> ActivarAsync(int id) =>
            _client.PutJsonAsync($"api/usuarios/{id}/activar", new { });

        public Task<(bool ok, string body)> DesactivarAsync(int id) => _client.DeleteAsync($"api/usuarios/{id}");
    }
}
