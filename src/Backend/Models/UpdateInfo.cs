namespace QualityControlCenter.Backend.Models
{
    public class UpdateInfo
    {
        public string Version { get; set; } = "";
        public string Installer { get; set; } = "";
        public bool Mandatory { get; set; } = false;
        public string Notes { get; set; } = "";
    }
}
