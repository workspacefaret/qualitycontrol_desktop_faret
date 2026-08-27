using System;
using System.IO;
using System.Text.Json;

namespace QualityControlCenter.Backend.Services.InnpackApi
{
    // Mismo patrón que FaretApiSettings — permite migrar INNPACK a una API propia sin tocar el
    // resto de la arquitectura de configuración ya establecida.
    public class InnpackApiSettings
    {
        public string BaseUrl { get; set; } = "";
        public bool UseApi { get; set; } = false;

        public static InnpackApiSettings Load()
        {
            try
            {
                var configPath = Path.Combine(AppContext.BaseDirectory, "config.json");
                if (!File.Exists(configPath))
                    return new InnpackApiSettings();

                var json = File.ReadAllText(configPath);
                using var doc = JsonDocument.Parse(json);

                if (!doc.RootElement.TryGetProperty("QualityControlInnpackApi", out var section))
                    return new InnpackApiSettings();

                return new InnpackApiSettings
                {
                    BaseUrl = section.TryGetProperty("BaseUrl", out var b) ? b.GetString() ?? "" : "",
                    UseApi = section.TryGetProperty("UseApi", out var u) && u.GetBoolean(),
                };
            }
            catch
            {
                return new InnpackApiSettings();
            }
        }
    }
}
