using System;
using System.IO;
using System.Text.Json;

namespace QualityControlCenter.Backend.Services.SapRecepcionApi
{
    // Config de apisapfaret (repo "apisapfaret", Service Layer SAP B1). Sin autenticacion (mismo
    // criterio ya confirmado para el resto de las integraciones internas Faret sin JWT).
    public class SapRecepcionApiSettings
    {
        public string BaseUrl { get; set; } = "";
        public bool UseApi { get; set; } = false;

        public static SapRecepcionApiSettings Load()
        {
            try
            {
                var configPath = Path.Combine(AppContext.BaseDirectory, "config.json");
                if (!File.Exists(configPath))
                    return new SapRecepcionApiSettings();

                var json = File.ReadAllText(configPath);
                using var doc = JsonDocument.Parse(json);

                if (!doc.RootElement.TryGetProperty("SapRecepcionApi", out var section))
                    return new SapRecepcionApiSettings();

                return new SapRecepcionApiSettings
                {
                    BaseUrl = section.TryGetProperty("BaseUrl", out var b) ? b.GetString() ?? "" : "",
                    UseApi = section.TryGetProperty("UseApi", out var u) && u.GetBoolean(),
                };
            }
            catch
            {
                return new SapRecepcionApiSettings();
            }
        }
    }
}
