namespace QualityControlCenter.Models
{
    public class LoginRequest
    {
        public string CodigoUsuario { get; set; } = string.Empty;

        public string Password { get; set; } = string.Empty;
    }
}
