using System;
using System.Threading.Tasks;

namespace QualityControlCenter.Backend.Services.FaretApi
{
    // Resumen de máquinas a partir de los registros del formulario "CALIDAD/PRODUCCION FARET",
    // vía la API `calidad` (backend Node.js separado, sin autenticación).
    public class FaretMaquinasApiService
    {
        private readonly FaretApiClient _client;

        public FaretMaquinasApiService(FaretApiClient client)
        {
            _client = client;
        }

        public Task<(bool ok, string body)> GetResumenAsync(string? maquina) =>
            _client.GetAsync($"calidad-faret/maquinas/resumen?{BuildQueryString(maquina)}");

        private static string BuildQueryString(string? maquina) =>
            string.IsNullOrEmpty(maquina) ? "" : $"maquina={Uri.EscapeDataString(maquina)}";
    }
}
