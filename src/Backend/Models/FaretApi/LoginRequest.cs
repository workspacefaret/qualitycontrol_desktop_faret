namespace QualityControlCenter.Backend.Models.FaretApi
{
    public class LoginRequest
    {
        public string Identificador { get; set; } = "";
        public string Password { get; set; } = "";

        // Desktop >= 1.8.21 sabe mostrar el cambio de clave: la API puede exigirlo.
        public bool SoportaCambioPassword { get; set; } = true;
    }
}
