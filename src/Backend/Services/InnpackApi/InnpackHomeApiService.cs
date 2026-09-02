using System.Threading.Tasks;

namespace QualityControlCenter.Backend.Services.InnpackApi
{
    // Wrapper delgado sobre InnpackApiClient para el módulo "Inicio" (Home) INNPACK — Paso 15 de
    // la migración. Ver contex.md sobre la migración de INNPACK a arquitectura API.
    public class InnpackHomeApiService
    {
        private readonly InnpackApiClient _client;

        public InnpackHomeApiService(InnpackApiClient client)
        {
            _client = client;
        }

        public Task<(bool ok, string body)> DashboardAsync() => _client.GetAsync("api/home/dashboard");

        public Task<(bool ok, string body)> ActualizarFrecuenciaAsync(int id, int frecuenciaMinutos) =>
            _client.PutJsonAsync($"api/home/frecuencias/{id}", new { frecuenciaMinutos });
    }
}
