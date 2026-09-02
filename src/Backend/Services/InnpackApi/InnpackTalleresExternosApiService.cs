using System.Threading.Tasks;

namespace QualityControlCenter.Backend.Services.InnpackApi
{
    // Wrapper delgado sobre InnpackApiClient para Talleres Externos INNPACK (incluye
    // sincronización con FPS). Ver contex.md sobre la migración de INNPACK a arquitectura API.
    public class InnpackTalleresExternosApiService
    {
        private readonly InnpackApiClient _client;

        public InnpackTalleresExternosApiService(InnpackApiClient client)
        {
            _client = client;
        }

        public Task<(bool ok, string body)> ListAsync(int page, int pageSize) =>
            _client.GetAsync($"api/talleres-externos?page={page}&pageSize={pageSize}");

        public Task<(bool ok, string body)> CatalogosAsync() => _client.GetAsync("api/talleres-externos/catalogos");

        public Task<(bool ok, string body)> CrearAsync(object request) =>
            _client.PostJsonAsync("api/talleres-externos", request);

        public Task<(int status, string body)> ActualizarAsync(long id, object request) =>
            _client.PutJsonWithStatusAsync($"api/talleres-externos/{id}", request);

        public Task<(int status, string body)> EliminarAsync(long id, int version, int? usuarioId)
        {
            var query = $"api/talleres-externos/{id}?version={version}";
            if (usuarioId.HasValue)
                query += $"&usuarioId={usuarioId.Value}";
            return _client.DeleteWithStatusAsync(query);
        }

        public Task<(bool ok, string body)> EliminarTallerAsync(int id) =>
            _client.DeleteAsync($"api/talleres-externos/catalogos/talleres/{id}");

        public Task<(bool ok, string body)> EliminarProcesoAsync(int id) =>
            _client.DeleteAsync($"api/talleres-externos/catalogos/procesos/{id}");

        public Task<(bool ok, string body)> HistorialLiberacionesAsync(long id) =>
            _client.GetAsync($"api/talleres-externos/{id}/historial-liberaciones");

        public Task<(bool ok, string body)> SincronizarFpsAsync(int? usuarioId) =>
            _client.PostJsonAsync("api/talleres-externos/sincronizar-fps", new { usuarioId });
    }
}
