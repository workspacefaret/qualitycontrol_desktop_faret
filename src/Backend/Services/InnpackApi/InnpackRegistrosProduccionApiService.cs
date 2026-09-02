using System.Threading.Tasks;

namespace QualityControlCenter.Backend.Services.InnpackApi
{
    // Wrapper delgado sobre InnpackApiClient para "Registros de Producción" (Dashboard
    // Producción) INNPACK. Ver contex.md sobre la migración de INNPACK a arquitectura API.
    public class InnpackRegistrosProduccionApiService
    {
        private readonly InnpackApiClient _client;

        public InnpackRegistrosProduccionApiService(InnpackApiClient client)
        {
            _client = client;
        }

        public Task<(bool ok, string body)> ObtenerResumenAsync(
            string fechaDesde,
            string fechaHasta,
            string inspector,
            string turno,
            string proceso
        )
        {
            var query =
                $"api/registros-produccion/resumen?fechaDesde={System.Uri.EscapeDataString(fechaDesde)}"
                + $"&fechaHasta={System.Uri.EscapeDataString(fechaHasta)}"
                + $"&inspector={System.Uri.EscapeDataString(inspector)}"
                + $"&turno={System.Uri.EscapeDataString(turno)}"
                + $"&proceso={System.Uri.EscapeDataString(proceso)}";

            return _client.GetAsync(query);
        }

        public Task<(bool ok, string body)> ObtenerFiltrosAsync() =>
            _client.GetAsync("api/registros-produccion/filtros");

        public Task<(bool ok, string body)> ValidarRegistroAsync(int id) =>
            _client.PutJsonAsync($"api/registros-produccion/{id}/validar", new { });

        public Task<(bool ok, string body)> RechazarRegistroAsync(int id) =>
            _client.PutJsonAsync($"api/registros-produccion/{id}/rechazar", new { });

        public Task<(bool ok, string body)> EliminarRegistroAsync(int id) =>
            _client.DeleteAsync($"api/registros-produccion/{id}");

        public Task<(bool ok, string body)> ValidarTodoAsync() =>
            _client.PutJsonAsync("api/registros-produccion/validar-todo", new { });

        public Task<(bool ok, string body)> RechazarTodoAsync() =>
            _client.PutJsonAsync("api/registros-produccion/rechazar-todo", new { });
    }
}
