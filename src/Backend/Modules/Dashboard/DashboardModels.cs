using System.Collections.Generic;

namespace QualityControlCenter.Modules.Dashboard
{
    public class DashboardResumenDto
    {
        public int ControlesHoy { get; set; }
        public int ControlesPeriodo { get; set; }

        public decimal CumplimientoGeneral { get; set; }
        public int NoConformidadesDetectadas { get; set; }

        public decimal MermaInsumosHoy { get; set; }
        public decimal MermaProcesoHoy { get; set; }
        public int RegistrosConObservacionHoy { get; set; }

        public List<DashboardInspectorDto> CumplimientoPorInspector { get; set; } = new();
        public List<DashboardInspectorDto> NoConformidadesPorInspector { get; set; } = new();
        public List<DashboardProcesoInspectorDto> ControlesPorProceso { get; set; } = new();
        public List<DashboardTendenciaDto> TendenciaCumplimiento { get; set; } = new();
        public List<DashboardDesempenoInspectorDto> DesempenoIndividual { get; set; } = new();

        public List<DashboardRegistroDto> UltimosRegistros { get; set; } = new();
    }

    public class DashboardInspectorDto
    {
        public string Inspector { get; set; } = "";
        public int Total { get; set; }
        public decimal Porcentaje { get; set; }
    }

    public class DashboardProcesoInspectorDto
    {
        public string Proceso { get; set; } = "";
        public string Inspector { get; set; } = "";
        public int Total { get; set; }
    }

    public class DashboardTendenciaDto
    {
        public string Fecha { get; set; } = "";
        public decimal Cumplimiento { get; set; }
    }

    public class DashboardDesempenoInspectorDto
    {
        public string Inspector { get; set; } = "";
        public decimal Cumplimiento { get; set; }
        public int ControlesProgramados { get; set; }
        public int ControlesRealizados { get; set; }
        public int NoConformidades { get; set; }
        public string Estado { get; set; } = "";
    }

    public class DashboardRegistroDto
    {
        public int Id { get; set; }

        public string FechaRegistro { get; set; } = "";
        public string HoraRegistro { get; set; } = "";

        public string Usuario { get; set; } = "";
        public string Proceso { get; set; } = "";
        public string Maquina { get; set; } = "";
        public string Formulario { get; set; } = "";

        public string Np { get; set; } = "";
        public string Producto { get; set; } = "";

        public string Turno { get; set; } = "";
        public string Estado { get; set; } = "";
        public string Observacion { get; set; } = "";

        public string EstadoValidacion { get; set; } = "";
        public string FechaValidacion { get; set; } = "";
        public string UsuarioValidacion { get; set; } = "";
        public string ImagenUrl { get; set; } = "";
    }

    public class DashboardCatalogoDto
    {
        public int Id { get; set; }
        public string Nombre { get; set; } = "";
    }

    public class DashboardFiltrosDto
    {
        public List<DashboardCatalogoDto> Usuarios { get; set; } = new();
        public List<DashboardCatalogoDto> Procesos { get; set; } = new();
    }
}
