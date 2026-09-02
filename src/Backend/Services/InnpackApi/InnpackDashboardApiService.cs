using System.Threading.Tasks;

namespace QualityControlCenter.Backend.Services.InnpackApi
{
    // Wrapper delgado sobre InnpackApiClient para "Dashboard Calidad" (Inspecciones Calidad)
    // INNPACK. Ver contex.md sobre la migración de INNPACK a arquitectura API.
    public class InnpackDashboardApiService
    {
        private readonly InnpackApiClient _client;

        public InnpackDashboardApiService(InnpackApiClient client)
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
                $"api/dashboard/resumen?fechaDesde={System.Uri.EscapeDataString(fechaDesde)}"
                + $"&fechaHasta={System.Uri.EscapeDataString(fechaHasta)}"
                + $"&inspector={System.Uri.EscapeDataString(inspector)}"
                + $"&turno={System.Uri.EscapeDataString(turno)}"
                + $"&proceso={System.Uri.EscapeDataString(proceso)}";

            return _client.GetAsync(query);
        }

        public Task<(bool ok, string body)> ObtenerFiltrosAsync() => _client.GetAsync("api/dashboard/filtros");

        public Task<(bool ok, string body)> ValidarRegistroAsync(int id) =>
            _client.PutJsonAsync($"api/dashboard/{id}/validar", new { });

        public Task<(bool ok, string body)> RechazarRegistroAsync(int id) =>
            _client.PutJsonAsync($"api/dashboard/{id}/rechazar", new { });

        public Task<(bool ok, string body)> EliminarRegistroAsync(int id) =>
            _client.DeleteAsync($"api/dashboard/{id}");

        public Task<(bool ok, string body)> ValidarTodoAsync() =>
            _client.PutJsonAsync("api/dashboard/validar-todo", new { });

        public Task<(bool ok, string body)> RechazarTodoAsync() =>
            _client.PutJsonAsync("api/dashboard/rechazar-todo", new { });
    }
}
