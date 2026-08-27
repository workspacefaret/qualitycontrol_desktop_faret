using System;
using System.Net.Http;
using System.Threading.Tasks;

namespace QualityControlCenter.Backend.Services.SapRecepcionApi
{
    // Cliente GET-only para apisapfaret (api/recepcion/*). Mismo patron minimo que
    // PlanificacionApiClient/FpsApiClient.
    public class SapRecepcionApiClient
    {
        private readonly HttpClient _http;
        private readonly SapRecepcionApiSettings _settings;

        public SapRecepcionApiClient(SapRecepcionApiSettings settings)
        {
            _settings = settings;
            _http = new HttpClient { Timeout = TimeSpan.FromSeconds(25) };
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

                Console.WriteLine($"[SapRecepcionApi] GET {url} → {status}");

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
                return (false, Err("Timeout al conectar con SAP (apisapfaret)"));
            }
            catch (HttpRequestException ex)
            {
                return (false, Err($"Error de red: {ex.Message}"));
            }
            catch (Exception ex)
            {
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
