using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using QualityControlCenter.Modules.EvaluacionMaquinas;
using System.Threading;
using System.Threading.Tasks;
using QualityControlCenter.Modules.EvaluacionOperadores;

namespace QualityControlCenter.Backend.Services.FpsApi
{
    // GET /api/produccion/sesiones-documentos?np=a,b (fps-api, solo lectura, x-api-key). Por lotes de 50 NP
    // (el máximo que acepta el endpoint). Si un lote falla, falla todo: nunca se calcula con FPS parcial.
    public class FpsSesionesApiService
    {
        public const int Lote = 50;
        private readonly FpsApiClient _client;

        public FpsSesionesApiService(FpsApiClient client)
        {
            _client = client;
        }

        public bool IsConfigured => _client.IsConfigured;

        // estado: "OK" | "NO_DESPLEGADO" (404: el endpoint aún no existe en el servidor) | "ERROR"
        public async Task<(string estado, FaretAtribucionFps.DatosFps datos, string? error)> ObtenerAsync(IEnumerable<long> nps, CancellationToken ct = default)
        {
            var datos = new FaretAtribucionFps.DatosFps();
            var lista = nps.Where(n => n > 0).Distinct().OrderBy(n => n).ToList();
            for (var i = 0; i < lista.Count; i += Lote)
            {
                var lote = lista.Skip(i).Take(Lote);
                ct.ThrowIfCancellationRequested();
                var (ok, body) = await _client.GetAsync("sesiones-documentos?np=" + string.Join(",", lote), ct);
                if (!ok)
                {
                    if (body.Contains("Cannot GET") || body.Contains("HTTP 404"))
                        return ("NO_DESPLEGADO", datos, "El endpoint de sesiones de FPS (sesiones-documentos) no está desplegado en el servidor.");
                    return ("ERROR", datos, "FPS no respondió correctamente al consultar las sesiones de producción.");
                }
                if (!FaretAtribucionFps.TryParseRespuesta(body, datos, out var error))
                    return ("ERROR", datos, error);
            }
            return ("OK", datos, null);
        }

        // ── Sesiones por máquina y período (GET sesiones-maquina, aditivo; ver fps-api/src/services/sesionesMaquina.service.js) ──
        // Respeta los límites del endpoint (30 máquinas, 92 días, 2000 filas por página, paginación por cursor `siguiente`).
        // Nunca devuelve datos parciales: si una página falla, falla todo. No se registran nombres de operadores.
        public const int MaxMaquinas = 30;
        public const int MaxDias = 92;
        public const int FilasPorPagina = 2000; // máximo del endpoint: menos páginas = menos lecturas en FPS
        public const int MaxPaginasPorLote = 50; // tope de seguridad por (lote de máquinas × ventana)

        // estado: "OK" | "NO_DESPLEGADO" (404: el endpoint aún no existe) | "ERROR"
        public async Task<(string estado, List<SesionFps> sesiones, string? error)> ObtenerPorMaquinaAsync(
            IEnumerable<int> maquinas, DateTime desde, DateTime hasta, CancellationToken ct = default)
        {
            var sesiones = new List<SesionFps>();
            var vistos = new HashSet<string>();
            var ids = maquinas.Where(m => m > 0).Distinct().OrderBy(m => m).ToList();
            if (ids.Count == 0) return ("OK", sesiones, null);
            if (hasta.Date < desde.Date) return ("ERROR", sesiones, "Rango de fechas inválido.");

            for (var i = 0; i < ids.Count; i += MaxMaquinas)
            {
                var lote = string.Join(",", ids.Skip(i).Take(MaxMaquinas));
                for (var ini = desde.Date; ini <= hasta.Date; ini = ini.AddDays(MaxDias))
                {
                    var fin = ini.AddDays(MaxDias - 1) < hasta.Date ? ini.AddDays(MaxDias - 1) : hasta.Date;
                    string? cursor = null;
                    for (var pagina = 0; pagina < MaxPaginasPorLote; pagina++)
                    {
                        ct.ThrowIfCancellationRequested();
                        var ruta = $"sesiones-maquina?maquina={lote}&desde={ini:yyyy-MM-dd}&hasta={fin:yyyy-MM-dd}&limite={FilasPorPagina}"
                            + (cursor is null ? "" : "&despues=" + Uri.EscapeDataString(cursor));
                        var (ok, body) = await _client.GetAsync(ruta, ct);
                        if (!ok)
                        {
                            if (body.Contains("Cannot GET") || body.Contains("HTTP 404"))
                                return ("NO_DESPLEGADO", sesiones, "El endpoint de sesiones por máquina (sesiones-maquina) no está desplegado en el servidor.");
                            return ("ERROR", sesiones, "FPS no respondió correctamente al consultar las sesiones por máquina.");
                        }
                        if (!TryParsePaginaMaquina(body, sesiones, vistos, out cursor, out var error))
                            return ("ERROR", sesiones, error);
                        if (cursor is null) break;
                        if (pagina == MaxPaginasPorLote - 1)
                            return ("ERROR", sesiones, "Demasiadas páginas de sesiones: reduzca el período o las máquinas.");
                    }
                }
            }
            return ("OK", sesiones, null);
        }

        // Interpreta una página. Descarta duplicados por RecordKey (ventanas contiguas) y sesiones sin inicio/operador.
        public static bool TryParsePaginaMaquina(string body, List<SesionFps> destino, HashSet<string> vistos, out string? siguiente, out string error)
        {
            siguiente = null;
            error = "";
            try
            {
                using var doc = JsonDocument.Parse(body);
                var root = doc.RootElement;
                if (!root.TryGetProperty("ok", out var ok) || ok.ValueKind != JsonValueKind.True
                    || !root.TryGetProperty("data", out var data) || !data.TryGetProperty("sesiones", out var arr) || arr.ValueKind != JsonValueKind.Array)
                {
                    error = "Respuesta de FPS no reconocida (sesiones por máquina).";
                    return false;
                }
                foreach (var s in arr.EnumerateArray())
                {
                    var key = Texto(s, "RecordKey");
                    if (key is null || !vistos.Add(key)) continue;
                    var op = Texto(s, "IdOperador");
                    if (!int.TryParse(Texto(s, "IdMaquina"), out var maq) || op is null || !TryFecha(Texto(s, "ProductionStartDate"), out var ini)) continue;
                    DateTime? fin = TryFecha(Texto(s, "ProductionEndDate"), out var f) ? f : null;
                    if (fin is not null && fin < ini) fin = null; // término anterior al inicio = dato incompleto
                    // Online=1 marca la sesión ABIERTA: su ProductionEndDate es una estimación que se recalcula (FPS Station VB), no un término real.
                    if (s.TryGetProperty("Online", out var on) && (on.ValueKind == JsonValueKind.True || (on.ValueKind == JsonValueKind.Number && on.TryGetInt32(out var onv) && onv == 1))) fin = null;
                    destino.Add(new SesionFps(maq, op, ini, fin));
                }
                if (data.TryGetProperty("siguiente", out var sig) && sig.ValueKind == JsonValueKind.String)
                    siguiente = sig.GetString();
                return true;
            }
            catch (JsonException)
            {
                error = "Respuesta de FPS no es JSON válido (sesiones por máquina).";
                return false;
            }
        }

        private static string? Texto(JsonElement e, string nombre) =>
            e.TryGetProperty(nombre, out var v) && v.ValueKind != JsonValueKind.Null
                ? (v.ValueKind == JsonValueKind.String ? v.GetString() : v.ToString())
                : null;

        private static bool TryFecha(string? t, out DateTime d) =>
            DateTime.TryParseExact(t, "yyyy-MM-dd HH:mm:ss", System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.None, out d);
    }
}
