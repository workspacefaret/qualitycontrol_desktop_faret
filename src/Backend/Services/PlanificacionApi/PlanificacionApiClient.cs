using System;
using System.Text.Json;
using System.Threading.Tasks;
using QualityControlCenter.Backend.Services.InnpackApi;

namespace QualityControlCenter.Backend.Services.PlanificacionApi
{
    // Programa de Producción exige desde 2026-10-06 un token de servicio (X-Internal-Gateway-Token)
    // que NO debe vivir en los equipos. Este cliente ya no llama a esa API directo: consulta a
    // QualityControlInnpack.Api (GET api/trazabilidad/planificacion, con el JWT de la sesión), que
    // agrega el token desde el servidor. Se conserva la firma GetAsync("api/plan/vista-planificacion")
    // devolviendo el arreglo crudo de Planificación, para que Trazabilidad y Laboratorio - Muestras
    // sigan filtrando y parseando exactamente igual que antes.
    public class PlanificacionApiClient
    {
        private const string RutaPlanificacion = "api/plan/vista-planificacion";
        private const string RutaApiInnpack = "api/trazabilidad/planificacion";

        private readonly InnpackApiClient _innpack;

        public PlanificacionApiClient(InnpackApiClient innpack)
        {
            _innpack = innpack;
        }

        public bool IsConfigured => _innpack.IsConfigured;

        public async Task<(bool ok, string body)> GetAsync(string path)
        {
            if (!string.Equals(path.TrimStart('/'), RutaPlanificacion, StringComparison.OrdinalIgnoreCase))
                return (false, Err($"Ruta de Planificación no permitida: {path}"));

            var (ok, body) = await _innpack.GetAsync(RutaApiInnpack);
            if (!ok)
                return (false, body);

            try
            {
                using var doc = JsonDocument.Parse(body);
                var root = doc.RootElement;
                if (
                    root.ValueKind == JsonValueKind.Object
                    && root.TryGetProperty("success", out var s)
                    && s.ValueKind == JsonValueKind.True
                    && root.TryGetProperty("data", out var data)
                )
                    return (true, data.GetRawText());

                return (false, Err("Respuesta inesperada de la API INNPACK al consultar Planificación."));
            }
            catch (JsonException)
            {
                return (false, Err("Respuesta inválida de la API INNPACK al consultar Planificación."));
            }
        }

        private static string Err(string msg) => JsonSerializer.Serialize(new { ok = false, message = msg });
    }
}
