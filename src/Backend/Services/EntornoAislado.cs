using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;

namespace QualityControlCenter.Services
{
    // Modo de pruebas (variable QCC_AISLADO=1 + QCC_CONFIG=<ruta>): usa una configuración aparte y no arranca si algún
    // destino no es local. Sin esas variables el comportamiento es el de siempre (config.json junto al ejecutable).
    public static class EntornoAislado
    {
        public static bool Activo => Environment.GetEnvironmentVariable("QCC_AISLADO") == "1";

        public static string RutaConfig =>
            Activo ? Environment.GetEnvironmentVariable("QCC_CONFIG") ?? "" : Path.Combine(AppContext.BaseDirectory, "config.json");

        public static void Validar()
        {
            if (!Activo) return;
            if (!File.Exists(RutaConfig))
                throw new InvalidOperationException("Entorno aislado: QCC_CONFIG no apunta a un archivo existente.");
            using var doc = JsonDocument.Parse(File.ReadAllText(RutaConfig));
            var problemas = Problemas(doc.RootElement);
            if (problemas.Count > 0)
                throw new InvalidOperationException("Entorno aislado rechazado (destinos no locales): " + string.Join(", ", problemas));
        }

        // Toda URL, host o ruta de red del archivo debe ser local o estar vacía. Solo informa el nombre de la clave.
        public static List<string> Problemas(JsonElement raiz)
        {
            var problemas = new List<string>();
            Revisar(raiz, "", problemas);
            return problemas;
        }

        private static void Revisar(JsonElement e, string ruta, List<string> problemas)
        {
            if (e.ValueKind == JsonValueKind.Object)
                foreach (var p in e.EnumerateObject()) Revisar(p.Value, ruta.Length == 0 ? p.Name : ruta + ":" + p.Name, problemas);
            else if (e.ValueKind == JsonValueKind.Array)
                foreach (var v in e.EnumerateArray()) Revisar(v, ruta, problemas);
            else if (e.ValueKind == JsonValueKind.String)
            {
                var valor = e.GetString()!.Trim();
                if (valor.Length == 0) return;
                var nombre = ruta[(ruta.LastIndexOf(':') + 1)..];
                var esUrl = valor.Contains("://");
                var esHost = nombre.EndsWith("Host", StringComparison.OrdinalIgnoreCase) || nombre.EndsWith("Server", StringComparison.OrdinalIgnoreCase);
                if (valor.StartsWith(@"\\")
                    || (esUrl && !(Uri.TryCreate(valor, UriKind.Absolute, out var u) && u.IsLoopback && !u.IsUnc))
                    || (esHost && !esUrl && valor is not ("127.0.0.1" or "localhost" or "::1")))
                    problemas.Add(ruta);
            }
        }
    }
}
