using System.Collections.Generic;
using System.Text.Json;

namespace QualityControlCenter.Modules.EvaluacionOperadores
{
    public static class FaretEvaluacionOperadoresParser
    {
        // Página de GET api/importaciones/pnc: ApiResponse {success, message, data:{items:[...], totalCount}}.
        // Proyecta solo los campos que usa el cálculo (sin cliente, producto ni textos libres).
        public static bool TryParsePagina(string body, out List<NcFila> filas, out long? total, out string error)
        {
            filas = new List<NcFila>();
            total = null;
            error = "Error al comunicarse con la API Faret";
            try
            {
                using var doc = JsonDocument.Parse(body);
                var root = doc.RootElement;
                if (root.ValueKind != JsonValueKind.Object || !root.TryGetProperty("success", out var s) || s.ValueKind != JsonValueKind.True)
                {
                    if (root.ValueKind == JsonValueKind.Object && root.TryGetProperty("message", out var msg) && msg.ValueKind == JsonValueKind.String)
                        error = msg.GetString() ?? error;
                    return false;
                }
                if (!root.TryGetProperty("data", out var d) || !d.TryGetProperty("items", out var items) || items.ValueKind != JsonValueKind.Array)
                {
                    error = "Respuesta de la API sin el listado esperado";
                    return false;
                }
                if (d.TryGetProperty("totalCount", out var tc) && tc.TryGetInt64(out var t))
                    total = t;

                foreach (var it in items.EnumerateArray())
                {
                    var id = it.TryGetProperty("id", out var idEl) && idEl.TryGetInt64(out var idv) ? idv : 0;
                    filas.Add(new NcFila(
                        id > int.MaxValue ? 0 : (int)id,
                        Str(it, "nivel"),
                        Str(it, "operador"),
                        Str(it, "maquina"),
                        Str(it, "fechaFabricacion"),
                        false,
                        Str(it, "area"),
                        Str(it, "npNv")
                    ));
                }
                return true;
            }
            catch
            {
                return false;
            }
        }

        private static string? Str(JsonElement e, string prop) =>
            e.TryGetProperty(prop, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;
    }
}
