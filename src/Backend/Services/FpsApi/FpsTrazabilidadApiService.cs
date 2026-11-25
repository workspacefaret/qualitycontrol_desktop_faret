using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading.Tasks;

namespace QualityControlCenter.Backend.Services.FpsApi
{
    // GET /api/produccion/trazabilidad/np y /trazabilidad/lote (fps-api, solo lectura, x-api-key).
    // Devuelve el `data` de fps-api tal cual (el frontend lo interpreta): aquí solo se valida la
    // entrada y se traducen los errores. Ver fps-api/src/services/trazabilidad.service.js.
    public class FpsTrazabilidadApiService
    {
        private static readonly Regex NpRegex = new(@"^\d{1,9}$");
        private static readonly Regex LoteRegex = new(@"^[A-Za-z0-9][A-Za-z0-9._/\-]{0,35}$");
        private readonly FpsApiClient _client;

        public FpsTrazabilidadApiService(FpsApiClient client)
        {
            _client = client;
        }

        public bool IsConfigured => _client.IsConfigured;

        public static bool NpValido(string np) => NpRegex.IsMatch(np) && long.Parse(np) > 0;

        public static bool LoteValido(string lote) => LoteRegex.IsMatch(lote);

        // estado: "OK" | "NO_DESPLEGADO" (404: el endpoint aún no existe en el servidor) | "ERROR"
        public Task<(string estado, JsonElement data, string? error)> ObtenerNpAsync(string np) =>
            ObtenerAsync("trazabilidad/np?np=" + np);

        public Task<(string estado, JsonElement data, string? error)> ObtenerLoteAsync(string lote) =>
            ObtenerAsync("trazabilidad/lote?lote=" + System.Uri.EscapeDataString(lote));

        private static readonly Regex CorridaRegex = new(@"^[A-Za-z0-9\-]{1,50}$");

        public static bool CorridaValida(string corrida) => CorridaRegex.IsMatch(corrida);

        public Task<(string estado, JsonElement data, string? error)> ObtenerCorridaAsync(string np, string corrida) =>
            ObtenerAsync("trazabilidad/corrida?np=" + np + "&corrida=" + System.Uri.EscapeDataString(corrida));

        public Task<(string estado, JsonElement data, string? error)> BuscarAsync(string texto) =>
            ObtenerAsync("trazabilidad/buscar?texto=" + System.Uri.EscapeDataString(texto));

        private async Task<(string estado, JsonElement data, string? error)> ObtenerAsync(string ruta)
        {
            if (!_client.IsConfigured)
                return ("ERROR", default, "La conexión con FPS no está configurada en este equipo.");

            var (ok, body) = await _client.GetAsync(ruta);
            if (!ok)
            {
                if (body.Contains("Cannot GET") || body.Contains("HTTP 404"))
                    return ("NO_DESPLEGADO", default, "La trazabilidad integral aún no está disponible en el servidor FPS.");
                return ("ERROR", default, Mensaje(body) ?? "FPS no respondió correctamente.");
            }

            try
            {
                using var doc = JsonDocument.Parse(body);
                if (!doc.RootElement.TryGetProperty("data", out var data) || data.ValueKind != JsonValueKind.Object)
                    return ("ERROR", default, "Respuesta de FPS no reconocida (trazabilidad).");
                return ("OK", data.Clone(), null);
            }
            catch (JsonException)
            {
                return ("ERROR", default, "Respuesta de FPS no es JSON válido (trazabilidad).");
            }
        }

        private static string? Mensaje(string body)
        {
            try
            {
                using var doc = JsonDocument.Parse(body);
                return doc.RootElement.TryGetProperty("message", out var m) && m.ValueKind == JsonValueKind.String
                    ? m.GetString()
                    : null;
            }
            catch (JsonException)
            {
                return null;
            }
        }
    }
}
