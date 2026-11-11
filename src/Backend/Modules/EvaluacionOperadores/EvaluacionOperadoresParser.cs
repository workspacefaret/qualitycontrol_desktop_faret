using System.Collections.Generic;
using System.Text.Json;

namespace QualityControlCenter.Modules.EvaluacionOperadores
{
    public static class EvaluacionOperadoresParser
    {
        // Desenvuelve ApiResponse {success, data:{items:[...]}} y proyecta solo los 6 campos necesarios.
        public static bool TryParseFilas(string body, out List<NcFila> filas, out string error)
        {
            filas = new List<NcFila>();
            error = "Error al comunicarse con la API Innpack";
            try
            {
                using var doc = JsonDocument.Parse(body);
                var root = doc.RootElement;
                if (!root.TryGetProperty("success", out var s) || !s.GetBoolean())
                {
                    if (root.TryGetProperty("message", out var msg) && msg.ValueKind == JsonValueKind.String)
                        error = msg.GetString() ?? error;
                    return false;
                }
                if (!root.TryGetProperty("data", out var d) || !d.TryGetProperty("items", out var items) || items.ValueKind != JsonValueKind.Array)
                {
                    error = "Respuesta de la API sin el listado esperado";
                    return false;
                }
                foreach (var it in items.EnumerateArray())
                {
                    filas.Add(new NcFila(
                        it.TryGetProperty("id", out var id) && id.TryGetInt32(out var idv) ? idv : 0,
                        Str(it, "nivel"),
                        Str(it, "operador"),
                        Str(it, "maquina"),
                        Str(it, "fechaFabricacion"),
                        it.TryGetProperty("eliminado", out var el) && (el.ValueKind == JsonValueKind.True || (el.ValueKind == JsonValueKind.Number && el.GetInt32() == 1))
                    ));
                }
                // Si la API devolvió menos filas que el total, el listado está truncado: no se calcula con datos parciales.
                if (d.TryGetProperty("total", out var tot) && tot.ValueKind == JsonValueKind.Number && tot.TryGetInt32(out var totalApi) && totalApi > filas.Count)
                {
                    error = "Listado incompleto: la API devolvió menos NC que el total. No se muestran cifras.";
                    filas.Clear();
                    return false;
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
