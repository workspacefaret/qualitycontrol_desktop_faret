using System.Collections.Generic;

namespace QualityControlCenter.Modules.Mermas
{
    public class MermasResumenDto
    {
        public decimal TotalKg { get; set; }
        public decimal TotalUnidades { get; set; }
        public int CantidadRegistros { get; set; }
        public string MaterialMayorMerma { get; set; } = "-";

        public List<MermaRegistroDto> Registros { get; set; } = new();
        public List<MermaAgrupadaDto> PorMaterial { get; set; } = new();
        public List<MermaAgrupadaDto> PorProceso { get; set; } = new();
        public List<MermaAgrupadaDto> PorMaquina { get; set; } = new();
    }

    public class MermaRegistroDto
    {
        public int Id { get; set; }
        public string Fecha { get; set; } = "";
        public string Area { get; set; } = "-";
        public string Proceso { get; set; } = "-";
        public string Maquina { get; set; } = "-";
        public string Usuario { get; set; } = "-";
        public string Np { get; set; } = "-";
        public string CodigoProducto { get; set; } = "-";
        public string DescripcionProducto { get; set; } = "-";
        public string Material { get; set; } = "-";
        public decimal Cantidad { get; set; }
        public string Unidad { get; set; } = "-";
        public string Observacion { get; set; } = "-";
        public string Turno { get; set; } = "-";
        public string EstadoValidacion { get; set; } = "-";
    }

    public class MermaAgrupadaDto
    {
        public string Nombre { get; set; } = "-";
        public decimal TotalKg { get; set; }
        public decimal TotalUnidades { get; set; }
        public int Registros { get; set; }
    }

    public class MermaFiltrosDto
    {
        public List<MermaOpcionDto> Materiales { get; set; } = new();
        public List<MermaOpcionDto> Procesos { get; set; } = new();
        public List<MermaOpcionDto> Maquinas { get; set; } = new();
    }

    public class MermaOpcionDto
    {
        public int Id { get; set; }
        public string Nombre { get; set; } = "";
    }
}
