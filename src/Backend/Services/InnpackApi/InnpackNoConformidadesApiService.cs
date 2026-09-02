using System.Threading.Tasks;

namespace QualityControlCenter.Backend.Services.InnpackApi
{
    // Wrapper delgado sobre InnpackApiClient para No Conformidades INNPACK (Paso 14 de la
    // migración) — mismo patrón que InnpackControlDocumentalApiService: create/update reenvían el
    // payload plano tal cual (preserva la semántica de "actualización parcial" de
    // NoConformidadesService en la API), el resto usa query params / rutas con id. Los 9 catálogos
    // administrables siguen en InnpackNoConformidadesCatalogosApiService (Paso 2), sin cambios acá.
    // Ver contex.md sobre la migración de INNPACK a arquitectura API.
    public class InnpackNoConformidadesApiService
    {
        private readonly InnpackApiClient _client;

        public InnpackNoConformidadesApiService(InnpackApiClient client)
        {
            _client = client;
        }

        public Task<(bool ok, string body)> ListAsync(
            int page,
            int pageSize,
            string? cliente,
            string? tipoPnc,
            string? nivel,
            string? estadoGestion,
            string? area,
            string? fechaDesde,
            string? fechaHasta
        )
        {
            var query = $"api/no-conformidades?page={page}&pageSize={pageSize}{FiltrosQuery(cliente, tipoPnc, nivel, estadoGestion, area, fechaDesde, fechaHasta)}";
            return _client.GetAsync(query);
        }

        public Task<(bool ok, string body)> ResumenAsync(
            string? cliente,
            string? tipoPnc,
            string? nivel,
            string? estadoGestion,
            string? area,
            string? fechaDesde,
            string? fechaHasta
        )
        {
            var query = "api/no-conformidades/resumen";
            var filtros = FiltrosQuery(cliente, tipoPnc, nivel, estadoGestion, area, fechaDesde, fechaHasta);
            if (!string.IsNullOrEmpty(filtros))
                query += "?" + filtros.TrimStart('&');
            return _client.GetAsync(query);
        }

        private static string FiltrosQuery(
            string? cliente,
            string? tipoPnc,
            string? nivel,
            string? estadoGestion,
            string? area,
            string? fechaDesde,
            string? fechaHasta
        )
        {
            var q = "";
            if (!string.IsNullOrWhiteSpace(cliente))
                q += $"&cliente={System.Uri.EscapeDataString(cliente)}";
            if (!string.IsNullOrWhiteSpace(tipoPnc))
                q += $"&tipoPnc={System.Uri.EscapeDataString(tipoPnc)}";
            if (!string.IsNullOrWhiteSpace(nivel))
                q += $"&nivel={System.Uri.EscapeDataString(nivel)}";
            if (!string.IsNullOrWhiteSpace(estadoGestion))
                q += $"&estadoGestion={System.Uri.EscapeDataString(estadoGestion)}";
            if (!string.IsNullOrWhiteSpace(area))
                q += $"&area={System.Uri.EscapeDataString(area)}";
            if (!string.IsNullOrWhiteSpace(fechaDesde))
                q += $"&fechaDesde={System.Uri.EscapeDataString(fechaDesde)}";
            if (!string.IsNullOrWhiteSpace(fechaHasta))
                q += $"&fechaHasta={System.Uri.EscapeDataString(fechaHasta)}";
            return q;
        }

        public Task<(bool ok, string body)> FiltrosOpcionesAsync() => _client.GetAsync("api/no-conformidades/filtros-opciones");

        public Task<(bool ok, string body)> GetAsync(int id) => _client.GetAsync($"api/no-conformidades/{id}");

        public Task<(bool ok, string body)> CrearAsync(object body) => _client.PostJsonAsync("api/no-conformidades", body);

        public Task<(bool ok, string body)> ActualizarAsync(int id, object body) =>
            _client.PutJsonAsync($"api/no-conformidades/{id}", body);

        public Task<(bool ok, string body)> EliminarAsync(int id, string? actualizadoPor)
        {
            var query = $"api/no-conformidades/{id}";
            if (!string.IsNullOrWhiteSpace(actualizadoPor))
                query += $"?actualizadoPor={System.Uri.EscapeDataString(actualizadoPor)}";
            return _client.DeleteAsync(query);
        }

        public Task<(bool ok, string body)> GestionActualizarAsync(int id, object body) =>
            _client.PatchJsonAsync($"api/no-conformidades/{id}/gestion", body);

        public Task<(bool ok, string body)> CerrarAsync(int id, object body) =>
            _client.PostJsonAsync($"api/no-conformidades/{id}/cerrar", body);

        public Task<(bool ok, string body)> SeguimientoListAsync(int id) => _client.GetAsync($"api/no-conformidades/{id}/seguimiento");

        public Task<(bool ok, string body)> SeguimientoCrearAsync(int id, object body) =>
            _client.PostJsonAsync($"api/no-conformidades/{id}/seguimiento", body);

        public Task<(bool ok, string body)> AnalisisGetAsync(int id) => _client.GetAsync($"api/no-conformidades/{id}/analisis");

        public Task<(bool ok, string body)> AnalisisGuardarAsync(int id, object body) =>
            _client.PutJsonAsync($"api/no-conformidades/{id}/analisis", body);

        public Task<(bool ok, string body)> AccionesListAsync(int id) => _client.GetAsync($"api/no-conformidades/{id}/acciones");

        public Task<(bool ok, string body)> AccionesCrearAsync(int id, object body) =>
            _client.PostJsonAsync($"api/no-conformidades/{id}/acciones", body);

        public Task<(bool ok, string body)> AccionesActualizarAsync(int accionId, object body) =>
            _client.PutJsonAsync($"api/no-conformidades/acciones/{accionId}", body);

        public Task<(bool ok, string body)> AdjuntosListAsync(int id) => _client.GetAsync($"api/no-conformidades/{id}/adjuntos");

        public Task<(bool ok, string body)> AdjuntosSubirAsync(int id, object body) =>
            _client.PostJsonAsync($"api/no-conformidades/{id}/adjuntos", body);

        public Task<(bool ok, string body)> AdjuntosAbrirAsync(int id, int adjuntoId) =>
            _client.GetAsync($"api/no-conformidades/{id}/adjuntos/{adjuntoId}");

        public Task<(bool ok, string body)> AdjuntosEliminarAsync(int id, int adjuntoId) =>
            _client.DeleteAsync($"api/no-conformidades/{id}/adjuntos/{adjuntoId}");
    }
}
