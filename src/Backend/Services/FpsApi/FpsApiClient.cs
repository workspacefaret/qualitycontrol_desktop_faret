using System;
using System.Net.Http;
using System.Threading.Tasks;

namespace QualityControlCenter.Backend.Services.FpsApi
{
    // Cliente HTTP mínimo para fps-api: solo GET, autenticado por header "x-api-key" (no Bearer/
    // JWT como FaretApiClient) — de ahí que no se reutilice esa clase, el esquema de auth es
    // distinto y fps-api no necesita ninguno de los otros verbos.
    public class FpsApiClient
    {
        private readonly HttpClient _http;
        private readonly FpsApiSettings _settings;

        public FpsApiClient(FpsApiSettings settings)
        {
            _settings = settings;
            _http = new HttpClient { Timeout = TimeSpan.FromSeconds(20) };
            if (!string.IsNullOrEmpty(settings.ApiKey))
                _http.DefaultRequestHeaders.Add("x-api-key", settings.ApiKey);
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

                Console.WriteLine($"[FpsApi] GET {url} → {status}");

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
                Console.WriteLine($"[FpsApi] GET {url} → TIMEOUT");
                return (false, Err("Timeout al conectar con FPS"));
            }
            catch (HttpRequestException ex)
            {
                Console.WriteLine($"[FpsApi] GET {url} → RED: {ex.Message}");
                return (false, Err($"Error de red: {ex.Message}"));
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[FpsApi] GET {url} → ERROR: {ex.Message}");
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
