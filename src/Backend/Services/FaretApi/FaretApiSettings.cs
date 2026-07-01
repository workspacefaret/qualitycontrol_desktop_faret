using System;
using System.IO;
using System.Text.Json;

namespace QualityControlCenter.Backend.Services.FaretApi
{
    public class FaretApiSettings
    {
        public string BaseUrl { get; set; } = "";
        public bool UseApi { get; set; } = false;
        public string AppKey { get; set; } = "";

        public static FaretApiSettings Load(string sectionName = "QualityControlFaretApi")
        {
            try
            {
                var configPath = Path.Combine(AppContext.BaseDirectory, "config.json");
                if (!File.Exists(configPath))
                    return new FaretApiSettings();

                var json = File.ReadAllText(configPath);
                using var doc = JsonDocument.Parse(json);

                if (!doc.RootElement.TryGetProperty(sectionName, out var section))
                    return new FaretApiSettings();

                return new FaretApiSettings
                {
                    BaseUrl = section.TryGetProperty("BaseUrl", out var b)
                        ? b.GetString() ?? ""
                        : "",
                    UseApi = section.TryGetProperty("UseApi", out var u) && u.GetBoolean(),
                    AppKey = section.TryGetProperty("AppKey", out var k) ? k.GetString() ?? "" : "",
                };
            }
            catch
            {
                return new FaretApiSettings();
            }
        }
    }
}
