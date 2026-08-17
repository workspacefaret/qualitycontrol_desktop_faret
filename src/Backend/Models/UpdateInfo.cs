namespace QualityControlCenter.Backend.Models
{
    public class UpdateInfo
    {
        public string Version { get; set; } = "";

        // Etapa 6: SOLO nombre de archivo (ej. "QualityControlCenter_Setup_v1.9.0.exe"), nunca
        // una ruta — UpdateService.EsNombreArchivoSeguro lo valida antes de combinarlo con
        // UpdateSettings.UpdatesShareRoot (la única raíz UNC conocida).
        public string Installer { get; set; } = "";

        // Etapa 6: obligatorio para poder validar la integridad del instalador antes de
        // prepararlo en Pending. Sin este campo, PrepararActualizacionPendiente rechaza la
        // actualización.
        public string Sha256 { get; set; } = "";

        public bool Mandatory { get; set; } = false;
        public string Notes { get; set; } = "";
    }
}
