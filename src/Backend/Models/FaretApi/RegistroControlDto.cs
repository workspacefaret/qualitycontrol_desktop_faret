using System;

namespace QualityControlCenter.Backend.Models.FaretApi
{
    public class RegistroControlDto
    {
        public int Id { get; set; }
        public DateTime Fecha { get; set; }
        public string? Area { get; set; }
        public string? Maquina { get; set; }
        public string? Inspector { get; set; }
        public string? Operador { get; set; }
        public string? Estado { get; set; }
        public int? TotalDefectos { get; set; }
    }

    public class RegistroControlDetalleDto : RegistroControlDto
    {
        public string? Observaciones { get; set; }
        public object? Detalles { get; set; }
    }
}
