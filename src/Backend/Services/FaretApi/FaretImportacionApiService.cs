using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace QualityControlCenter.Backend.Services.FaretApi
{
    public class FaretImportacionApiService
    {
        private readonly FaretApiClient _client;

        public FaretImportacionApiService(FaretApiClient client)
        {
            _client = client;
        }

        public Task<(bool ok, string body)> ValidarAsync(string fileName, byte[] fileBytes) =>
            _client.PostMultipartFileAsync("api/importaciones/validar", "archivo", fileName, fileBytes);

        public Task<(bool ok, string body)> ConfirmarAsync(string loteId) =>
            _client.PostJsonAsync("api/importaciones/confirmar", new { loteId });

        public Task<(bool ok, string body)> GetListAsync() => _client.GetAsync("api/importaciones");

        public Task<(bool ok, string body)> CrearPncAsync(object payload) =>
            _client.PostJsonAsync("api/importaciones/pnc", payload);

        public Task<(bool ok, string body)> ActualizarPncAsync(long id, object payload) =>
            _client.PutJsonAsync($"api/importaciones/pnc/{id}", payload);

        public Task<(bool ok, string body)> GetPncListAsync(Dictionary<string, string?> filtros) =>
            _client.GetAsync($"api/importaciones/pnc?{BuildQueryString(filtros)}");

        public Task<(bool ok, string body)> GetPncResumenAsync(Dictionary<string, string?> filtros) =>
            _client.GetAsync($"api/importaciones/pnc/resumen?{BuildQueryString(filtros)}");

        private static string BuildQueryString(Dictionary<string, string?> filtros) =>
            string.Join(
                "&",
                filtros
                    .Where(kv => !string.IsNullOrEmpty(kv.Value))
                    .Select(kv => $"{Uri.EscapeDataString(kv.Key)}={Uri.EscapeDataString(kv.Value!)}")
            );
    }
}
