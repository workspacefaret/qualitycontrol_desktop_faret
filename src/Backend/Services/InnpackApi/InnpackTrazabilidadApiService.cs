using System.Collections.Generic;
using System.Text.Json;
using System.Threading.Tasks;
using QualityControlCenter.Modules.Trazabilidad;

namespace QualityControlCenter.Backend.Services.InnpackApi
{
    // Wrapper delgado sobre InnpackApiClient para la parte MySQL de Trazabilidad
    // (registro_paletizado) — Planificación FARET y FPS Materiales siguen siendo APIs externas
    // separadas, no pasan por acá. Ver contex.md sobre la migración de INNPACK a arquitectura API.
    public class InnpackTrazabilidadApiService
    {
        private readonly InnpackApiClient _client;

        private static readonly JsonSerializerOptions _jsonOpts = new()
        {
            PropertyNameCaseInsensitive = true,
        };

        public InnpackTrazabilidadApiService(InnpackApiClient client)
        {
            _client = client;
        }

        // null = no se pudo consultar (nunca equivale a "sin registros").
        public async Task<List<PaletTrazabilidadDto>?> ObtenerPaletizadoPorNp(string np)
        {
            var (ok, body) = await _client.GetAsync($"api/trazabilidad/paletizado?np={System.Uri.EscapeDataString(np)}");
            if (!ok)
                return null;

            try
            {
                using var doc = JsonDocument.Parse(body);
                var root = doc.RootElement;

                if (!root.TryGetProperty("success", out var s) || !s.GetBoolean())
                    return null;

                if (!root.TryGetProperty("data", out var d))
                    return null;

                return JsonSerializer.Deserialize<List<PaletTrazabilidadDto>>(d.GetRawText(), _jsonOpts)
                    ?? new List<PaletTrazabilidadDto>();
            }
            catch
            {
                return null;
            }
        }
    }
}
