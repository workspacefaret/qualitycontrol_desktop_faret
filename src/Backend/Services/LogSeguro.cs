using System.Text.RegularExpressions;

namespace QualityControlCenter.Services
{
    // Los mensajes del puente se escriben en consola para depurar: contraseñas y tokens nunca van en claro.
    public static class LogSeguro
    {
        private static readonly Regex Sensible = new(
            "(\"[^\"\\\\]*(?:password|contrase|clave|token|secret|apikey)[^\"\\\\]*\"\\s*:\\s*)\"(?:\\\\.|[^\"\\\\])*\"",
            RegexOptions.IgnoreCase | RegexOptions.Compiled
        );

        public static string Ocultar(string texto) => Sensible.Replace(texto, "$1\"***\"");
    }
}
