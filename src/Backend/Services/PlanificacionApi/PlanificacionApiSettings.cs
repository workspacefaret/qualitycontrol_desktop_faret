using System;
using System.IO;
using System.Text.Json;

namespace QualityControlCenter.Backend.Services.PlanificacionApi
{
    // Config de la API "Programa de Producción" (repo aparte "programa-produccion", .NET 8 +
    // Dapper contra SQL Server FPS_PRODUCCION). Es el backend real de planificacion.faret.cl.
    // Sin autenticación (confirmado con GET real contra producción) — por eso no tiene ApiKey,
    // a diferencia de FpsApiSettings/FaretApiSettings.
    public class PlanificacionApiSettings
    {
        public string BaseUrl { get; set; } = "";
        public bool UseApi { get; set; } = false;

        public static PlanificacionApiSettings Load()
        {
            try
            {
                var configPath = Path.Combine(AppContext.BaseDirectory, "config.json");
                if (!File.Exists(configPath))
                    return new PlanificacionApiSettings();

                var json = File.ReadAllText(configPath);
                using var doc = JsonDocument.Parse(json);

                if (!doc.RootElement.TryGetProperty("PlanificacionApi", out var section))
                    return new PlanificacionApiSettings();

                return new PlanificacionApiSettings
                {
                    BaseUrl = section.TryGetProperty("BaseUrl", out var b)
                        ? b.GetString() ?? ""
                        : "",
                    UseApi = section.TryGetProperty("UseApi", out var u) && u.GetBoolean(),
                };
            }
            catch
            {
                return new PlanificacionApiSettings();
            }
        }
    }
}
