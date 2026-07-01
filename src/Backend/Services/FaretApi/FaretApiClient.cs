using System;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;

namespace QualityControlCenter.Backend.Services.FaretApi
{
    public class FaretApiClient
    {
        private readonly HttpClient _http;
        private readonly FaretApiSettings _settings;
        private string? _token;

        private static readonly JsonSerializerOptions _jsonOpts = new()
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            PropertyNameCaseInsensitive = true,
        };

        public FaretApiClient(FaretApiSettings settings)
        {
            _settings = settings;
            _http = new HttpClient { Timeout = TimeSpan.FromSeconds(30) };
        }

        public bool IsConfigured => _settings.UseApi && !string.IsNullOrEmpty(_settings.BaseUrl);
        public bool HasToken => !string.IsNullOrEmpty(_token);

        public void SetToken(string token)
        {
            _token = token;
            _http.DefaultRequestHeaders.Authorization =
                new AuthenticationHeaderValue("Bearer", token);
        }

        public void ClearToken()
        {
            _token = null;
            _http.DefaultRequestHeaders.Authorization = null;
        }

        public async Task<(bool ok, string body)> GetAsync(string path)
        {
            var url = BuildUrl(path);
            Console.WriteLine($"[FaretApi] GET  {url}");
            try
            {
                var response = await _http.GetAsync(url);
                var body = await response.Content.ReadAsStringAsync();
                var status = (int)response.StatusCode;

                Console.WriteLine($"[FaretApi] GET  {url} → {status}");

                if (response.StatusCode == System.Net.HttpStatusCode.Unauthorized)
                {
                    ClearToken();
                    return (false, Err("Token expirado o no autorizado"));
                }

                if (!response.IsSuccessStatusCode)
                {
                    Console.WriteLine($"[FaretApi] BODY {body[..Math.Min(200, body.Length)]}");
                    return (false, Err($"HTTP {status}: {response.ReasonPhrase}"));
                }

                return (true, body);
            }
            catch (TaskCanceledException)
            {
                Console.WriteLine($"[FaretApi] GET  {url} → TIMEOUT");
                return (false, Err("Timeout al conectar con la API Faret"));
            }
            catch (HttpRequestException ex)
            {
                Console.WriteLine($"[FaretApi] GET  {url} → RED: {ex.Message}");
                return (false, Err($"Error de red: {ex.Message}"));
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[FaretApi] GET  {url} → ERROR: {ex.Message}");
                return (false, Err($"Error inesperado: {ex.Message}"));
            }
        }

        public async Task<(bool ok, string body)> PostJsonAsync(string path, object payload)
        {
            var url = BuildUrl(path);
            Console.WriteLine($"[FaretApi] POST {url}");
            try
            {
                var json = JsonSerializer.Serialize(payload, _jsonOpts);
                var content = new StringContent(json, Encoding.UTF8, "application/json");

                var response = await _http.PostAsync(url, content);
                var body = await response.Content.ReadAsStringAsync();
                var status = (int)response.StatusCode;

                Console.WriteLine($"[FaretApi] POST {url} → {status}");

                if (response.StatusCode == System.Net.HttpStatusCode.Unauthorized)
                {
                    ClearToken();
                    Console.WriteLine($"[FaretApi] BODY {body[..Math.Min(200, body.Length)]}");
                    return (false, string.IsNullOrWhiteSpace(body) ? Err("No autorizado") : body);
                }

                if (!response.IsSuccessStatusCode)
                {
                    Console.WriteLine($"[FaretApi] BODY {body[..Math.Min(200, body.Length)]}");
                    return (false, string.IsNullOrWhiteSpace(body) ? Err($"HTTP {status}: {response.ReasonPhrase}") : body);
                }

                return (true, body);
            }
            catch (TaskCanceledException)
            {
                Console.WriteLine($"[FaretApi] POST {url} → TIMEOUT");
                return (false, Err("Timeout al conectar con la API Faret"));
            }
            catch (HttpRequestException ex)
            {
                Console.WriteLine($"[FaretApi] POST {url} → RED: {ex.Message}");
                return (false, Err($"Error de red: {ex.Message}"));
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[FaretApi] POST {url} → ERROR: {ex.Message}");
                return (false, Err($"Error inesperado: {ex.Message}"));
            }
        }

        public async Task<(bool ok, string body)> PostMultipartFileAsync(
            string path,
            string fieldName,
            string fileName,
            byte[] fileBytes
        )
        {
            var url = BuildUrl(path);
            Console.WriteLine($"[FaretApi] POST {url} (multipart: {fileName}, {fileBytes.Length} bytes)");
            try
            {
                using var content = new MultipartFormDataContent();
                var fileContent = new ByteArrayContent(fileBytes);
                fileContent.Headers.ContentType = new MediaTypeHeaderValue(
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                );
                content.Add(fileContent, fieldName, fileName);

                var response = await _http.PostAsync(url, content);
                var body = await response.Content.ReadAsStringAsync();
                var status = (int)response.StatusCode;

                Console.WriteLine($"[FaretApi] POST {url} → {status}");

                if (response.StatusCode == System.Net.HttpStatusCode.Unauthorized)
                {
                    ClearToken();
                    Console.WriteLine($"[FaretApi] BODY {body[..Math.Min(200, body.Length)]}");
                    return (false, string.IsNullOrWhiteSpace(body) ? Err("No autorizado") : body);
                }

                if (!response.IsSuccessStatusCode)
                {
                    Console.WriteLine($"[FaretApi] BODY {body[..Math.Min(200, body.Length)]}");
                    return (
                        false,
                        string.IsNullOrWhiteSpace(body) ? Err($"HTTP {status}: {response.ReasonPhrase}") : body
                    );
                }

                return (true, body);
            }
            catch (TaskCanceledException)
            {
                Console.WriteLine($"[FaretApi] POST {url} → TIMEOUT");
                return (false, Err("Timeout al conectar con la API Faret"));
            }
            catch (HttpRequestException ex)
            {
                Console.WriteLine($"[FaretApi] POST {url} → RED: {ex.Message}");
                return (false, Err($"Error de red: {ex.Message}"));
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[FaretApi] POST {url} → ERROR: {ex.Message}");
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
            JsonSerializer.Serialize(new { ok = false, error = msg });
    }
}
