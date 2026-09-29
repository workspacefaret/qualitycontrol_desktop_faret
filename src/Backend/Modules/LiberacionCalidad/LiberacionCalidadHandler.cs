using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using QualityControlCenter.Backend.Services.FpsApi;

namespace QualityControlCenter.Modules.LiberacionCalidad
{
    // Columna "Liberación Calidad" de No Conformidades (INNPACK y Faret): inspectores que liberaron
    // cada NP según los certificados de liberación de fps-api (GET liberaciones/inspectores, una
    // sola consulta para muchas NP). Solo lectura. El cruce NP + código lo hace el frontend
    // (window.LiberacionCalidad en shared/utils.js).
    public class LiberacionCalidadHandler
    {
        private const int MaxNpsPorLlamada = 300; // mismo límite que fps-api

        private readonly FpsLiberacionesApiService _fps;

        public LiberacionCalidadHandler(FpsLiberacionesApiService fps)
        {
            _fps = fps;
        }

        public async Task<string> Handle(string action, Dictionary<string, object> payload)
        {
            try
            {
                return action switch
                {
                    "liberacionCalidad.inspectores" => await InspectoresAsync(payload),
                    _ => Error($"Acción no soportada: {action}"),
                };
            }
            catch (Exception ex)
            {
                return Error(ex.Message);
            }
        }

        private async Task<string> InspectoresAsync(Dictionary<string, object> payload)
        {
            if (!_fps.IsConfigured)
                return Error("fps-api no está configurada en este equipo.");

            // Solo NP numéricas (así las valida fps-api); el resto no tiene certificado posible.
            var nps = new List<string>();
            if (
                payload.TryGetValue("data", out var raw)
                && raw is JsonElement data
                && data.TryGetProperty("nps", out var arr)
                && arr.ValueKind == JsonValueKind.Array
            )
            {
                foreach (var el in arr.EnumerateArray())
                {
                    var np = el.ValueKind == JsonValueKind.Number ? el.GetRawText() : el.GetString()?.Trim();
                    if (!string.IsNullOrEmpty(np) && np.Length <= 15 && np.All(char.IsDigit))
                        nps.Add(np);
                }
            }

            nps = nps.Distinct().ToList();
            var filas = new List<JsonElement>();

            for (var i = 0; i < nps.Count; i += MaxNpsPorLlamada)
            {
                var lote = nps.Skip(i).Take(MaxNpsPorLlamada);
                var (ok, body) = await _fps.ObtenerInspectoresAsync(lote);
                if (!ok)
                    return Error("No fue posible consultar las liberaciones en fps-api.");

                using var doc = JsonDocument.Parse(body);
                if (doc.RootElement.TryGetProperty("data", out var d) && d.ValueKind == JsonValueKind.Array)
                    filas.AddRange(d.EnumerateArray().Select(x => x.Clone()));
            }

            return Ok(filas);
        }

        private static string Ok(object? data) =>
            JsonSerializer.Serialize(new { ok = true, data, error = (string?)null });

        private static string Error(string message) =>
            JsonSerializer.Serialize(new { ok = false, data = (object?)null, error = message });
    }
}
