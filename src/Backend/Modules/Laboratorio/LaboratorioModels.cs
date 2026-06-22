using System.Collections.Generic;

namespace QualityControlCenter.Modules.Laboratorio
{
    public class LaboratorioResumenDto
    {
        public int EnsayosHoy { get; set; }
        public int EnsayosPeriodo { get; set; }
        public int TiposEnsayo { get; set; }
        public int MaterialesAnalizados { get; set; }

        public List<LaboratorioCatalogoDto> Ensayos { get; set; } = new();
        public List<LaboratorioCatalogoDto> Materiales { get; set; } = new();
        public List<LaboratorioRegistroDto> Registros { get; set; } = new();
    }

    public class LaboratorioRegistroDto
    {
        public int Id { get; set; }
        public int RegistroId { get; set; }

        public string FechaRegistro { get; set; } = "";
        public string HoraRegistro { get; set; } = "";
        public string Usuario { get; set; } = "";
        public string Proceso { get; set; } = "";
        public string Np { get; set; } = "";
        public string Turno { get; set; } = "";

        public string Ensayo { get; set; } = "";
        public string Material { get; set; } = "";
        public string Valor { get; set; } = "";
        public string Observacion { get; set; } = "";
        public string ImagenUrl { get; set; } = "";
    }

    public class LaboratorioCatalogoDto
    {
        public int Id { get; set; }
        public string Nombre { get; set; } = "";
    }
}
