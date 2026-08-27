using System;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;

namespace QualityControlCenter.Backend.Services.InnpackApi
{
    // Cliente HTTP hacia QualityControlInnpack.Api — mismo patrón exacto que FaretApiClient
    // (mismos métodos, mismo manejo de errores/timeout/401), para que migrar cada módulo INNPACK
    // sea consistente con cómo ya funciona Faret. Ver contex.md sobre la migración de INNPACK a
    // arquitectura API.
    public class InnpackApiClient
    {
        private readonly HttpClient _http;
        private readonly InnpackApiSettings _settings;
        private string? _token;

        private static readonly JsonSerializerOptions _jsonOpts = new()
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            PropertyNameCaseInsensitive = true,
        };

        public InnpackApiClient(InnpackApiSettings settings)
        {
            _settings = settings;
            _http = new HttpClient { Timeout = TimeSpan.FromSeconds(30) };
        }

        public bool IsConfigured => _settings.UseApi && !string.IsNullOrEmpty(_settings.BaseUrl);
        public bool HasToken => !string.IsNullOrEmpty(_token);

        public void SetToken(string token)
        {
            _token = token;
            _http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        }

        public void ClearToken()
        {
            _token = null;
            _http.DefaultRequestHeaders.Authorization = null;
        }

        public async Task<(bool ok, string body)> GetAsync(string path)
        {
            var url = BuildUrl(path);
            Console.WriteLine($"[InnpackApi] GET  {url}");
            try
            {
                var response = await _http.GetAsync(url);
                var body = await response.Content.ReadAsStringAsync();
                var status = (int)response.StatusCode;
                Console.WriteLine($"[InnpackApi] GET  {url} → {status}");

                if (response.StatusCode == System.Net.HttpStatusCode.Unauthorized)
                {
                    ClearToken();
                    return (false, string.IsNullOrWhiteSpace(body) ? Err("Token expirado o no autorizado") : body);
                }

                if (!response.IsSuccessStatusCode)
                    return (false, string.IsNullOrWhiteSpace(body) ? Err($"HTTP {status}: {response.ReasonPhrase}") : body);

                return (true, body);
            }
            catch (TaskCanceledException)
            {
                return (false, Err("Timeout al conectar con la API Innpack"));
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

        public Task<(bool ok, string body)> PostJsonAsync(string path, object payload) =>
            SendJsonAsync(HttpMethod.Post, path, payload);

        public Task<(bool ok, string body)> PutJsonAsync(string path, object payload) =>
            SendJsonAsync(HttpMethod.Put, path, payload);

        public Task<(bool ok, string body)> PatchJsonAsync(string path, object payload) =>
            SendJsonAsync(new HttpMethod("PATCH"), path, payload);

        private async Task<(bool ok, string body)> SendJsonAsync(HttpMethod method, string path, object payload)
        {
            var url = BuildUrl(path);
            Console.WriteLine($"[InnpackApi] {method} {url}");
            try
            {
                var json = JsonSerializer.Serialize(payload, _jsonOpts);
                var content = new StringContent(json, Encoding.UTF8, "application/json");
                var request = new HttpRequestMessage(method, url) { Content = content };

                var response = await _http.SendAsync(request);
                var body = await response.Content.ReadAsStringAsync();
                var status = (int)response.StatusCode;
                Console.WriteLine($"[InnpackApi] {method} {url} → {status}");

                if (response.StatusCode == System.Net.HttpStatusCode.Unauthorized)
                {
                    ClearToken();
                    return (false, string.IsNullOrWhiteSpace(body) ? Err("No autorizado") : body);
                }

                if (!response.IsSuccessStatusCode)
                    return (false, string.IsNullOrWhiteSpace(body) ? Err($"HTTP {status}: {response.ReasonPhrase}") : body);

                return (true, body);
            }
            catch (TaskCanceledException)
            {
                return (false, Err("Timeout al conectar con la API Innpack"));
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

        public async Task<(bool ok, string body)> DeleteAsync(string path)
        {
            var url = BuildUrl(path);
            Console.WriteLine($"[InnpackApi] DELETE {url}");
            try
            {
                var response = await _http.DeleteAsync(url);
                var body = await response.Content.ReadAsStringAsync();
                var status = (int)response.StatusCode;
                Console.WriteLine($"[InnpackApi] DELETE {url} → {status}");

                if (response.StatusCode == System.Net.HttpStatusCode.Unauthorized)
                {
                    ClearToken();
                    return (false, string.IsNullOrWhiteSpace(body) ? Err("No autorizado") : body);
                }

                if (!response.IsSuccessStatusCode)
                    return (false, string.IsNullOrWhiteSpace(body) ? Err($"HTTP {status}: {response.ReasonPhrase}") : body);

                return (true, body);
            }
            catch (TaskCanceledException)
            {
                return (false, Err("Timeout al conectar con la API Innpack"));
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

        private static string Err(string msg) => JsonSerializer.Serialize(new { success = false, message = msg });
    }
}
