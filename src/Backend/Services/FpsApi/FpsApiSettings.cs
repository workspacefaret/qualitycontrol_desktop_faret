using System;
using System.IO;
using System.Text.Json;

namespace QualityControlCenter.Backend.Services.FpsApi
{
    // Config de la API fps-api (repo aparte "fps-api", Node/Express contra SQL Server
    // FPS_PRODUCCION). Distinta de FaretApiSettings/FaretApiClient: fps-api no es una de las 3
    // APIs de negocio Faret (qualitycontrol/mejora-continua/calidad), es la integración con
    // FPS/SAP — mismo criterio ya usado en el proyecto de "cuarta API con otro base path → nueva
    // sección de config + nuevo cliente" en vez de forzarla dentro de FaretApiClient.
    public class FpsApiSettings
    {
        public string BaseUrl { get; set; } = "";
        public bool UseApi { get; set; } = false;
        public string ApiKey { get; set; } = "";

        public static FpsApiSettings Load()
        {
            try
            {
                var configPath = Path.Combine(AppContext.BaseDirectory, "config.json");
                if (!File.Exists(configPath))
                    return new FpsApiSettings();

                var json = File.ReadAllText(configPath);
                using var doc = JsonDocument.Parse(json);

                if (!doc.RootElement.TryGetProperty("FpsApi", out var section))
                    return new FpsApiSettings();

                return new FpsApiSettings
                {
                    BaseUrl = section.TryGetProperty("BaseUrl", out var b)
                        ? b.GetString() ?? ""
                        : "",
                    UseApi = section.TryGetProperty("UseApi", out var u) && u.GetBoolean(),
                    ApiKey = section.TryGetProperty("ApiKey", out var k) ? k.GetString() ?? "" : "",
                };
            }
            catch
            {
                return new FpsApiSettings();
            }
        }
    }
}
