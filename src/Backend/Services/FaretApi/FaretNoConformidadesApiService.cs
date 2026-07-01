using System;
using System.Text.Json;
using System.Threading.Tasks;

namespace QualityControlCenter.Backend.Services.FaretApi
{
    public class FaretNoConformidadesApiService
    {
        private readonly FaretApiClient _client;

        public FaretNoConformidadesApiService(FaretApiClient client)
        {
            _client = client;
        }

        public Task<(bool ok, string body)> GetListAsync() =>
            _client.GetAsync("api/no-conformidades");

        public Task<(bool ok, string body)> GetByIdAsync(int id) =>
            _client.GetAsync($"api/no-conformidades/{id}");

        public async Task<(bool ok, string body)> CreateAsync(object request)
        {
            LogPayload("POST api/no-conformidades", request);
            var result = await _client.PostJsonAsync("api/no-conformidades", request);
            LogResult("POST api/no-conformidades", result.ok, result.body);
            return result;
        }

        public async Task<(bool ok, string body)> UpdateAsync(int id, object request)
        {
            LogPayload($"PUT api/no-conformidades/{id}", request);
            var result = await _client.PutJsonAsync($"api/no-conformidades/{id}", request);
            LogResult($"PUT api/no-conformidades/{id}", result.ok, result.body);
            return result;
        }

        public Task<(bool ok, string body)> GetAnalisisAsync(int noConformidadId) =>
            _client.GetAsync($"api/no-conformidades/{noConformidadId}/analisis");

        public async Task<(bool ok, string body)> CrearAnalisisAsync(int noConformidadId, object request)
        {
            var path = $"api/no-conformidades/{noConformidadId}/analisis";
            LogPayload($"POST {path}", request);
            var result = await _client.PostJsonAsync(path, request);
            LogResult($"POST {path}", result.ok, result.body);
            return result;
        }

        public async Task<(bool ok, string body)> ActualizarAnalisisAsync(int noConformidadId, object request)
        {
            var path = $"api/no-conformidades/{noConformidadId}/analisis";
            LogPayload($"PUT {path}", request);
            var result = await _client.PutJsonAsync(path, request);
            LogResult($"PUT {path}", result.ok, result.body);
            return result;
        }

        public Task<(bool ok, string body)> GetAccionesAsync(int noConformidadId) =>
            _client.GetAsync($"api/no-conformidades/{noConformidadId}/acciones");

        public async Task<(bool ok, string body)> CrearAccionAsync(int noConformidadId, object request)
        {
            var path = $"api/no-conformidades/{noConformidadId}/acciones";
            LogPayload($"POST {path}", request);
            var result = await _client.PostJsonAsync(path, request);
            LogResult($"POST {path}", result.ok, result.body);
            return result;
        }

        public async Task<(bool ok, string body)> ActualizarAccionAsync(int accionId, object request)
        {
            var path = $"api/acciones-correctivas/{accionId}";
            LogPayload($"PUT {path}", request);
            var result = await _client.PutJsonAsync(path, request);
            LogResult($"PUT {path}", result.ok, result.body);
            return result;
        }

        // Logging temporal de diagnóstico (sin datos sensibles: NC no tiene passwords/tokens).
        // Útil mientras la API de Mejora Continua no valide "origen" y responda 500 en vez de 400.
        private static void LogPayload(string label, object request) =>
            Console.WriteLine($"[FaretNC] {label} payload: {JsonSerializer.Serialize(request)}");

        private static void LogResult(string label, bool ok, string body) =>
            Console.WriteLine($"[FaretNC] {label} → ok={ok} body={body[..Math.Min(300, body.Length)]}");
    }
}
