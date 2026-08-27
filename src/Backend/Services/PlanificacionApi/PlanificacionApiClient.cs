using System;
using System.Net.Http;
using System.Threading.Tasks;

namespace QualityControlCenter.Backend.Services.PlanificacionApi
{
    // Cliente HTTP mínimo para la API de Programa de Producción: solo GET, sin autenticación
    // (confirmado real). Mismo patrón que FpsApiClient, sin el header x-api-key.
    public class PlanificacionApiClient
    {
        private readonly HttpClient _http;
        private readonly PlanificacionApiSettings _settings;

        public PlanificacionApiClient(PlanificacionApiSettings settings)
        {
            _settings = settings;
            _http = new HttpClient { Timeout = TimeSpan.FromSeconds(20) };
        }

        public bool IsConfigured => _settings.UseApi && !string.IsNullOrEmpty(_settings.BaseUrl);

        public async Task<(bool ok, string body)> GetAsync(string path)
        {
            var url = BuildUrl(path);
            try
            {
                var response = await _http.GetAsync(url);
                var body = await response.Content.ReadAsStringAsync();
                var status = (int)response.StatusCode;

                Console.WriteLine($"[PlanificacionApi] GET {url} → {status}");

                if (!response.IsSuccessStatusCode)
                {
                    return (
                        false,
                        string.IsNullOrWhiteSpace(body)
                            ? Err($"HTTP {status}: {response.ReasonPhrase}")
                            : body
                    );
                }

                return (true, body);
            }
            catch (TaskCanceledException)
            {
                Console.WriteLine($"[PlanificacionApi] GET {url} → TIMEOUT");
                return (false, Err("Timeout al conectar con Planificación FARET"));
            }
            catch (HttpRequestException ex)
            {
                Console.WriteLine($"[PlanificacionApi] GET {url} → RED: {ex.Message}");
                return (false, Err($"Error de red: {ex.Message}"));
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[PlanificacionApi] GET {url} → ERROR: {ex.Message}");
                return (false, Err($"Error inesperado: {ex.Message}"));
            }
        }

        private string BuildUrl(string path)
        {
            var base_ = _settings.BaseUrl.TrimEnd('/');
            var p = path.TrimStart('/');
            return $"{base_}/{p}";
        }

        private static string Err(string msg) =>
            System.Text.Json.JsonSerializer.Serialize(new { ok = false, message = msg });
    }
}
