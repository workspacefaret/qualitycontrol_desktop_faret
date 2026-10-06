using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace QualityControlCenter.Backend.Services.InnpackApi
{
    // Wrapper delgado sobre InnpackApiClient para Formularios (LogisticControlCenter, control_bins),
    // solo lectura. "tipo" es el segmento de ruta de la API (inspecciones-vehiculares, etc.).
    public class InnpackFormulariosApiService
    {
        private readonly InnpackApiClient _client;

        public InnpackFormulariosApiService(InnpackApiClient client)
        {
            _client = client;
        }

        public Task<(bool ok, string body)> ListAsync(
            string tipo,
            Dictionary<string, string> filtros
        )
        {
            var query = string.Join(
                "&",
                filtros
                    .Where(f => !string.IsNullOrWhiteSpace(f.Value))
                    .Select(f => $"{f.Key}={System.Uri.EscapeDataString(f.Value.Trim())}")
            );

            return _client.GetAsync(
                $"api/formularios/{tipo}" + (query.Length > 0 ? "?" + query : "")
            );
        }

        public Task<(bool ok, string body)> DetalleAsync(string tipo, int id) =>
            _client.GetAsync($"api/formularios/{tipo}/{id}");
    }
}
