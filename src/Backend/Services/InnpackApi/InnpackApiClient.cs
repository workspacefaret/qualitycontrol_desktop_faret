using System;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Threading;
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
        private readonly InnpackApiServiceAccountSettings _serviceAccount;
        private readonly SemaphoreSlim _serviceLoginLock = new(1, 1);
        private string? _token;

        // true solo cuando el token activo vino de un login INNPACK interactivo real
        // (AuthService.LoginAsync → SetToken). Una sesión Faret pura nunca llama a auth.login, así
        // que esto queda false toda la sesión y EnsureAuthenticatedAsync cubre el hueco con la
        // cuenta de servicio — sin esto, cualquier acción de un módulo híbrido (Recepción Calidad,
        // Producto Terminado) llamada desde Faret fallaría con 401 apenas se empaquete el próximo
        // instalador (antes de la migración a API, esos módulos usaban DbService directo, sin
        // auth). Si un token interactivo real expira (401), NO se hace fallback silencioso a la
        // cuenta de servicio — se preserva el comportamiento actual (falla visible) para no ocultar
        // una sesión INNPACK vencida detrás de una identidad genérica.
        private bool _hasInteractiveToken;

        private static readonly JsonSerializerOptions _jsonOpts = new()
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            PropertyNameCaseInsensitive = true,
        };

        public InnpackApiClient(InnpackApiSettings settings)
            : this(settings, InnpackApiServiceAccountSettings.Load()) { }

        public InnpackApiClient(InnpackApiSettings settings, InnpackApiServiceAccountSettings serviceAccount)
        {
            _settings = settings;
            _serviceAccount = serviceAccount;
            _http = new HttpClient { Timeout = TimeSpan.FromSeconds(30) };
        }

        public bool IsConfigured => _settings.UseApi && !string.IsNullOrEmpty(_settings.BaseUrl);
        public bool HasToken => !string.IsNullOrEmpty(_token);

        public void SetToken(string token)
        {
            _token = token;
            _hasInteractiveToken = true;
            _http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        }

        public void ClearToken()
        {
            _token = null;
            _http.DefaultRequestHeaders.Authorization = null;
        }

        // Autologin con la cuenta de servicio (config.json → InnpackApiServiceAccount) — solo se
        // dispara cuando no hay ningún token activo y la sesión nunca hizo login INNPACK
        // interactivo. Construye la request a mano (no via SendJsonAsync) para no recursar contra
        // sí misma. Falla en silencio (deja _token en null) si la cuenta de servicio no está
        // configurada o el login falla — el llamador recibe el mismo 401/error que ya manejaba.
        private async Task EnsureAuthenticatedAsync(string requestPath)
        {
            // El propio login INNPACK interactivo (AuthService.LoginAsync → POST api/auth/login)
            // no debe disparar esto: dispararía un autologin de servicio innecesario justo antes
            // de que SetToken lo pise con el token real. Se detecta por path, no por un flag
            // aparte, para no tener que tocar AuthService.
            if (IsLoginPath(requestPath))
                return;

            if (!string.IsNullOrEmpty(_token) || _hasInteractiveToken || !_serviceAccount.IsConfigured)
                return;

            await _serviceLoginLock.WaitAsync();
            try
            {
                if (!string.IsNullOrEmpty(_token) || _hasInteractiveToken)
                    return;

                var url = BuildUrl("api/auth/login");
                var payload = new { codigoUsuario = _serviceAccount.CodigoUsuario, password = _serviceAccount.Password };
                var json = JsonSerializer.Serialize(payload, _jsonOpts);
                var content = new StringContent(json, Encoding.UTF8, "application/json");

                var response = await _http.PostAsync(url, content);
                if (!response.IsSuccessStatusCode)
                {
                    Console.WriteLine($"[InnpackApi] Autologin de cuenta de servicio falló: {(int)response.StatusCode}");
                    return;
                }

                var body = await response.Content.ReadAsStringAsync();
                using var doc = JsonDocument.Parse(body);
                if (
                    doc.RootElement.TryGetProperty("data", out var data)
                    && data.TryGetProperty("token", out var tokenEl)
                    && tokenEl.ValueKind == JsonValueKind.String
                )
                {
                    var token = tokenEl.GetString();
                    if (!string.IsNullOrEmpty(token))
                    {
                        _token = token;
                        _http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
                        Console.WriteLine("[InnpackApi] Autologin de cuenta de servicio OK (sesión sin login INNPACK interactivo)");
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[InnpackApi] Autologin de cuenta de servicio con excepción: {ex.Message}");
            }
            finally
            {
                _serviceLoginLock.Release();
            }
        }

        public async Task<(bool ok, string body)> GetAsync(string path)
        {
            await EnsureAuthenticatedAsync(path);

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
            Discard(SendJsonAsync(HttpMethod.Post, path, payload));

        public Task<(bool ok, string body)> PutJsonAsync(string path, object payload) =>
            Discard(SendJsonAsync(HttpMethod.Put, path, payload));

        public Task<(bool ok, string body)> PatchJsonAsync(string path, object payload) =>
            Discard(SendJsonAsync(new HttpMethod("PATCH"), path, payload));

        // Variantes que exponen el status HTTP real — necesario cuando el llamador necesita
        // distinguir 409 (conflicto de concurrencia) / 404 (no encontrado) de un error genérico,
        // algo que (bool ok, string body) no puede expresar. Usado por TalleresExternos (Paso 8).
        public Task<(int status, string body)> PostJsonWithStatusAsync(string path, object payload) =>
            SendJsonAsync(HttpMethod.Post, path, payload);

        public Task<(int status, string body)> PutJsonWithStatusAsync(string path, object payload) =>
            SendJsonAsync(HttpMethod.Put, path, payload);

        private static async Task<(bool ok, string body)> Discard(Task<(int status, string body)> call)
        {
            var (status, body) = await call;
            return (status >= 200 && status < 300, body);
        }

        private async Task<(int status, string body)> SendJsonAsync(HttpMethod method, string path, object payload)
        {
            await EnsureAuthenticatedAsync(path);

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
                    return (status, string.IsNullOrWhiteSpace(body) ? Err("No autorizado") : body);
                }

                if (!response.IsSuccessStatusCode)
                    return (status, string.IsNullOrWhiteSpace(body) ? Err($"HTTP {status}: {response.ReasonPhrase}") : body);

                return (status, body);
            }
            catch (TaskCanceledException)
            {
                return (0, Err("Timeout al conectar con la API Innpack"));
            }
            catch (HttpRequestException ex)
            {
                return (0, Err($"Error de red: {ex.Message}"));
            }
            catch (Exception ex)
            {
                return (0, Err($"Error inesperado: {ex.Message}"));
            }
        }

        public Task<(bool ok, string body)> DeleteAsync(string path) => Discard(DeleteWithStatusAsync(path));

        public async Task<(int status, string body)> DeleteWithStatusAsync(string path)
        {
            await EnsureAuthenticatedAsync(path);

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
                    return (status, string.IsNullOrWhiteSpace(body) ? Err("No autorizado") : body);
                }

                if (!response.IsSuccessStatusCode)
                    return (status, string.IsNullOrWhiteSpace(body) ? Err($"HTTP {status}: {response.ReasonPhrase}") : body);

                return (status, body);
            }
            catch (TaskCanceledException)
            {
                return (0, Err("Timeout al conectar con la API Innpack"));
            }
            catch (HttpRequestException ex)
            {
                return (0, Err($"Error de red: {ex.Message}"));
            }
            catch (Exception ex)
            {
                return (0, Err($"Error inesperado: {ex.Message}"));
            }
        }

        private string BuildUrl(string path)
        {
            var base_ = _settings.BaseUrl.TrimEnd('/');
            var p = path.TrimStart('/');
            return $"{base_}/{p}";
        }

        private static bool IsLoginPath(string path) => path.TrimStart('/').Equals("api/auth/login", StringComparison.OrdinalIgnoreCase);

        private static string Err(string msg) => JsonSerializer.Serialize(new { success = false, message = msg });
    }
}
