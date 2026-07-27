using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace QualityControlCenter.Backend.Services.FaretApi
{
    // Talleres Externos vive en la API "qualitycontrol" (JWT + roles ya existentes), igual que
    // Importaciones/Usuarios/Catalogos — no en mejora-continua (sin auth) ni en calidad Node.
    public class FaretTalleresExternosApiService
    {
        private readonly FaretApiClient _client;

        public FaretTalleresExternosApiService(FaretApiClient client)
        {
            _client = client;
        }

        public Task<(bool ok, string body)> GetListAsync(Dictionary<string, string?> filtros) =>
            _client.GetAsync($"api/talleres-externos?{BuildQueryString(filtros)}");

        public Task<(bool ok, string body)> GetResumenAsync(Dictionary<string, string?> filtros) =>
            _client.GetAsync($"api/talleres-externos/resumen?{BuildQueryString(filtros)}");

        public Task<(bool ok, string body)> GetCatalogosAsync() =>
            _client.GetAsync("api/talleres-externos/catalogos");

        public Task<(bool ok, string body)> CrearTallerAsync(object request) =>
            _client.PostJsonAsync("api/talleres-externos/catalogos/talleres", request);

        public Task<(bool ok, string body)> CrearProcesoAsync(object request) =>
            _client.PostJsonAsync("api/talleres-externos/catalogos/procesos", request);

        public Task<(bool ok, string body)> EliminarTallerAsync(int id) =>
            _client.DeleteAsync($"api/talleres-externos/catalogos/talleres/{id}");

        public Task<(bool ok, string body)> EliminarProcesoAsync(int id) =>
            _client.DeleteAsync($"api/talleres-externos/catalogos/procesos/{id}");

        public Task<(bool ok, string body)> GetByIdAsync(long id) =>
            _client.GetAsync($"api/talleres-externos/{id}");

        public Task<(bool ok, string body)> CrearAsync(object request) =>
            _client.PostJsonAsync("api/talleres-externos", request);

        public Task<(bool ok, string body)> ActualizarAsync(long id, object request) =>
            _client.PutJsonAsync($"api/talleres-externos/{id}", request);

        public Task<(bool ok, string body)> GuardarLoteAsync(object request) =>
            _client.PutJsonAsync("api/talleres-externos/lote", request);

        public Task<(bool ok, string body)> EliminarAsync(long id, int version, string? motivo)
        {
            var query = $"version={version}";
            if (!string.IsNullOrWhiteSpace(motivo))
                query += $"&motivo={Uri.EscapeDataString(motivo)}";
            return _client.DeleteAsync($"api/talleres-externos/{id}?{query}");
        }

        private static string BuildQueryString(Dictionary<string, string?> filtros) =>
            string.Join(
                "&",
                filtros
                    .Where(kv => !string.IsNullOrEmpty(kv.Value))
                    .Select(kv => $"{Uri.EscapeDataString(kv.Key)}={Uri.EscapeDataString(kv.Value!)}")
            );
    }
}
