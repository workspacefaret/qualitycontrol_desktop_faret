using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using System.Linq;
using QualityControlCenter.Backend.Services.FaretApi;
using QualityControlCenter.Backend.Services.FpsApi;

namespace QualityControlCenter.Modules.EvaluacionOperadores
{
    // "Evaluación de Calidad por Operador" — FARET, SOLO LECTURA (Fase 34: operadores reales de FPS).
    // Flujo: PNC de Data (GET api/importaciones/pnc, JWT de la sesión) → NP/NV → órdenes y sesiones de producción
    // de FPS (fps-api GET sesiones-documentos, x-api-key) → máquina → día de fabricación → operadores (UserKey).
    // El campo "Operador" de Data (texto libre) solo se COMPARA, nunca define a quién se atribuye.
    // Sin nota, sin ranking, sin sanciones; la responsabilidad humana la confirma Calidad. Nunca escribe nada.
    // Única acción: faret.evaluacionOperadores.resumen (lectura por sufijo en PermisosService).
    public class FaretEvaluacionOperadoresHandler
    {
        private const int PageSize = 500;
        private const int MaxPaginas = 200;
        // Tope de documentos por carga (Fase 41: 5.000 PNC = 65 solicitudes, 36 MB y 10 s de motor). 1.500 NP ≈ 30 lotes ≈ 17 MB.
        // Hoy son ~230 NP. Por encima se rechaza con aviso claro: nunca se calcula con FPS parcial.
        public const int MaxNpPorCarga = 1500;

        private readonly FaretApiClient _client;
        private readonly FaretImportacionApiService _api;
        private readonly FpsSesionesApiService? _fps;
        private readonly bool _verNombres;
        private readonly FaretUniversoCache _cache;

        private static readonly JsonSerializerOptions _jsonOpts = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

        public FaretEvaluacionOperadoresHandler(FaretApiClient client, FpsSesionesApiService? fps, bool verNombres = false, FaretUniversoCache? cache = null)
        {
            _cache = cache ?? FaretUniversoCache.Instancia;
            _client = client;
            _api = new FaretImportacionApiService(client);
            _fps = fps;
            _verNombres = verNombres;
        }

        public async Task<string> Handle(string action, Dictionary<string, object> data)
        {
            try
            {
                return action switch
                {
                    "faret.evaluacionOperadores.resumen" => await HandleResumen(data),
                    "faret.evaluacionOperadores.cancelar" => Ok(new { cancelada = _cache.Cancelar() }),
                    _ => Error($"Acción no reconocida en Evaluación por Operador Faret: {action}"),
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
            TryGetString(data, "area", out var area);
            TryGetString(data, "turno", out var turno);
            TryGetString(data, "operador", out var operador);
            if (turno is not null && turno.Trim().ToUpperInvariant() is not ("A" or "B" or "C")) return Error("Turno inválido");

            // Universo (Data completa + sesiones FPS + atribución) cacheado: cambiar filtros NO vuelve a consultar FPS.
            // "actualizar" fuerza una carga nueva (con un mínimo entre cargas). Los filtros se aplican siempre sobre el universo local.
            var forzar = data.TryGetValue("actualizar", out var fz) && (fz is JsonElement fe ? fe.ValueKind == JsonValueKind.True : fz is true);
            var r = await _cache.ObtenerAsync(_verNombres ? "NOMBRES" : "SEUDONIMOS", forzar, CargarUniversoAsync);

            object CacheInfo() => new
            {
                origen = r.Origen,
                cargadoEn = r.Datos?.CargadoUtc.ToString("o"),
                edadSeg = r.Datos is null ? (int?)null : (int)Math.Max(0, (DateTime.UtcNow - r.Datos.CargadoUtc).TotalSeconds),
                vigenciaMin = (int)_cache.Vigencia.TotalMinutes,
                esperarSeg = r.EsperarSeg,
            };

            if (r.Estado == "ERROR_DATA")
                return Error(r.Error ?? "No se pudo leer Data");
            if (r.Estado != "OK" || r.Datos is null)
            {
                var motivo = r.Error + (r.EsperarSeg > 0 ? $" QCC no volverá a consultar FPS por {r.EsperarSeg} s (use «Actualizar datos» pasado ese tiempo)." : "");
                return Ok(new
                {
                    nombresVisibles = _verNombres,
                    fuente = "Data Faret (PNC, API qualitycontrol)",
                    fps = new { disponible = false, estado = r.Estado, motivo },
                    registradas = r.Datos?.Registradas ?? 0,
                    cache = CacheInfo(),
                    resultado = (object?)null,
                });
            }

            var u = r.Datos;
            var resultado = FaretEvaluacionFpsResumen.Construir(u.Resultados, new FiltrosFps(anio, mes, maquina, area, turno?.Trim().ToUpperInvariant(), operador), _verNombres);
            return Ok(new
            {
                nombresVisibles = _verNombres,
                fuente = "Data Faret (PNC, API qualitycontrol) + sesiones de producción FPS (fps-api)",
                fps = new { disponible = true, estado = "OK", documentos = u.Documentos, sesiones = u.Sesiones },
                cache = CacheInfo(),
                resultado,
            });
        }

        // Carga real y completa (única vía que consulta Data y FPS). La cancela el usuario o el tiempo máximo global.
        private async Task<FaretUniversoCache.Carga> CargarUniversoAsync(CancellationToken ct)
        {
            // 1) Data completa. Nunca calcular con un listado parcial.
            var filas = new List<NcFila>();
            long? total = null;
            for (var page = 1; page <= MaxPaginas; page++)
            {
                ct.ThrowIfCancellationRequested();
                var (ok, body) = await _api.GetPncListAsync(
                    new Dictionary<string, string?> { ["page"] = page.ToString(), ["pageSize"] = PageSize.ToString() }, ct
                );
                if (!FaretEvaluacionOperadoresParser.TryParsePagina(body, out var lote, out var totalApi, out var error) || !ok)
                    return new("ERROR_DATA", null, error);
                total ??= totalApi;
                filas.AddRange(lote);
                if (lote.Count == 0 || (total.HasValue && filas.Count >= total.Value))
                    break;
            }
            if (total.HasValue && filas.Count < total.Value)
                return new("ERROR_DATA", null, "Listado incompleto: la API devolvió menos registros que el total. No se muestran cifras.");

            FaretUniversoCache.Universo Parcial() => new(new List<FaretAtribucionFps.Resultado>(), filas.Count, 0, 0, DateTime.UtcNow);

            // 2) Sesiones reales de FPS para los documentos de las PNC.
            if (_fps is null || !_fps.IsConfigured)
                return new("NO_CONFIGURADO", Parcial(), "La conexión con FPS no está configurada en este equipo.");
            var nps = filas.Select(f => long.TryParse((f.Referencia ?? "").Trim(), out var n) ? n : 0).Where(n => n > 0).Distinct().ToList();
            if (nps.Count > MaxNpPorCarga)
                return new("LIMITE_VOLUMEN", Parcial(), $"Hay {nps.Count} documentos distintos y el máximo por carga es {MaxNpPorCarga}. No se consultó FPS para no sobrecargarlo; hay que acotar el período en origen.");
            var (estado, datos, errorFps) = await _fps.ObtenerAsync(nps, ct);
            if (estado != "OK")
                return new(estado, Parcial(), errorFps);

            // 3) Atribución técnica sobre el universo completo (los filtros se aplican después, en memoria).
            var resultados = filas
                .Select(f => FaretAtribucionFps.Atribuir(
                    new FaretAtribucionFps.PncEntrada(f.Id, f.Referencia, f.Nivel, f.Maquina, f.Area, f.FechaFabricacion, f.Operador), datos))
                .ToList();
            return new("OK", new(resultados, filas.Count, datos.Ordenes.Count, datos.Sesiones.Count, DateTime.UtcNow), null);
        }

        // Sin FPS no se atribuye nada ni se muestran operadores: se informa el motivo real.
        private object SinFps(int registradas, string estado, string? motivo) => new
        {
            nombresVisibles = _verNombres,
            fuente = "Data Faret (PNC, API qualitycontrol)",
            fps = new { disponible = false, estado, motivo },
            registradas,
            resultado = (object?)null,
        };

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
