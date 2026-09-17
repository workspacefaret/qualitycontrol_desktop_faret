using System;
using System.IO;
using System.Text.Json;

namespace QualityControlCenter.Backend.Services.SapRecepcionApi
{
    // Config de apisapfaret (repo "apisapfaret", Service Layer SAP B1). Autenticada por header
    // x-api-key desde que apifaret agregó API keys por consumidor (mismo patrón que FpsApiClient).
    public class SapRecepcionApiSettings
    {
        public string BaseUrl { get; set; } = "";
        public bool UseApi { get; set; } = false;
        public string ApiKey { get; set; } = "";

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
                    ApiKey = section.TryGetProperty("ApiKey", out var k) ? k.GetString() ?? "" : "",
                };
            }
            catch
            {
                return new SapRecepcionApiSettings();
            }
        }
    }
}
