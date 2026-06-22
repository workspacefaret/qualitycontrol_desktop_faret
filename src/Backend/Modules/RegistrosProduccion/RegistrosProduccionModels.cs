using System.Collections.Generic;

namespace QualityControlCenter.Modules.RegistrosProduccion
{
    public class RegistrosProduccionResumenDto
    {
        public int ControlesHoy { get; set; }
        public int ControlesPeriodo { get; set; }

        public decimal CumplimientoGeneral { get; set; }
        public int NoConformidadesDetectadas { get; set; }

        public decimal MermaInsumosHoy { get; set; }
        public decimal MermaProcesoHoy { get; set; }
        public int RegistrosConObservacionHoy { get; set; }

        public List<RegistrosProduccionInspectorDto> CumplimientoPorInspector { get; set; } = new();
        public List<RegistrosProduccionInspectorDto> NoConformidadesPorInspector { get; set; } =
            new();
        public List<RegistrosProduccionProcesoInspectorDto> ControlesPorProceso { get; set; } =
            new();
        public List<RegistrosProduccionTendenciaDto> TendenciaCumplimiento { get; set; } = new();
        public List<RegistrosProduccionDesempenoInspectorDto> DesempenoIndividual { get; set; } =
            new();

        public List<RegistroProduccionDto> UltimosRegistros { get; set; } = new();
    }

    public class RegistrosProduccionInspectorDto
    {
        public string Inspector { get; set; } = "";
        public int Total { get; set; }
        public decimal Porcentaje { get; set; }
    }

    public class RegistrosProduccionProcesoInspectorDto
    {
        public string Proceso { get; set; } = "";
        public string Inspector { get; set; } = "";
        public int Total { get; set; }
    }

    public class RegistrosProduccionTendenciaDto
    {
        public string Fecha { get; set; } = "";
        public decimal Cumplimiento { get; set; }
    }

    public class RegistrosProduccionDesempenoInspectorDto
    {
        public string Inspector { get; set; } = "";
        public decimal Cumplimiento { get; set; }
        public int ControlesProgramados { get; set; }
        public int ControlesRealizados { get; set; }
        public int NoConformidades { get; set; }
        public string Estado { get; set; } = "";
    }

    public class RegistroProduccionDto
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

    public class RegistrosProduccionCatalogoDto
    {
        public int Id { get; set; }
        public string Nombre { get; set; } = "";
    }

    public class RegistrosProduccionFiltrosDto
    {
        public List<RegistrosProduccionCatalogoDto> Usuarios { get; set; } = new();
        public List<RegistrosProduccionCatalogoDto> Procesos { get; set; } = new();
    }
}
