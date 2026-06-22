using System;

namespace QualityControlCenter.Models
{
    public class User
    {
        public int Id { get; set; }
        public string CodigoUsuario { get; set; } = "";
        public string NombreCompleto { get; set; } = "";
        public string PasswordHash { get; set; } = "";
        public string Rol { get; set; } = "";
        public bool Activo { get; set; }
        public DateTime? CreadoEn { get; set; }
        public DateTime? ActualizadoEn { get; set; }
    }
}
