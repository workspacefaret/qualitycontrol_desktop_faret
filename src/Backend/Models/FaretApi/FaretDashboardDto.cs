using System.Collections.Generic;

namespace QualityControlCenter.Backend.Models.FaretApi
{
    public class FaretDashboardDto
    {
        public FaretDashboardKpisDto Kpis { get; set; } = new();
        public List<FaretDashboardCategoriaDto> NcPorProceso { get; set; } = new();
        public List<FaretDashboardCategoriaDto> NcPorSeveridad { get; set; } = new();
        public List<FaretDashboardTendenciaDto> TendenciaNc30Dias { get; set; } = new();
        public List<FaretDashboardCategoriaDto> AccionesPorProceso { get; set; } = new();
        public List<FaretDashboardCategoriaDto> EstadoAcciones { get; set; } = new();
        public List<FaretDashboardNcResumenDto> UltimasNc { get; set; } = new();
        public List<FaretDashboardAlertaDto> Alertas { get; set; } = new();
    }

    public class FaretDashboardKpisDto
    {
        public int NcRegistradasHoy { get; set; }
        public int NcAbiertas { get; set; }
        public int AccionesPendientes { get; set; }
        public int AccionesVencidas { get; set; }
        public decimal PorcentajeAccionesCompletadas { get; set; }
    }

    public class FaretDashboardCategoriaDto
    {
        public string Categoria { get; set; } = "";
        public int Total { get; set; }
    }

    public class FaretDashboardTendenciaDto
    {
        public string Fecha { get; set; } = "";
        public int Total { get; set; }
    }

    public class FaretDashboardNcResumenDto
    {
        public int Id { get; set; }
        public string Codigo { get; set; } = "";
        public string Titulo { get; set; } = "";
        public string Proceso { get; set; } = "";
        public string Severidad { get; set; } = "";
        public string Estado { get; set; } = "";
        public string FechaCreacion { get; set; } = "";
    }

    public class FaretDashboardAlertaDto
    {
        // "warning" | "success"
        public string Tipo { get; set; } = "";
        public string Mensaje { get; set; } = "";
    }
}
