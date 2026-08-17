using System.Collections.Generic;
using System.Text.Json;
using System.Threading.Tasks;
using QualityControlCenter.Backend.Models.FaretApi;

namespace QualityControlCenter.Backend.Services.FaretApi
{
    public class FaretCatalogosApiService
    {
        private readonly FaretApiClient _client;

        private static readonly JsonSerializerOptions _jsonOpts = new()
        {
            PropertyNameCaseInsensitive = true,
        };

        public FaretCatalogosApiService(FaretApiClient client)
        {
            _client = client;
        }

        public Task<(bool ok, string body)> GetAreasAsync() =>
            _client.GetAsync("api/catalogos/areas");

        public Task<(bool ok, string body)> CrearAreaAsync(string codigo, string nombre) =>
            _client.PostJsonAsync("api/catalogos/areas", new { codigo, nombre });

        public Task<(bool ok, string body)> GetInspectoresAsync() =>
            _client.GetAsync("api/catalogos/inspectores");

        // areaId nulo/0 = sin filtrar (todas las áreas), igual que el comportamiento por defecto
        // de la API cuando se omite el query param.
        public Task<(bool ok, string body)> GetOperadoresAsync(int? areaId = null) =>
            _client.GetAsync(
                areaId is > 0 ? $"api/catalogos/operadores?areaId={areaId}" : "api/catalogos/operadores"
            );

        public Task<(bool ok, string body)> CrearOperadorAsync(int areaId, string nombre) =>
            _client.PostJsonAsync("api/catalogos/operadores", new { areaId, nombre });

        public Task<(bool ok, string body)> GetMaquinasAsync(int? areaId = null) =>
            _client.GetAsync(
                areaId is > 0 ? $"api/catalogos/maquinas?areaId={areaId}" : "api/catalogos/maquinas"
            );

        public Task<(bool ok, string body)> CrearMaquinaAsync(int areaId, string nombre) =>
            _client.PostJsonAsync("api/catalogos/maquinas", new { areaId, nombre });

        public Task<(bool ok, string body)> GetDefectosAsync() =>
            _client.GetAsync("api/catalogos/defectos");
    }
}
