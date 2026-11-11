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

        // Detalle verificable de las PNC críticas abiertas (para el popover/tooltip del Inicio).
        public List<FaretDashboardCriticaDto> CriticasAbiertasDetalle { get; set; } = new();
    }

    public class FaretDashboardCriticaDto
    {
        public long DataId { get; set; }
        public string Codigo { get; set; } = "";
        public string NpNv { get; set; } = "";
        public string Cliente { get; set; } = "";
        public string TipoPnc { get; set; } = "";
        public string EstadoGestion { get; set; } = "";
        public string FechaIngreso { get; set; } = "";
    }

    public class FaretDashboardKpisDto
    {
        public int NcRegistradasHoy { get; set; }

        // NC con gestión (mejora-continua) cuyo estado_gestion no es CERRADA. Excluye NC vinculadas a
        // registros de Data eliminados (cuando Data está disponible para comprobarlo).
        public int NcAbiertas { get; set; }
        public int NcCerradas { get; set; }

        // Campos que dependen de Data (importacion_pnc, API qualitycontrol). null = Data no
        // disponible: la pantalla muestra "Sin información", nunca 0.
        public bool DataDisponible { get; set; }
        public int? PncSinGestion { get; set; }
        public int? PncPendientesCierre { get; set; }
        public int? CriticasAbiertas { get; set; }
        public int? CriticasEnGestion { get; set; }
        public int? CriticasSinGestion { get; set; }
        public int? NcVinculadasAEliminados { get; set; }

        // NC creadas tras el cambio a SQL Server sin fecha_creacion: se fechan con fecha_deteccion.
        public int NcSinFechaCreacion { get; set; }
        public int AccionesPendientes { get; set; }
        public int AccionesVencidas { get; set; }
        public decimal PorcentajeAccionesCompletadas { get; set; }

        // fecha_cierre real (columna agregada en mejora-continua.api, seteada server-side al
        // transicionar a COMPLETADA/CANCELADA). Solo cuenta acciones COMPLETADA con fechaLimite
        // y fechaCierre presentes; acciones creadas antes de esa migración sin dato quedan fuera.
        public int AccionesCompletadasATiempo { get; set; }
        public int AccionesCompletadasFueraDePlazo { get; set; }
        public decimal PorcentajeAccionesCompletadasATiempo { get; set; }
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
