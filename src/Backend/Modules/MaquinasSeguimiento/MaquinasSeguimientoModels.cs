using System.Collections.Generic;

namespace QualityControlCenter.Modules.MaquinasSeguimiento
{
    public class MaquinasSeguimientoResumenDto
    {
        public int TotalMaquinas { get; set; }
        public int MaquinasConRegistros { get; set; }
        public int RegistrosMaquinaSeleccionada { get; set; }
        public int RechazosMaquinaSeleccionada { get; set; }

        public List<MaquinaSelectorDto> Maquinas { get; set; } = new();
        public List<MaquinaRegistroDto> Registros { get; set; } = new();
    }

    public class MaquinaSelectorDto
    {
        public int Id { get; set; }
        public string Nombre { get; set; } = "";
        public string Proceso { get; set; } = "";
    }

    public class MaquinaRegistroDto
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
    }
}
