using System.Threading.Tasks;

namespace QualityControlCenter.Backend.Services.InnpackApi
{
    // Wrapper delgado sobre InnpackApiClient para "Máquinas y Procesos" (seguimiento) INNPACK.
    // Ver contex.md sobre la migración de INNPACK a arquitectura API.
    public class InnpackMaquinasSeguimientoApiService
    {
        private readonly InnpackApiClient _client;

        public InnpackMaquinasSeguimientoApiService(InnpackApiClient client)
        {
            _client = client;
        }

        public Task<(bool ok, string body)> ObtenerResumenAsync(int? maquinaId, bool sinLimite)
        {
            var query = "api/maquinas-seguimiento/resumen?sinLimite=" + (sinLimite ? "true" : "false");
            if (maquinaId.HasValue)
                query += "&maquinaId=" + maquinaId.Value;

            return _client.GetAsync(query);
        }
    }
}
