using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using QualityControlCenter.Backend.Services.FaretApi;
using QualityControlCenter.Backend.Services.FpsApi;
using QualityControlCenter.Modules.EvaluacionOperadores;

namespace QualityControlCenter.Modules.EvaluacionMaquinas
{
    // "Evaluación por Máquina" — FARET, SOLO LECTURA. Fuentes: Inspecciones Calidad y Pallet/Papel (API `calidad`, JWT de la sesión).
    // Misma filosofía que Evaluación por Operador: indicador descriptivo, sin nota ni ranking, el operador de máquina es el
    // declarado en la inspección (nunca confirmado), el inspector es otra persona y nunca se penaliza. Nunca escribe nada.
    // Única acción: faret.evaluacionMaquinas.resumen (lectura por sufijo en PermisosService).
    public class FaretEvaluacionMaquinasHandler
    {
        private const int PageSize = 200; // tope de la API
        private const int MaxPaginas = 500;
        private static readonly TimeSpan Vigencia = TimeSpan.FromMinutes(5);

        // Universo completo (ambas fuentes) en memoria: cambiar filtros NO vuelve a consultar la API.
        // Guarda datos crudos; la seudonimización se aplica por solicitud según el permiso del usuario.
        private static readonly SemaphoreSlim _lock = new(1, 1);
        private static List<InspeccionFila>? _universo;
        private static DateTime _cargadoUtc;
        private static int _calidad, _pallet;

        public static void InvalidarCache() { _universo = null; }

        private readonly FaretInspeccionesApiService _calidadApi;
        private readonly FaretInspeccionesPalletApiService _palletApi;
        private readonly FaretApiClient _client;
        private readonly bool _verNombres;
        private readonly FpsSesionesApiService? _fps;

        private static readonly JsonSerializerOptions _jsonOpts = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

        // `client` = cliente de la API `calidad` (recibe el JWT de la sesión activa vía Program.cs).
        public FaretEvaluacionMaquinasHandler(FaretApiClient client, bool verNombres = false, FpsSesionesApiService? fps = null)
        {
            _fps = fps;
            _client = client;
            _calidadApi = new FaretInspeccionesApiService(client);
            _palletApi = new FaretInspeccionesPalletApiService(client);
            _verNombres = verNombres;
        }

        public async Task<string> Handle(string action, Dictionary<string, object> data)
        {
            try
            {
                return action switch
                {
                    "faret.evaluacionMaquinas.resumen" => await HandleResumen(data),
                    "faret.evaluacionMaquinas.coberturaFps" => await HandleCoberturaFps(data),
                    _ => Error($"Acción no reconocida en Evaluación por Máquina Faret: {action}"),
                };
            }
            catch (Exception ex)
            {
                return Error(ex.Message);
            }
        }

        private async Task<string> HandleResumen(Dictionary<string, object> data)
        {
            if (!_client.HasToken)
                return Error("No autenticado en API Faret");

            int? anio = TryGetInt(data, "anio", out var a) ? a : null;
            int? mes = TryGetInt(data, "mes", out var m) ? m : null;
            if (anio is < 2000 or > 2100) return Error("Año inválido");
            if (mes is < 1 or > 12) return Error("Mes inválido");
            TryGetString(data, "maquina", out var maquina);
            TryGetString(data, "operador", out var operador);
            TryGetString(data, "area", out var area);
            TryGetString(data, "origen", out var origen);
            var forzar = data.TryGetValue("actualizar", out var fz) && (fz is JsonElement fe ? fe.ValueKind == JsonValueKind.True : fz is true);

            var (universo, error) = await ObtenerUniversoAsync(forzar);
            if (universo is null) return Error(error ?? "No se pudieron leer las inspecciones");

            // Privacidad: sin permiso de nombres se seudonimiza al operador de máquina y al inspector ANTES de calcular
            // (los filtros reciben el mismo seudónimo que se mostró). Vacíos/genéricos/múltiples conservan su texto.
            var visibles = _verNombres ? universo : universo.Select(Seudonimizar).ToList();
            var resultado = EvaluacionMaquinasCalculator.Calcular(visibles, new EvaluacionMaquinasFiltros(anio, mes, maquina, operador, area, origen));
            return Ok(new
            {
                nombresVisibles = _verNombres,
                fuente = "Inspecciones Calidad y Pallet/Papel Faret (API calidad)",
                fuentes = new[]
                {
                    new { origen = FaretEvaluacionMaquinasParser.OrigenCalidad, registros = _calidad },
                    new { origen = FaretEvaluacionMaquinasParser.OrigenPallet, registros = _pallet },
                },
                cargadoEn = _cargadoUtc.ToString("o"),
                // Solo habilita el panel de auditoría de cobertura (la acción en sí exige ADMIN_TI y el flag de config).
                coberturaFpsDisponible = CoberturaHabilitada() && _fps is { IsConfigured: true },
                resultado,
            });
        }

        // ── Auditoría de cobertura FPS para Pallet/Papel (DIAGNÓSTICO, desactivada por defecto) ──
        // Solo cuenta cuántas inspecciones Pallet/Papel se podrían relacionar con el operador de la máquina vía sesiones FPS.
        // NO atribuye nada al módulo ni a los cálculos, NO devuelve nombres ni identificadores de operadores, NO asigna 10/5/1.
        // Requiere: config.json → "EvaluacionMaquinas": { "CoberturaFpsHabilitada": true } y rol ADMIN_TI (PermisosService).
        public static bool CoberturaHabilitada()
        {
            try
            {
                var ruta = System.IO.Path.Combine(AppContext.BaseDirectory, "config.json");
                if (!System.IO.File.Exists(ruta)) return false;
                using var doc = JsonDocument.Parse(System.IO.File.ReadAllText(ruta));
                return doc.RootElement.TryGetProperty("EvaluacionMaquinas", out var s)
                    && s.TryGetProperty("CoberturaFpsHabilitada", out var b) && b.ValueKind == JsonValueKind.True;
            }
            catch { return false; }
        }

        private async Task<string> HandleCoberturaFps(Dictionary<string, object> data)
        {
            if (!CoberturaHabilitada()) return Error("La auditoría de cobertura FPS está desactivada.");
            if (!_client.HasToken) return Error("No autenticado en API Faret");
            if (_fps is null || !_fps.IsConfigured) return Error("FPS no está configurado en esta instalación.");
            if (!TryGetString(data, "desde", out var d1) || !TryGetString(data, "hasta", out var d2)
                || !DateTime.TryParseExact(d1, "yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.None, out var desde)
                || !DateTime.TryParseExact(d2, "yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.None, out var hasta))
                return Error("Indique 'desde' y 'hasta' (AAAA-MM-DD).");
            if (hasta < desde || (hasta - desde).TotalDays > 366) return Error("El período debe ser de 1 a 366 días.");

            var (universo, error) = await ObtenerUniversoAsync(false);
            if (universo is null) return Error(error ?? "No se pudieron leer las inspecciones");

            var pallet = universo
                .Where(f => f.Origen == FaretEvaluacionMaquinasParser.OrigenPallet
                    && PalletAtribucionFps.TryParseMomento(f.Fecha, f.Hora, out var m) && m.Date >= desde.Date && m.Date <= hasta.Date)
                .Select(f => new RegistroPallet(f.Id, f.Maquina, f.Fecha, f.Hora))
                .ToList();

            var ids = pallet.Select(r => PalletMaquinaEquivalencias.ResolverVerificada(r.Maquina)).Where(i => i.HasValue).Select(i => i!.Value).Distinct().ToList();
            var (estado, sesiones, err) = await _fps.ObtenerPorMaquinaAsync(ids, desde, hasta);
            if (estado != "OK") return Error(err ?? "No se pudieron leer las sesiones FPS. No se muestran cifras.");

            var porMaquina = PalletAtribucionFps.AgruparPorMaquina(sesiones);
            var resultados = pallet.Select(r => (r, res: PalletAtribucionFps.Clasificar(r, porMaquina))).ToList();
            object Fila(IEnumerable<ResultadoAtribucion> rs) => PalletAtribucionFps.Contar(rs);

            return Ok(new
            {
                desde = d1,
                hasta = d2,
                inspeccionesPallet = pallet.Count,
                sesionesFpsLeidas = sesiones.Count,
                global = Fila(resultados.Select(x => x.res)),
                porMaquina = resultados.GroupBy(x => string.IsNullOrWhiteSpace(x.r.Maquina) ? "(sin máquina)" : x.r.Maquina!.Trim())
                    .OrderByDescending(g => g.Count()).Select(g => new { maquina = g.Key, cobertura = Fila(g.Select(x => x.res)) }),
                porMes = resultados.GroupBy(x => PalletAtribucionFps.TryParseMomento(x.r.Fecha, x.r.Hora, out var m) ? m.ToString("yyyy-MM") : "(sin fecha)")
                    .OrderBy(g => g.Key).Select(g => new { mes = g.Key, cobertura = Fila(g.Select(x => x.res)) }),
                motivos = resultados.GroupBy(x => $"{x.res.Clase}:{x.res.Motivo}").OrderByDescending(g => g.Count()).Select(g => new { motivo = g.Key, total = g.Count() }),
                equivalenciasPendientes = PalletMaquinaEquivalencias.Todas.Where(e => !e.Verificada)
                    .Select(e => new { pallet = e.NombrePallet, fps = e.NombreFps, aplatzId = e.AplatzId, nota = e.Nota }),
                nota = "Diagnóstico de cobertura. No se atribuyen operadores ni se asignan puntajes a Pallet/Papel.",
            });
        }

        private static InspeccionFila Seudonimizar(InspeccionFila f)
        {
            var op = f.OperadorMaquina != null && EvaluacionOperadoresCalculator.ClasificarOperador(f.OperadorMaquina) == "ok"
                ? EvaluacionOperadoresAuditoria.Seudonimo(f.OperadorMaquina) : f.OperadorMaquina;
            var insp = string.IsNullOrWhiteSpace(f.Inspector) ? f.Inspector : EvaluacionOperadoresAuditoria.Seudonimo(f.Inspector);
            return f with { OperadorMaquina = op, Inspector = insp };
        }

        private async Task<(List<InspeccionFila>? datos, string? error)> ObtenerUniversoAsync(bool forzar)
        {
            await _lock.WaitAsync();
            try
            {
                if (!forzar && _universo is not null && DateTime.UtcNow - _cargadoUtc < Vigencia)
                    return (_universo, null);

                var calidad = await CargarFuenteAsync(false);
                if (calidad.error != null) return (null, "Inspecciones Calidad: " + calidad.error);
                var pallet = await CargarFuenteAsync(true);
                if (pallet.error != null) return (null, "Inspecciones Pallet/Papel: " + pallet.error);

                _universo = calidad.filas.Concat(pallet.filas).ToList();
                _calidad = calidad.filas.Count;
                _pallet = pallet.filas.Count;
                _cargadoUtc = DateTime.UtcNow;
                return (_universo, null);
            }
            finally
            {
                _lock.Release();
            }
        }

        // Lee TODAS las páginas de una fuente. Nunca se calcula con un listado parcial.
        private async Task<(List<InspeccionFila> filas, string? error)> CargarFuenteAsync(bool pallet)
        {
            var filas = new List<InspeccionFila>();
            long? total = null;
            for (var page = 1; page <= MaxPaginas; page++)
            {
                var filtros = new Dictionary<string, string?> { ["page"] = page.ToString(), ["pageSize"] = PageSize.ToString() };
                var (ok, body) = pallet ? await _palletApi.GetListAsync(filtros) : await _calidadApi.GetListAsync(filtros);
                var parsed = FaretEvaluacionMaquinasParser.TryParsePagina(body, pallet, out var lote, out var totalApi, out var err);
                if (!ok || !parsed)
                    return (filas, (parsed ? "Error al comunicarse con la API Faret" : err).TrimEnd('.', ' ') + ". No se muestran cifras.");
                total ??= totalApi;
                filas.AddRange(lote);
                if (lote.Count == 0 || (total.HasValue && filas.Count >= total.Value)) break;
            }
            if (total.HasValue && filas.Count < total.Value)
                return (filas, "Listado incompleto: la API devolvió menos registros que el total. No se muestran cifras.");
            return (filas, null);
        }

        private static bool TryGetString(Dictionary<string, object> data, string key, out string? value)
        {
            value = null;
            if (!data.TryGetValue(key, out var raw)) return false;
            if (raw is JsonElement el)
            {
                if (el.ValueKind == JsonValueKind.Null) return false;
                value = el.ValueKind == JsonValueKind.String ? el.GetString() : el.ToString();
                return !string.IsNullOrWhiteSpace(value);
            }
            value = raw?.ToString();
            return !string.IsNullOrWhiteSpace(value);
        }

        private static bool TryGetInt(Dictionary<string, object> data, string key, out int value)
        {
            value = 0;
            if (!data.TryGetValue(key, out var raw)) return false;
            if (raw is JsonElement el)
            {
                if (el.ValueKind == JsonValueKind.Number) return el.TryGetInt32(out value);
                if (el.ValueKind == JsonValueKind.String) return int.TryParse(el.GetString(), out value);
                return false;
            }
            return int.TryParse(raw?.ToString(), out value);
        }

        private static string Ok(object? data) =>
            JsonSerializer.Serialize(new { ok = true, data, error = (string?)null }, _jsonOpts);

        private static string Error(string message) =>
            JsonSerializer.Serialize(new { ok = false, data = (object?)null, error = message }, _jsonOpts);
    }
}
