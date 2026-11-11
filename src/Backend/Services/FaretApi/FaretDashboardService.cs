using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading;
using System.Threading.Tasks;
using QualityControlCenter.Backend.Models.FaretApi;

namespace QualityControlCenter.Backend.Services.FaretApi
{
    // Indicadores del Inicio Faret. Fuentes (siempre por API, nunca MySQL directo):
    // - Gestión de NC: API mejora-continua (nc_no_conformidades). El estado real es estado_gestion;
    //   la columna legacy "estado" quedó fija en ABIERTA y nunca se actualiza (causa de "354 abiertas").
    // - Registros PNC: API qualitycontrol (importacion_pnc, ya sin eliminados). Aporta el nivel real
    //   (Crítico/Mayor/Menor), las PNC aún sin gestión y permite descartar NC de registros eliminados.
    public class FaretDashboardService
    {
        private const string SistemaOrigenData = "DATA_FARET";
        private const int PageSizeData = 500;
        private const int MaxPaginasData = 200;
        private const int ConcurrenciaAcciones = 6;

        private static readonly string[] EstadosAccionOrden =
        {
            "PENDIENTE",
            "EN_PROCESO",
            "COMPLETADA",
            "CANCELADA",
        };

        private static readonly JsonSerializerOptions _jsonOpts = new()
        {
            PropertyNameCaseInsensitive = true,
        };

        private readonly FaretNoConformidadesApiService _noConformidades;
        private readonly FaretImportacionApiService? _importacion;
        private readonly Func<bool> _dataDisponible;

        public FaretDashboardService(
            FaretNoConformidadesApiService noConformidades,
            FaretImportacionApiService? importacion = null,
            Func<bool>? dataDisponible = null
        )
        {
            _noConformidades = noConformidades;
            _importacion = importacion;
            _dataDisponible = dataDisponible ?? (() => importacion != null);
        }

        public async Task<(bool ok, FaretDashboardDto? data, string error)> ObtenerResumenAsync()
        {
            var (ncOk, ncBody) = await _noConformidades.GetListAsync();
            if (!ncOk)
                return (false, null, "No se pudo obtener el listado de no conformidades");

            List<NcRaw> ncs;
            try
            {
                ncs = JsonSerializer.Deserialize<List<NcRaw>>(ncBody, _jsonOpts) ?? new();
            }
            catch
            {
                return (false, null, "Respuesta inválida de la API al listar no conformidades");
            }

            var data = await CargarDataAsync();
            var acciones = await CargarAccionesAsync(ncs);

            return (true, Calcular(ncs, acciones, data, DateTime.Today), "");
        }

        // Cálculo puro (sin red), público para las pruebas.
        public static FaretDashboardDto CalcularParaPruebas(
            string ncJson,
            string? dataItemsJson,
            string accionesJson,
            DateTime hoy
        )
        {
            var ncs = JsonSerializer.Deserialize<List<NcRaw>>(ncJson, _jsonOpts) ?? new();
            var data = dataItemsJson == null ? null : JsonSerializer.Deserialize<List<PncRaw>>(dataItemsJson, _jsonOpts);
            var acciones = JsonSerializer.Deserialize<List<AccionRaw>>(accionesJson, _jsonOpts) ?? new();
            return Calcular(ncs, acciones, data, hoy);
        }

        private static FaretDashboardDto Calcular(List<NcRaw> ncsTodas, List<AccionRaw> acciones, List<PncRaw>? data, DateTime hoy)
        {
            foreach (var nc in ncsTodas)
                nc.FechaEfectiva = FechaValida(nc.FechaCreacion) ?? FechaValida(nc.FechaDeteccion);

            // NC de Data cuyo registro fue eliminado (no viene en el listado de Data): no son NC vigentes.
            var dataPorId = data?.GroupBy(d => d.Id).ToDictionary(g => g.Key.ToString(), g => g.First());
            var vinculadasAEliminados = dataPorId == null
                ? new List<NcRaw>()
                : ncsTodas.Where(n => EsDeData(n) && !dataPorId.ContainsKey(n.OrigenId!.Trim())).ToList();
            var ncs = ncsTodas.Except(vinculadasAEliminados).ToList();

            var dto = new FaretDashboardDto
            {
                Kpis = CalcularKpis(ncs, acciones, hoy),
                NcPorProceso = AgruparPorCategoria(ncs.Select(n => n.Proceso)),
                NcPorSeveridad = AgruparPorCategoria(ncs.Select(n => n.Severidad)),
                TendenciaNc30Dias = CalcularTendencia30Dias(ncs, hoy),
                AccionesPorProceso = AgruparAccionesPorProceso(ncs, acciones),
                EstadoAcciones = AgruparEstadoAcciones(acciones),
                UltimasNc = ObtenerUltimasNc(ncs),
            };
            dto.Kpis.NcSinFechaCreacion = ncs.Count(n => FechaValida(n.FechaCreacion) == null);

            if (data != null && dataPorId != null)
            {
                var ncPorOrigen = ncs.Where(EsDeData)
                    .GroupBy(n => n.OrigenId!.Trim())
                    .ToDictionary(g => g.Key, g => g.OrderByDescending(n => n.Id).First());

                var sinGestion = data.Where(d => !ncPorOrigen.ContainsKey(d.Id.ToString())).ToList();
                var criticasEnGestion = data.Where(d =>
                        EsCritica(d.Nivel)
                        && ncPorOrigen.TryGetValue(d.Id.ToString(), out var nc)
                        && EstaAbierta(nc)
                    )
                    .ToList();
                var criticasSinGestion = sinGestion.Where(d => EsCritica(d.Nivel)).ToList();
                // NC sin registro de Data (manuales): su criticidad es la severidad de la NC.
                var criticasManuales = ncs.Where(n => !EsDeData(n) && EstaAbierta(n) && EsEstado(n.Severidad, "ALTA")).ToList();

                dto.Kpis.DataDisponible = true;
                dto.Kpis.PncSinGestion = sinGestion.Count;
                dto.Kpis.PncPendientesCierre = dto.Kpis.NcAbiertas + sinGestion.Count;
                dto.Kpis.CriticasEnGestion = criticasEnGestion.Count + criticasManuales.Count;
                dto.Kpis.CriticasSinGestion = criticasSinGestion.Count;
                dto.Kpis.CriticasAbiertas = dto.Kpis.CriticasEnGestion + dto.Kpis.CriticasSinGestion;
                dto.Kpis.NcVinculadasAEliminados = vinculadasAEliminados.Count;

                dto.CriticasAbiertasDetalle = criticasEnGestion
                    .Select(d => DetalleCritica(d, ncPorOrigen[d.Id.ToString()]))
                    .Concat(criticasSinGestion.Select(d => DetalleCritica(d, null)))
                    .Concat(criticasManuales.Select(n => new FaretDashboardCriticaDto
                    {
                        Codigo = n.Codigo ?? "",
                        TipoPnc = n.Proceso ?? "",
                        EstadoGestion = n.EstadoGestion ?? "",
                        FechaIngreso = n.FechaEfectiva?.ToString("dd-MM-yyyy") ?? "",
                    }))
                    .ToList();
            }

            dto.Alertas = CalcularAlertas(ncs, acciones, dto.Kpis, hoy);
            return dto;
        }

        private async Task<List<PncRaw>?> CargarDataAsync()
        {
            if (_importacion == null || !_dataDisponible())
                return null;

            var items = new List<PncRaw>();
            long total = long.MaxValue;
            for (var page = 1; page <= MaxPaginasData && items.Count < total; page++)
            {
                var (ok, body) = await _importacion.GetPncListAsync(
                    new Dictionary<string, string?> { ["page"] = page.ToString(), ["pageSize"] = PageSizeData.ToString() }
                );
                if (!ok)
                    return null; // sin Data completa no se informan sus indicadores (nunca un 0 parcial)

                try
                {
                    using var doc = JsonDocument.Parse(body);
                    var root = doc.RootElement;
                    if (root.TryGetProperty("success", out var s) && s.ValueKind == JsonValueKind.False)
                        return null;
                    var payload = root.TryGetProperty("data", out var d) ? d : root;
                    if (!payload.TryGetProperty("items", out var arr) || arr.ValueKind != JsonValueKind.Array)
                        return null;
                    if (payload.TryGetProperty("totalCount", out var tc) && tc.TryGetInt64(out var t))
                        total = t;

                    var lote = arr.Deserialize<List<PncRaw>>(_jsonOpts) ?? new();
                    if (lote.Count == 0)
                        break;
                    items.AddRange(lote);
                }
                catch
                {
                    return null;
                }
            }

            return total != long.MaxValue && items.Count < total ? null : items;
        }

        // Una NC puntual con error al traer sus acciones no debe romper todo el dashboard.
        private async Task<List<AccionRaw>> CargarAccionesAsync(List<NcRaw> ncs)
        {
            using var limite = new SemaphoreSlim(ConcurrenciaAcciones);
            var tareas = ncs.Select(async nc =>
            {
                await limite.WaitAsync();
                try
                {
                    var (accOk, accBody) = await _noConformidades.GetAccionesAsync(nc.Id);
                    if (!accOk)
                        return new List<AccionRaw>();
                    return JsonSerializer.Deserialize<List<AccionRaw>>(accBody, _jsonOpts) ?? new();
                }
                catch
                {
                    return new List<AccionRaw>();
                }
                finally
                {
                    limite.Release();
                }
            });

            return (await Task.WhenAll(tareas)).SelectMany(l => l).ToList();
        }

        private static FaretDashboardKpisDto CalcularKpis(List<NcRaw> ncs, List<AccionRaw> acciones, DateTime hoy)
        {
            var accionesCompletadas = acciones.Where(a => EsEstado(a.Estado, "COMPLETADA")).ToList();

            // fecha_cierre real (seteada server-side por la API al transicionar a
            // COMPLETADA/CANCELADA) — solo se evalúan las acciones completadas que la tienen.
            var accionesCompletadasEvaluables = accionesCompletadas
                .Where(a => a.FechaCierre.HasValue && a.FechaLimite.HasValue)
                .ToList();
            var accionesCompletadasATiempo = accionesCompletadasEvaluables.Count(a =>
                a.FechaCierre!.Value.Date <= a.FechaLimite!.Value.Date
            );
            var accionesCompletadasFueraDePlazo = accionesCompletadasEvaluables.Count - accionesCompletadasATiempo;

            return new FaretDashboardKpisDto
            {
                NcRegistradasHoy = ncs.Count(n => n.FechaEfectiva?.Date == hoy),
                NcAbiertas = ncs.Count(EstaAbierta),
                NcCerradas = ncs.Count(n => !EstaAbierta(n)),
                AccionesPendientes = acciones.Count(a => EsEstado(a.Estado, "PENDIENTE")),
                AccionesVencidas = acciones.Count(a =>
                    a.FechaLimite.HasValue
                    && a.FechaLimite.Value.Date < hoy
                    && !EsEstadoTerminal(a.Estado)
                ),
                PorcentajeAccionesCompletadas =
                    acciones.Count == 0
                        ? 0
                        : Math.Round(100m * accionesCompletadas.Count / acciones.Count, 0),
                AccionesCompletadasATiempo = accionesCompletadasATiempo,
                AccionesCompletadasFueraDePlazo = accionesCompletadasFueraDePlazo,
                PorcentajeAccionesCompletadasATiempo =
                    accionesCompletadasEvaluables.Count == 0
                        ? 0
                        : Math.Round(100m * accionesCompletadasATiempo / accionesCompletadasEvaluables.Count, 0),
            };
        }

        private static List<FaretDashboardCategoriaDto> AgruparPorCategoria(IEnumerable<string?> valores)
        {
            return valores
                .Select(v => string.IsNullOrWhiteSpace(v) ? "Sin dato" : v!.Trim())
                .GroupBy(v => v)
                .Select(g => new FaretDashboardCategoriaDto { Categoria = g.Key, Total = g.Count() })
                .OrderByDescending(c => c.Total)
                .ToList();
        }

        private static List<FaretDashboardCategoriaDto> AgruparAccionesPorProceso(
            List<NcRaw> ncs,
            List<AccionRaw> acciones
        )
        {
            var procesoPorNcId = ncs.GroupBy(n => n.Id).ToDictionary(g => g.Key, g => g.First().Proceso);

            return AgruparPorCategoria(
                acciones.Select(a =>
                    procesoPorNcId.TryGetValue(a.NoConformidadId, out var proceso) ? proceso : null
                )
            );
        }

        private static List<FaretDashboardCategoriaDto> AgruparEstadoAcciones(List<AccionRaw> acciones)
        {
            // Se listan los 4 estados conocidos aunque estén en 0, para un donut con leyenda estable.
            return EstadosAccionOrden
                .Select(
                    estado =>
                        new FaretDashboardCategoriaDto
                        {
                            Categoria = estado,
                            Total = acciones.Count(a => EsEstado(a.Estado, estado)),
                        }
                )
                .ToList();
        }

        private static List<FaretDashboardTendenciaDto> CalcularTendencia30Dias(List<NcRaw> ncs, DateTime hoy)
        {
            var resultado = new List<FaretDashboardTendenciaDto>();

            for (var i = 29; i >= 0; i--)
            {
                var dia = hoy.AddDays(-i);

                resultado.Add(
                    new FaretDashboardTendenciaDto
                    {
                        Fecha = dia.ToString("dd MMM"),
                        Total = ncs.Count(n => n.FechaEfectiva?.Date == dia),
                    }
                );
            }

            return resultado;
        }

        private static List<FaretDashboardNcResumenDto> ObtenerUltimasNc(List<NcRaw> ncs)
        {
            return ncs.OrderByDescending(n => n.FechaEfectiva ?? DateTime.MinValue)
                .ThenByDescending(n => n.Id)
                .Take(8)
                .Select(
                    n =>
                        new FaretDashboardNcResumenDto
                        {
                            Id = n.Id,
                            Codigo = n.Codigo ?? "",
                            Titulo = n.Titulo ?? "",
                            Proceso = n.Proceso ?? "",
                            Severidad = n.Severidad ?? "",
                            Estado = string.IsNullOrWhiteSpace(n.EstadoGestion) ? "PENDIENTE" : n.EstadoGestion!,
                            FechaCreacion = n.FechaEfectiva?.ToString("dd-MM-yyyy") ?? "",
                        }
                )
                .ToList();
        }

        private static List<FaretDashboardAlertaDto> CalcularAlertas(
            List<NcRaw> ncs,
            List<AccionRaw> acciones,
            FaretDashboardKpisDto kpis,
            DateTime hoy
        )
        {
            var alertas = new List<FaretDashboardAlertaDto>();

            var accionesVencidas = acciones.Count(a =>
                a.FechaLimite.HasValue && a.FechaLimite.Value.Date < hoy && !EsEstadoTerminal(a.Estado)
            );
            if (accionesVencidas > 0)
                alertas.Add(
                    new FaretDashboardAlertaDto
                    {
                        Tipo = "warning",
                        Mensaje = $"Hay {accionesVencidas} acción(es) correctiva(s) vencida(s)",
                    }
                );

            if (kpis.DataDisponible)
            {
                if (kpis.CriticasAbiertas > 0)
                    alertas.Add(
                        new FaretDashboardAlertaDto
                        {
                            Tipo = "warning",
                            Mensaje =
                                $"Existen {kpis.CriticasAbiertas} PNC crítica(s) sin cerrar "
                                + $"({kpis.CriticasEnGestion} en gestión, {kpis.CriticasSinGestion} sin gestión)",
                        }
                    );
                if (kpis.PncSinGestion > 0)
                    alertas.Add(
                        new FaretDashboardAlertaDto
                        {
                            Tipo = "warning",
                            Mensaje = $"Hay {kpis.PncSinGestion} PNC registrada(s) en Data sin gestión iniciada",
                        }
                    );
            }
            else
            {
                // Sin Data no se conoce el nivel real ni las PNC sin gestión: solo NC en gestión.
                var criticasEnGestion = ncs.Count(n => EsEstado(n.Severidad, "ALTA") && EstaAbierta(n));
                if (criticasEnGestion > 0)
                    alertas.Add(
                        new FaretDashboardAlertaDto
                        {
                            Tipo = "warning",
                            Mensaje = $"Existen {criticasEnGestion} no conformidad(es) crítica(s) en gestión sin cerrar",
                        }
                    );
                alertas.Add(
                    new FaretDashboardAlertaDto
                    {
                        Tipo = "warning",
                        Mensaje = "Data (registros PNC) no disponible: no se informan PNC sin gestión ni críticas sin gestión",
                    }
                );
            }

            if (kpis.NcSinFechaCreacion > 0)
                alertas.Add(
                    new FaretDashboardAlertaDto
                    {
                        Tipo = "warning",
                        Mensaje =
                            $"{kpis.NcSinFechaCreacion} NC no tienen fecha de creación en Mejora Continua; se usa su fecha de detección",
                    }
                );

            // "✔ Proceso sin NC críticas hace N días": solo para procesos con al menos 1 NC crítica
            // histórica (para no adivinar antigüedad sin un punto de referencia real), y con un
            // mínimo de 7 días para que el mensaje sea relevante.
            var procesosConCriticas = ncs.Where(n => EsEstado(n.Severidad, "ALTA") && !string.IsNullOrWhiteSpace(n.Proceso))
                .GroupBy(n => n.Proceso!.Trim());

            foreach (var grupo in procesosConCriticas.Take(3))
            {
                var ultima = grupo.Max(n => n.FechaEfectiva);
                if (ultima == null)
                    continue;

                var dias = (hoy - ultima.Value.Date).Days;
                if (dias >= 7)
                    alertas.Add(
                        new FaretDashboardAlertaDto
                        {
                            Tipo = "success",
                            Mensaje = $"{grupo.Key} sin nuevas no conformidades críticas registradas hace {dias} días",
                        }
                    );
            }

            return alertas;
        }

        private static FaretDashboardCriticaDto DetalleCritica(PncRaw d, NcRaw? nc) =>
            new()
            {
                DataId = d.Id,
                Codigo = nc?.Codigo ?? $"Data #{d.Id}",
                NpNv = d.NpNv ?? "",
                Cliente = d.Cliente ?? "",
                TipoPnc = d.TipoPnc ?? "",
                EstadoGestion = nc == null ? "SIN_GESTION" : (string.IsNullOrWhiteSpace(nc.EstadoGestion) ? "PENDIENTE" : nc.EstadoGestion!),
                FechaIngreso = FechaValida(d.FechaIngreso)?.ToString("dd-MM-yyyy") ?? "",
            };

        private static bool EsEstado(string? valor, string esperado) =>
            string.Equals(valor?.Trim(), esperado, StringComparison.OrdinalIgnoreCase);

        private static bool EsCritica(string? nivel) =>
            (nivel ?? "").Trim().ToUpperInvariant().Replace("Í", "I").StartsWith("CRIT");

        private static bool EsDeData(NcRaw n) =>
            EsEstado(n.SistemaOrigen, SistemaOrigenData) && !string.IsNullOrWhiteSpace(n.OrigenId);

        // La API serializa fecha_creacion NULL como 0001-01-01: se trata como dato ausente.
        private static DateTime? FechaValida(DateTime? fecha) =>
            fecha.HasValue && fecha.Value.Year >= 2000 ? fecha : null;

        // El estado real de la gestión es estado_gestion; la columna legacy "estado" quedó fija en
        // ABIERTA y nunca se actualiza. Sin gestión registrada (null/vacío) cuenta como abierta.
        private static bool EstaAbierta(NcRaw n) => !EsEstado(n.EstadoGestion, "CERRADA");

        private static bool EsEstadoTerminal(string? estado) =>
            EsEstado(estado, "COMPLETADA") || EsEstado(estado, "CANCELADA");

        private class NcRaw
        {
            public int Id { get; set; }
            public string? Codigo { get; set; }
            public string? Titulo { get; set; }
            public string? Severidad { get; set; }
            public string? Estado { get; set; }

            [JsonPropertyName("estadoGestion")]
            public string? EstadoGestion { get; set; }

            [JsonPropertyName("sistemaOrigen")]
            public string? SistemaOrigen { get; set; }

            [JsonPropertyName("origenId")]
            public string? OrigenId { get; set; }

            public string? Proceso { get; set; }

            [JsonPropertyName("fechaCreacion")]
            public DateTime? FechaCreacion { get; set; }

            [JsonPropertyName("fechaDeteccion")]
            public DateTime? FechaDeteccion { get; set; }

            [JsonIgnore]
            public DateTime? FechaEfectiva { get; set; }
        }

        private class PncRaw
        {
            public long Id { get; set; }
            public string? NpNv { get; set; }
            public string? Cliente { get; set; }
            public string? TipoPnc { get; set; }
            public string? Nivel { get; set; }
            public DateTime? FechaIngreso { get; set; }
        }

        private class AccionRaw
        {
            public int Id { get; set; }

            [JsonPropertyName("noConformidadId")]
            public int NoConformidadId { get; set; }

            public string? Estado { get; set; }

            [JsonPropertyName("fechaLimite")]
            public DateTime? FechaLimite { get; set; }

            [JsonPropertyName("fechaCierre")]
            public DateTime? FechaCierre { get; set; }
        }
    }
}
