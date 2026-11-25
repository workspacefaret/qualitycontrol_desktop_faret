using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using QualityControlCenter.Backend.Services.FaretApi;

namespace QualityControlCenter.Modules.ClasificacionPallets
{
    // "Clasificación de Pallets" (solo INNPACK): consulta y anulación lógica de las clasificaciones AZUL/ROJO/VERDE que la app
    // móvil registra en las inspecciones. Passthrough delgado hacia api/pallets de la API `calidad` (JWT de la sesión INNPACK):
    // las reglas (eventos inmutables, vigente, validación del color, roles que pueden anular) viven ÚNICAMENTE en esa API.
    // Aquí solo se mapea acción → ruta, se valida y acota lo que viaja y se rechaza cualquier sesión que no sea INNPACK.
    // Acciones: .list / .resumen / .defectos / .detalle (lectura) y .anular (escritura; exige EDITAR en el módulo).
    public class ClasificacionPalletsHandler
    {
        private const string Base = "pallets/";
        private static readonly Regex FechaRegex = new(@"^\d{4}-\d{2}-\d{2}$", RegexOptions.Compiled);
        private static readonly HashSet<string> Colores = new() { "AZUL", "ROJO", "VERDE" };
        private static readonly string[] CamposEnteros = { "procesoId", "maquinaId", "usuarioId", "defectoId" };
        private const int MaxTexto = 60;
        private const int MaxMotivo = 250;

        private readonly FaretApiClient _client;
        private readonly string _empresa;

        public ClasificacionPalletsHandler(FaretApiClient calidadClient, string empresaSesion)
        {
            _client = calidadClient;
            _empresa = (empresaSesion ?? "").ToUpperInvariant();
        }

        public async Task<string> Handle(string action, Dictionary<string, object> payload)
        {
            try
            {
                // FARET no usa este control: nunca llega a la API aunque la acción venga de otro módulo.
                if (_empresa != "INNPACK")
                    return Error("Este módulo es exclusivo de INNPACK.");

                var data = payload.TryGetValue("data", out var raw) && raw is JsonElement el && el.ValueKind == JsonValueKind.Object
                    ? el
                    : default;

                switch (action)
                {
                    case "clasificacionPallets.list":
                        return Respuesta(await _client.GetAsync(Base + "clasificaciones" + Consulta(data, paginado: true)));

                    case "clasificacionPallets.resumen":
                        return Respuesta(await _client.GetAsync(Base + "clasificaciones/resumen" + Consulta(data, paginado: false)));

                    case "clasificacionPallets.defectos":
                        return Respuesta(await _client.GetAsync(Base + "clasificaciones/defectos" + Consulta(data, paginado: false)));

                    case "clasificacionPallets.detalle":
                        if (!TryId(data, out var idDetalle))
                            return Error("Identificador inválido");
                        return Respuesta(await _client.GetAsync($"{Base}clasificaciones/{idDetalle}"));

                    case "clasificacionPallets.anular":
                        if (!TryId(data, out var idAnular))
                            return Error("Identificador inválido");
                        var motivo = Texto(data, "motivo")?.Trim();
                        if (string.IsNullOrEmpty(motivo))
                            return Error("Debes indicar el motivo de la anulación.");
                        if (motivo.Length > MaxMotivo)
                            return Error($"El motivo no puede superar {MaxMotivo} caracteres.");
                        return Respuesta(await _client.PostJsonAsync($"{Base}clasificaciones/{idAnular}/anular", new { motivo }));

                    default:
                        return Error($"Acción no reconocida en Clasificación de Pallets: {action}");
                }
            }
            catch (Exception ex)
            {
                return Error(ex.Message);
            }
        }

        // Lectura para Trazabilidad: exige una NP numérica (sin NP la API devolvería todas las clasificaciones).
        public async Task<string> PorNp(Dictionary<string, object> payload)
        {
            var data = payload.TryGetValue("data", out var raw) && raw is JsonElement el && el.ValueKind == JsonValueKind.Object ? el : default;
            var np = Texto(data, "np")?.Trim() ?? "";
            if (!Regex.IsMatch(np, @"^\d{1,9}$"))
                return Error("NP no válida.");
            var filtro = JsonSerializer.SerializeToElement(new { np, vista = "vigentes", limite = 200 });
            return await Handle("clasificacionPallets.list", new Dictionary<string, object> { ["data"] = filtro });
        }

        // Solo los filtros conocidos viajan a la API, validados y codificados (nunca texto libre sin acotar en la URL).
        internal static string Consulta(JsonElement data, bool paginado)
        {
            var q = new List<string>();

            foreach (var campo in new[] { "desde", "hasta" })
            {
                var v = Texto(data, campo);
                if (v != null && FechaRegex.IsMatch(v)) q.Add($"{campo}={v}");
            }

            var color = Texto(data, "color")?.ToUpperInvariant();
            if (color != null && Colores.Contains(color)) q.Add($"color={color}");

            foreach (var campo in CamposEnteros)
                if (Entero(data, campo) is int n && n > 0) q.Add($"{campo}={n}");

            foreach (var campo in new[] { "operador", "np", "palletCodigo" })
            {
                var v = Texto(data, campo)?.Trim();
                if (!string.IsNullOrEmpty(v))
                    q.Add($"{campo}={Uri.EscapeDataString(v.Length > MaxTexto ? v[..MaxTexto] : v)}");
            }

            q.Add(Texto(data, "vista") == "eventos" ? "vista=eventos" : "vista=vigentes");

            if (paginado)
            {
                if (data.ValueKind == JsonValueKind.Object && data.TryGetProperty("incluirAnuladas", out var ia) && ia.ValueKind == JsonValueKind.True)
                    q.Add("incluirAnuladas=1");
                q.Add($"pagina={Math.Clamp(Entero(data, "pagina") ?? 1, 1, 100000)}");
                q.Add($"limite={Math.Clamp(Entero(data, "limite") ?? 50, 1, 200)}");
            }

            return "?" + string.Join("&", q);
        }

        private static string? Texto(JsonElement data, string clave) =>
            data.ValueKind == JsonValueKind.Object && data.TryGetProperty(clave, out var v) && v.ValueKind == JsonValueKind.String
                ? v.GetString()
                : null;

        // El payload Photino llega como JsonElement: un número no se puede leer con GetString (ver CLAUDE.md), y puede venir como texto.
        private static int? Entero(JsonElement data, string clave)
        {
            if (data.ValueKind != JsonValueKind.Object || !data.TryGetProperty(clave, out var v)) return null;
            if (v.ValueKind == JsonValueKind.Number && v.TryGetInt32(out var n)) return n;
            if (v.ValueKind == JsonValueKind.String && int.TryParse(v.GetString(), out var s)) return s;
            return null;
        }

        private static bool TryId(JsonElement data, out int id)
        {
            id = Entero(data, "id") ?? 0;
            return id > 0;
        }

        // La API responde { ok, data } o { ok:false, message } (también en 4xx/5xx); el cliente HTTP sintetiza { ok:false, error }.
        private static string Respuesta((bool ok, string body) r)
        {
            try
            {
                using var doc = JsonDocument.Parse(r.body);
                var root = doc.RootElement;
                if (root.TryGetProperty("ok", out var ok) && ok.ValueKind == JsonValueKind.True)
                {
                    object? datos = root.TryGetProperty("data", out var d) ? d.Clone() : null;
                    return JsonSerializer.Serialize(new { ok = true, data = datos });
                }
                var mensaje =
                    (root.TryGetProperty("message", out var m) && m.ValueKind == JsonValueKind.String ? m.GetString() : null)
                    ?? (root.TryGetProperty("error", out var e) && e.ValueKind == JsonValueKind.String ? e.GetString() : null);
                return Error(mensaje ?? "No se pudo completar la operación");
            }
            catch
            {
                // El servidor respondió algo que no es JSON (p. ej. una página 404): la API aún no incluye este módulo.
                return Error("El servidor no tiene habilitada la clasificación de pallets. Pide a TI que actualice la API de Calidad.");
            }
        }

        private static string Error(string mensaje) => JsonSerializer.Serialize(new { ok = false, error = mensaje });
    }
}
