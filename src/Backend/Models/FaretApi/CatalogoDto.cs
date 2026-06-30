namespace QualityControlCenter.Backend.Models.FaretApi
{
    public class CatalogoDto
    {
        public int Id { get; set; }
        public string Nombre { get; set; } = "";
        public string? Codigo { get; set; }
        public bool Activo { get; set; } = true;
    }
}
