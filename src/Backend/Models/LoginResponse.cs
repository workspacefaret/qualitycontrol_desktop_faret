namespace QualityControlCenter.Models
{
    public class LoginResponse
    {
        public bool Success { get; set; }

        public string Message { get; set; } = string.Empty;

        public int? UserId { get; set; }

        public string CodigoUsuario { get; set; } = string.Empty;

        public string NombreCompleto { get; set; } = string.Empty;

        public string Rol { get; set; } = string.Empty;

        // Política de contraseñas (API INNPACK, 15-10-2026): true = el frontend debe mostrar la
        // pantalla "cambiar-password" antes de cargar cualquier módulo. DiasParaVencer <= 7 = aviso.
        public bool DebeCambiarPassword { get; set; }

        public string? MotivoCambioPassword { get; set; }

        public int? DiasParaVencer { get; set; }

        public DateTime? PasswordVenceEl { get; set; }
    }
}
