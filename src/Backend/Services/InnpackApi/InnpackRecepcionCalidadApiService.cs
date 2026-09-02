using System;
using System.Threading.Tasks;

namespace QualityControlCenter.Backend.Services.InnpackApi
{
    // Wrapper delgado sobre InnpackApiClient para Control de Recepción - Calidad ("recepcion.*",
    // solo la parte MySQL — la consulta a SAP sigue viviendo en el desktop vía
    // SapRecepcionApiClient). Ver contex.md sobre la migración de INNPACK a arquitectura API.
    public class InnpackRecepcionCalidadApiService
    {
        private readonly InnpackApiClient _client;

        public InnpackRecepcionCalidadApiService(InnpackApiClient client)
        {
            _client = client;
        }

        public Task<(bool ok, string body)> CrearLoteAsync(object request) => _client.PostJsonAsync("api/recepcion-calidad", request);

        public Task<(bool ok, string body)> ListAsync(string? estado, string? tipoMateriaPrima, string empresa)
        {
            var query = "api/recepcion-calidad?";
            if (!string.IsNullOrWhiteSpace(estado))
                query += $"estado={Uri.EscapeDataString(estado)}&";
            if (!string.IsNullOrWhiteSpace(tipoMateriaPrima))
                query += $"tipoMateriaPrima={Uri.EscapeDataString(tipoMateriaPrima)}&";
            query += $"empresa={Uri.EscapeDataString(empresa)}";
            return _client.GetAsync(query);
        }

        public Task<(bool ok, string body)> DetalleAsync(int id, string empresa) =>
            _client.GetAsync($"api/recepcion-calidad/{id}?empresa={Uri.EscapeDataString(empresa)}");

        public Task<(bool ok, string body)> FotoAsync(int id, string tipoMateriaPrima) =>
            _client.GetAsync($"api/recepcion-calidad/{id}/foto?tipoMateriaPrima={Uri.EscapeDataString(tipoMateriaPrima)}");

        public Task<(bool ok, string body)> CrearNoConformidadAsync(int id, string? usuarioNombre) =>
            _client.PostJsonAsync($"api/recepcion-calidad/{id}/nc", new { usuarioNombre });

        public Task<(bool ok, string body)> GenerarPlanAsync(int id, string nivelInspeccion, decimal aql) =>
            _client.PostJsonAsync($"api/recepcion-calidad/{id}/plan", new { nivelInspeccion, aql });

        public Task<(bool ok, string body)> MuestrearBobinasAsync(int id, object request) =>
            _client.PostJsonAsync($"api/recepcion-calidad/{id}/bobinas-muestreadas", request);

        public Task<(bool ok, string body)> CrearMuestraLaboratorioAsync(int id, object request) =>
            _client.PostJsonAsync($"api/recepcion-calidad/{id}/muestra-laboratorio", request);

        public Task<(bool ok, string body)> ActualizarEstadoAsync(int id, string estado) =>
            _client.PatchJsonAsync($"api/recepcion-calidad/{id}/estado", new { estado });
    }
}
