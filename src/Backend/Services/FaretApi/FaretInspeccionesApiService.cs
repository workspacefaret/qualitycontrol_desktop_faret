using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace QualityControlCenter.Backend.Services.FaretApi
{
    // Endpoints todavía no implementados en la API (`api/inspecciones*`) — la app Flutter FARET
    // que enviará estos registros está en desarrollo. Este servicio deja la llamada lista para
    // cuando el servidor los exponga; hasta entonces devuelve error (404), tratado como "sin
    // datos" por el frontend.
    public class FaretInspeccionesApiService
    {
        private readonly FaretApiClient _client;

        public FaretInspeccionesApiService(FaretApiClient client)
        {
            _client = client;
        }

        public Task<(bool ok, string body)> GetListAsync(Dictionary<string, string?> filtros) =>
            _client.GetAsync($"api/inspecciones?{BuildQueryString(filtros)}");

        public Task<(bool ok, string body)> GetResumenAsync(Dictionary<string, string?> filtros) =>
            _client.GetAsync($"api/inspecciones/resumen?{BuildQueryString(filtros)}");

        private static string BuildQueryString(Dictionary<string, string?> filtros) =>
            string.Join(
                "&",
                filtros
                    .Where(kv => !string.IsNullOrEmpty(kv.Value))
                    .Select(kv => $"{Uri.EscapeDataString(kv.Key)}={Uri.EscapeDataString(kv.Value!)}")
            );
    }
}
