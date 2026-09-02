using System.Threading.Tasks;

namespace QualityControlCenter.Backend.Services.InnpackApi
{
    // Wrapper delgado sobre InnpackApiClient para "Data" (registros de control) INNPACK. Ver
    // contex.md sobre la migración de INNPACK a arquitectura API.
    public class InnpackRegistrosControlApiService
    {
        private readonly InnpackApiClient _client;

        public InnpackRegistrosControlApiService(InnpackApiClient client)
        {
            _client = client;
        }

        public Task<(bool ok, string body)> ObtenerRegistrosAsync(
            int page,
            int limit,
            string? fechaDesde,
            string? fechaHasta,
            string? np,
            string? turno,
            string? estado,
            int? id,
            int? procesoId,
            int? parametroId
        )
        {
            var query = $"api/registros-control?page={page}&limit={limit}";

            if (!string.IsNullOrWhiteSpace(fechaDesde))
                query += $"&fechaDesde={System.Uri.EscapeDataString(fechaDesde)}";
            if (!string.IsNullOrWhiteSpace(fechaHasta))
                query += $"&fechaHasta={System.Uri.EscapeDataString(fechaHasta)}";
            if (!string.IsNullOrWhiteSpace(np))
                query += $"&np={System.Uri.EscapeDataString(np)}";
            if (!string.IsNullOrWhiteSpace(turno))
                query += $"&turno={System.Uri.EscapeDataString(turno)}";
            if (!string.IsNullOrWhiteSpace(estado))
                query += $"&estado={System.Uri.EscapeDataString(estado)}";
            if (id.HasValue)
                query += $"&id={id.Value}";
            if (procesoId.HasValue)
                query += $"&procesoId={procesoId.Value}";
            if (parametroId.HasValue)
                query += $"&parametroId={parametroId.Value}";

            return _client.GetAsync(query);
        }

        public Task<(bool ok, string body)> ValidarRegistroAsync(int id) =>
            _client.PutJsonAsync($"api/registros-control/{id}/validar", new { });

        public Task<(bool ok, string body)> RechazarRegistroAsync(int id) =>
            _client.PutJsonAsync($"api/registros-control/{id}/rechazar", new { });

        public Task<(bool ok, string body)> EliminarRegistroAsync(int id) =>
            _client.DeleteAsync($"api/registros-control/{id}");
    }
}
