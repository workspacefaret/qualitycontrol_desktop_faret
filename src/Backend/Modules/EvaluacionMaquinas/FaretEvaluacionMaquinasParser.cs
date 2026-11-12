using System.Collections.Generic;
using System.Text.Json;

namespace QualityControlCenter.Modules.EvaluacionMaquinas
{
    // Adaptador de las listas de inspecciones de FARET (API `calidad`, Node) a InspeccionFila.
    // Respuesta de GET calidad-faret/registros y calidad-faret-pallet/registros: { ok, data: { items:[...], totalCount, page, pageSize } }.
    // Solo proyecta los campos del cálculo (sin NV, observaciones, acciones ni adjuntos).
    public static class FaretEvaluacionMaquinasParser
    {
        public const string OrigenCalidad = "Calidad";
        public const string OrigenPallet = "Pallet/Papel";

        public static bool TryParsePagina(string body, bool pallet, out List<InspeccionFila> filas, out long? total, out string error)
        {
            filas = new List<InspeccionFila>();
            total = null;
            error = "Error al comunicarse con la API Faret";
            try
            {
                using var doc = JsonDocument.Parse(body);
                var root = doc.RootElement;
                if (root.ValueKind != JsonValueKind.Object) return false;
                var exito = (root.TryGetProperty("ok", out var ok) && ok.ValueKind == JsonValueKind.True)
                    || (root.TryGetProperty("success", out var s) && s.ValueKind == JsonValueKind.True);
                if (!exito)
                {
                    if (root.TryGetProperty("message", out var msg) && msg.ValueKind == JsonValueKind.String)
                        error = msg.GetString() ?? error;
                    return false;
                }
                if (!root.TryGetProperty("data", out var d) || d.ValueKind != JsonValueKind.Object
                    || !d.TryGetProperty("items", out var items) || items.ValueKind != JsonValueKind.Array)
                {
                    error = "Respuesta de la API sin el listado esperado";
                    return false;
                }
                if (d.TryGetProperty("totalCount", out var tc) && tc.TryGetInt64(out var t)) total = t;

                foreach (var it in items.EnumerateArray())
                    filas.Add(pallet ? FilaPallet(it) : FilaCalidad(it));
                return true;
            }
            catch
            {
                return false;
            }
        }

        // Calidad/Producción: `operador` = operador de la máquina ("Otros" → operadorOtro); `operadorRegistro` = inspector.
        private static InspeccionFila FilaCalidad(JsonElement it)
        {
            var defectos = ParseDefectos(it);
            return new InspeccionFila(
                Id(it),
                OrigenCalidad,
                AdmitePuntos: true,
                Maquina: Str(it, "maquina"),
                OperadorMaquina: Persona(Str(it, "operador"), Str(it, "operadorOtro")),
                Inspector: Str(it, "operadorRegistro"),
                Area: Str(it, "areaControl"),
                Fecha: Str(it, "fechaRegistro"),
                PresentaDefectos: Bool(it, "presentaDefectos"),
                Defectos: defectos);
        }

        // Pallet/Papel: checklist de controles; `operador` es quien inspecciona (la app lo rotula "Operador Calidad"):
        // la fuente NO registra operador de máquina ni criticidad. Conforme = ningún control "No cumple".
        private static InspeccionFila FilaPallet(JsonElement it)
        {
            var noCumple = it.TryGetProperty("totalNoCumple", out var n) && n.ValueKind == JsonValueKind.Number && n.TryGetInt32(out var v) ? v : 0;
            return new InspeccionFila(
                Id(it),
                OrigenPallet,
                AdmitePuntos: false,
                Maquina: Str(it, "maquina"),
                OperadorMaquina: null,
                Inspector: Persona(Str(it, "operador"), Str(it, "operadorOtro")),
                Area: Str(it, "areaControl"),
                Fecha: Str(it, "fechaRegistro"),
                PresentaDefectos: noCumple > 0,
                Defectos: null,
                NoCumple: noCumple,
                Hora: Str(it, "horaRegistro"));
        }

        private static string? Persona(string? nombre, string? otro) =>
            string.Equals(nombre?.Trim(), "Otros", System.StringComparison.OrdinalIgnoreCase) ? otro : nombre;

        // `defectosDetalle` llega como texto JSON (FOR JSON PATH) o ya como arreglo; null/ausente = sin defectos.
        private static List<DefectoInsp> ParseDefectos(JsonElement it)
        {
            var lista = new List<DefectoInsp>();
            if (!it.TryGetProperty("defectosDetalle", out var d)) return lista;
            try
            {
                JsonDocument? tmp = null;
                var arr = d;
                if (d.ValueKind == JsonValueKind.String)
                {
                    var txt = d.GetString();
                    if (string.IsNullOrWhiteSpace(txt)) return lista;
                    tmp = JsonDocument.Parse(txt);
                    arr = tmp.RootElement;
                }
                if (arr.ValueKind == JsonValueKind.Array)
                    foreach (var e in arr.EnumerateArray())
                        lista.Add(new DefectoInsp(Str(e, "defecto"), Str(e, "criticidad")));
                tmp?.Dispose();
            }
            catch
            {
                // Detalle ilegible: se informa como defecto sin criticidad (no evaluable), nunca se inventa.
                if (lista.Count == 0) lista.Add(new DefectoInsp(null, null));
            }
            return lista;
        }

        private static int Id(JsonElement e) =>
            e.TryGetProperty("id", out var v) && v.ValueKind == JsonValueKind.Number && v.TryGetInt64(out var l) && l <= int.MaxValue ? (int)l : 0;

        private static bool Bool(JsonElement e, string prop)
        {
            if (!e.TryGetProperty(prop, out var v)) return false;
            return v.ValueKind switch
            {
                JsonValueKind.True => true,
                JsonValueKind.Number => v.TryGetInt32(out var n) && n != 0,
                JsonValueKind.String => v.GetString() is "1" or "true" or "True" or "SI" or "Si" or "Sí",
                _ => false,
            };
        }

        private static string? Str(JsonElement e, string prop) =>
            e.TryGetProperty(prop, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;
    }
}
