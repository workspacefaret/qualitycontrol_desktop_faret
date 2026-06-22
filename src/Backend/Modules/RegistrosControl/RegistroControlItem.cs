namespace QualityControlCenter.Modules.RegistrosControl
{
    public class RegistroControlItem
    {
        public int Id { get; set; }

        public int UsuarioId { get; set; }
        public string Usuario { get; set; } = "";

        public int ProcesoId { get; set; }
        public string Proceso { get; set; } = "";

        public int MaquinaId { get; set; }
        public string Maquina { get; set; } = "";

        public int? FormularioId { get; set; }
        public string Formulario { get; set; } = "";

        public string Np { get; set; } = "";
        public string Turno { get; set; } = "";

        public int EstadoId { get; set; }
        public string Estado { get; set; } = "";

        public string EstadoValidacion { get; set; } = "PENDIENTE";
        public string FechaValidacion { get; set; } = "";
        public string UsuarioValidacion { get; set; } = "";

        public string ImagenUrl { get; set; } = "";

        public string Observacion { get; set; } = "";

        public string FechaRegistro { get; set; } = "";
        public string HoraRegistro { get; set; } = "";
        public string CreadoEn { get; set; } = "";
    }
}
