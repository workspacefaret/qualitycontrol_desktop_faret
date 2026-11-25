using System;
using System.Collections.Generic;
using System.IO;

namespace QualityControlCenter.Services
{
    // Adjuntos que llegan de otros usuarios o de SAP y se abren con la aplicación de Windows: solo tipos de documento o
    // imagen. Un ejecutable o script nunca se abre (ni se escribe en el equipo).
    public static class ArchivosSeguros
    {
        private static readonly HashSet<string> Extensiones = new(StringComparer.OrdinalIgnoreCase)
        {
            ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".odt", ".ods", ".txt", ".csv", ".rtf",
            ".jpg", ".jpeg", ".png", ".gif", ".bmp", ".tif", ".tiff", ".webp",
        };

        public const string MensajeBloqueo =
            "El adjunto no es un documento ni una imagen reconocida y no se abre por seguridad. Revísalo en el sistema de origen.";

        public static bool SePuedeAbrir(string? nombre) =>
            !string.IsNullOrWhiteSpace(nombre) && Extensiones.Contains(Path.GetExtension(nombre.TrimEnd('.', ' ')));
    }
}
