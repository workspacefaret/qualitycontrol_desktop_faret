using System.Threading.Tasks;

namespace QualityControlCenter.Backend.Services.FaretApi
{
    public class FaretRegistrosControlApiService
    {
        private readonly FaretApiClient _client;

        public FaretRegistrosControlApiService(FaretApiClient client)
        {
            _client = client;
        }

        public Task<(bool ok, string body)> GetListAsync() =>
            _client.GetAsync("api/registros-control");

        public Task<(bool ok, string body)> GetByIdAsync(int id) =>
            _client.GetAsync($"api/registros-control/{id}");
    }
}
