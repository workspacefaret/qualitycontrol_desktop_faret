using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.Tasks;
using QualityControlCenter.Backend.Models.FaretApi;

namespace QualityControlCenter.Backend.Services.FaretApi
{
    public class FaretDashboardService
    {
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

        public FaretDashboardService(FaretNoConformidadesApiService noConformidades)
        {
            _noConformidades = noConformidades;
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

            // Una NC puntual con error al traer sus acciones no debe romper todo el dashboard.
            var acciones = new List<AccionRaw>();
            foreach (var nc in ncs)
            {
                var (accOk, accBody) = await _noConformidades.GetAccionesAsync(nc.Id);
                if (!accOk)
                    continue;

                try
                {
                    var lista = JsonSerializer.Deserialize<List<AccionRaw>>(accBody, _jsonOpts);
                    if (lista != null)
                        acciones.AddRange(lista);
                }
                catch
                {
                    // se ignora esa NC puntual, el resto del dashboard sigue funcionando
                }
            }

            var dto = new FaretDashboardDto
            {
                Kpis = CalcularKpis(ncs, acciones),
                NcPorProceso = AgruparPorCategoria(ncs.Select(n => n.Proceso)),
                NcPorSeveridad = AgruparPorCategoria(ncs.Select(n => n.Severidad)),
                TendenciaNc30Dias = CalcularTendencia30Dias(ncs),
                AccionesPorProceso = AgruparAccionesPorProceso(ncs, acciones),
                EstadoAcciones = AgruparEstadoAcciones(acciones),
                UltimasNc = ObtenerUltimasNc(ncs),
                Alertas = CalcularAlertas(ncs, acciones),
            };

            return (true, dto, "");
        }

        private static FaretDashboardKpisDto CalcularKpis(List<NcRaw> ncs, List<AccionRaw> acciones)
        {
            var hoy = DateTime.Today;

            var accionesCompletadas = acciones.Count(a => EsEstado(a.Estado, "COMPLETADA"));

            return new FaretDashboardKpisDto
            {
                NcRegistradasHoy = ncs.Count(n => n.FechaCreacion?.Date == hoy),
                NcAbiertas = ncs.Count(n => !EsEstado(n.Estado, "CERRADA")),
                AccionesPendientes = acciones.Count(a => EsEstado(a.Estado, "PENDIENTE")),
                AccionesVencidas = acciones.Count(a =>
                    a.FechaLimite.HasValue
                    && a.FechaLimite.Value.Date < hoy
                    && !EsEstadoTerminal(a.Estado)
                ),
                PorcentajeAccionesCompletadas =
                    acciones.Count == 0
                        ? 0
                        : Math.Round(100m * accionesCompletadas / acciones.Count, 0),
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
            var procesoPorNcId = ncs.ToDictionary(n => n.Id, n => n.Proceso);

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

        private static List<FaretDashboardTendenciaDto> CalcularTendencia30Dias(List<NcRaw> ncs)
        {
            var hoy = DateTime.Today;
            var resultado = new List<FaretDashboardTendenciaDto>();

            for (var i = 29; i >= 0; i--)
            {
                var dia = hoy.AddDays(-i);

                resultado.Add(
                    new FaretDashboardTendenciaDto
                    {
                        Fecha = dia.ToString("dd MMM"),
                        Total = ncs.Count(n => n.FechaCreacion?.Date == dia),
                    }
                );
            }

            return resultado;
        }

        private static List<FaretDashboardNcResumenDto> ObtenerUltimasNc(List<NcRaw> ncs)
        {
            return ncs.OrderByDescending(n => n.FechaCreacion)
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
                            Estado = n.Estado ?? "",
                            FechaCreacion = n.FechaCreacion?.ToString("dd-MM-yyyy") ?? "",
                        }
                )
                .ToList();
        }

        private static List<FaretDashboardAlertaDto> CalcularAlertas(List<NcRaw> ncs, List<AccionRaw> acciones)
        {
            var alertas = new List<FaretDashboardAlertaDto>();
            var hoy = DateTime.Today;

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

            var ncCriticasAbiertas = ncs.Count(n => EsEstado(n.Severidad, "ALTA") && !EsEstado(n.Estado, "CERRADA"));
            if (ncCriticasAbiertas > 0)
                alertas.Add(
                    new FaretDashboardAlertaDto
                    {
                        Tipo = "warning",
                        Mensaje = $"Existen {ncCriticasAbiertas} no conformidad(es) crítica(s) abierta(s)",
                    }
                );

            // "✔ Proceso sin NC críticas hace N días": solo para procesos con al menos 1 NC crítica
            // histórica (para no adivinar antigüedad sin un punto de referencia real), y con un
            // mínimo de 7 días para que el mensaje sea relevante.
            var procesosConCriticas = ncs.Where(n => EsEstado(n.Severidad, "ALTA") && !string.IsNullOrWhiteSpace(n.Proceso))
                .GroupBy(n => n.Proceso!.Trim());

            foreach (var grupo in procesosConCriticas.Take(3))
            {
                var ultima = grupo.Max(n => n.FechaCreacion);
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

        private static bool EsEstado(string? valor, string esperado) =>
            string.Equals(valor?.Trim(), esperado, StringComparison.OrdinalIgnoreCase);

        private static bool EsEstadoTerminal(string? estado) =>
            EsEstado(estado, "COMPLETADA") || EsEstado(estado, "CANCELADA");

        private class NcRaw
        {
            public int Id { get; set; }
            public string? Codigo { get; set; }
            public string? Titulo { get; set; }
            public string? Severidad { get; set; }
            public string? Estado { get; set; }
            public string? Proceso { get; set; }

            [JsonPropertyName("fechaCreacion")]
            public DateTime? FechaCreacion { get; set; }
        }

        private class AccionRaw
        {
            public int Id { get; set; }

            [JsonPropertyName("noConformidadId")]
            public int NoConformidadId { get; set; }

            public string? Estado { get; set; }

            [JsonPropertyName("fechaLimite")]
            public DateTime? FechaLimite { get; set; }
        }
    }
}
