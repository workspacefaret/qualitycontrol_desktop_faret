using System;
using System.IO;
using System.Text.Json;

namespace QualityControlCenter.Backend.Services.InnpackApi
{
    // Credenciales de la cuenta de servicio permanente (usuarios.codigo_usuario =
    // "SERVICIO_FARET_HIBRIDO", rol "operador", sin privilegios de admin) usada por
    // InnpackApiClient para autenticarse automáticamente cuando la sesión activa es Faret (nunca
    // hace login INNPACK interactivo) y necesita llamar acciones de módulos híbridos
    // (Recepción Calidad, Producto Terminado). Ver InnpackApiClient.EnsureAuthenticatedAsync y
    // contex.md sobre la migración de INNPACK a arquitectura API.
    public class InnpackApiServiceAccountSettings
    {
        public string CodigoUsuario { get; set; } = "";
        public string Password { get; set; } = "";

        public bool IsConfigured => !string.IsNullOrEmpty(CodigoUsuario) && !string.IsNullOrEmpty(Password);

        public static InnpackApiServiceAccountSettings Load()
        {
            try
            {
                var configPath = Path.Combine(AppContext.BaseDirectory, "config.json");
                if (!File.Exists(configPath))
                    return new InnpackApiServiceAccountSettings();

                var json = File.ReadAllText(configPath);
                using var doc = JsonDocument.Parse(json);

                if (!doc.RootElement.TryGetProperty("InnpackApiServiceAccount", out var section))
                    return new InnpackApiServiceAccountSettings();

                return new InnpackApiServiceAccountSettings
                {
                    CodigoUsuario = section.TryGetProperty("CodigoUsuario", out var c) ? c.GetString() ?? "" : "",
                    Password = section.TryGetProperty("Password", out var p) ? p.GetString() ?? "" : "",
                };
            }
            catch
            {
                return new InnpackApiServiceAccountSettings();
            }
        }
    }
}
