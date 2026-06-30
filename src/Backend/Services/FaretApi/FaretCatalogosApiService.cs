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

        public Task<(bool ok, string body)> GetInspectoresAsync() =>
            _client.GetAsync("api/catalogos/inspectores");

        public Task<(bool ok, string body)> GetOperadoresAsync() =>
            _client.GetAsync("api/catalogos/operadores");

        public Task<(bool ok, string body)> GetMaquinasAsync() =>
            _client.GetAsync("api/catalogos/maquinas");

        public Task<(bool ok, string body)> GetDefectosAsync() =>
            _client.GetAsync("api/catalogos/defectos");
    }
}
