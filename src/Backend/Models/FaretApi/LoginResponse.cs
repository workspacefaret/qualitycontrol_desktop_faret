namespace QualityControlCenter.Backend.Models.FaretApi
{
    public class LoginResponse
    {
        public string Token { get; set; } = "";
        public string Username { get; set; } = "";
        public string Role { get; set; } = "";

        // Política de contraseñas (API qualitycontrol Faret, 15-10-2026).
        public bool DebeCambiarPassword { get; set; }
        public string? MotivoCambioPassword { get; set; }
        public int? DiasParaVencer { get; set; }
        public string? PasswordVenceEl { get; set; }
    }
}
