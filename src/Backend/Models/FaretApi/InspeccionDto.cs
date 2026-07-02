using System;

namespace QualityControlCenter.Backend.Models.FaretApi
{
    public class InspeccionDto
    {
        public int Id { get; set; }
        public DateTime Fecha { get; set; }
        public string? Inspector { get; set; }
        public string? Cliente { get; set; }
        public string? Nv { get; set; }
        public string? Proceso { get; set; }
        public string? Area { get; set; }
        public string? Maquina { get; set; }
        public string? Resultado { get; set; }
        public string? Estado { get; set; }
        public int? CantidadDefectos { get; set; }
    }
}
