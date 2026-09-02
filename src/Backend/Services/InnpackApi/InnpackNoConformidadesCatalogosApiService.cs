using System.Threading.Tasks;

namespace QualityControlCenter.Backend.Services.InnpackApi
{
    // Wrapper delgado sobre InnpackApiClient para los 9 catálogos administrables de No
    // Conformidades INNPACK (Cliente/Categoría defecto/Tipo de falla/Supervisor/Revisado por/
    // Área/Familia de producto/Nivel/Impacto) — mismo patrón que InnpackUsuariosApiService. El
    // parámetro "catalogo" viaja tal cual como segmento de ruta; la API valida contra su propio
    // whitelist. Ver contex.md sobre la migración de INNPACK a arquitectura API.
    public class InnpackNoConformidadesCatalogosApiService
    {
        private readonly InnpackApiClient _client;

        public InnpackNoConformidadesCatalogosApiService(InnpackApiClient client)
        {
            _client = client;
        }

        public Task<(bool ok, string body)> ListAsync(string catalogo) =>
            _client.GetAsync($"api/nc-catalogos/{catalogo}");

        public Task<(bool ok, string body)> CrearAsync(string catalogo, string nombre, string? creadoPor) =>
            _client.PostJsonAsync($"api/nc-catalogos/{catalogo}", new { nombre, creadoPor });

        public Task<(bool ok, string body)> DesactivarAsync(string catalogo, int id) =>
            _client.DeleteAsync($"api/nc-catalogos/{catalogo}/{id}");
    }
}
