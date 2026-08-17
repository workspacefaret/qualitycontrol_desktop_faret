using System.Threading.Tasks;

namespace QualityControlCenter.Backend.Services.FaretApi
{
    // Catálogos administrables del formulario de No Conformidades/PNC de FARET (módulo faret-nc):
    // Cliente, Categoría defecto, Tipo de falla, Supervisor, Revisado por. Consume
    // api/pnc-catalogos/* en la API "qualitycontrol" (mismo _client con JWT que
    // Importaciones/Usuarios/TalleresExternos) — no es la misma API/dominio que
    // FaretCatalogosApiService (api/catalogos/*, jerarquía Área→Operador/Máquina/Defecto de
    // planta, sin relación con estos 5 catálogos).
    public class FaretPncCatalogosApiService
    {
        private readonly FaretApiClient _client;

        public FaretPncCatalogosApiService(FaretApiClient client)
        {
            _client = client;
        }

        public Task<(bool ok, string body)> GetClientesAsync() =>
            _client.GetAsync("api/pnc-catalogos/clientes");
        public Task<(bool ok, string body)> CrearClienteAsync(string nombre) =>
            _client.PostJsonAsync("api/pnc-catalogos/clientes", new { nombre });
        public Task<(bool ok, string body)> DesactivarClienteAsync(int id) =>
            _client.DeleteAsync($"api/pnc-catalogos/clientes/{id}");

        public Task<(bool ok, string body)> GetCategoriasDefectoAsync() =>
            _client.GetAsync("api/pnc-catalogos/categorias-defecto");
        public Task<(bool ok, string body)> CrearCategoriaDefectoAsync(string nombre) =>
            _client.PostJsonAsync("api/pnc-catalogos/categorias-defecto", new { nombre });
        public Task<(bool ok, string body)> DesactivarCategoriaDefectoAsync(int id) =>
            _client.DeleteAsync($"api/pnc-catalogos/categorias-defecto/{id}");

        public Task<(bool ok, string body)> GetTiposFallaAsync() =>
            _client.GetAsync("api/pnc-catalogos/tipos-falla");
        public Task<(bool ok, string body)> CrearTipoFallaAsync(string nombre) =>
            _client.PostJsonAsync("api/pnc-catalogos/tipos-falla", new { nombre });
        public Task<(bool ok, string body)> DesactivarTipoFallaAsync(int id) =>
            _client.DeleteAsync($"api/pnc-catalogos/tipos-falla/{id}");

        public Task<(bool ok, string body)> GetSupervisoresAsync() =>
            _client.GetAsync("api/pnc-catalogos/supervisores");
        public Task<(bool ok, string body)> CrearSupervisorAsync(string nombre) =>
            _client.PostJsonAsync("api/pnc-catalogos/supervisores", new { nombre });
        public Task<(bool ok, string body)> DesactivarSupervisorAsync(int id) =>
            _client.DeleteAsync($"api/pnc-catalogos/supervisores/{id}");

        public Task<(bool ok, string body)> GetRevisoresAsync() =>
            _client.GetAsync("api/pnc-catalogos/revisores");
        public Task<(bool ok, string body)> CrearRevisorAsync(string nombre) =>
            _client.PostJsonAsync("api/pnc-catalogos/revisores", new { nombre });
        public Task<(bool ok, string body)> DesactivarRevisorAsync(int id) =>
            _client.DeleteAsync($"api/pnc-catalogos/revisores/{id}");

        public Task<(bool ok, string body)> GetFamiliasProductoAsync() =>
            _client.GetAsync("api/pnc-catalogos/familias-producto");
        public Task<(bool ok, string body)> CrearFamiliaProductoAsync(string nombre) =>
            _client.PostJsonAsync("api/pnc-catalogos/familias-producto", new { nombre });
        public Task<(bool ok, string body)> DesactivarFamiliaProductoAsync(int id) =>
            _client.DeleteAsync($"api/pnc-catalogos/familias-producto/{id}");

        public Task<(bool ok, string body)> GetNivelesAsync() =>
            _client.GetAsync("api/pnc-catalogos/niveles");
        public Task<(bool ok, string body)> CrearNivelAsync(string nombre) =>
            _client.PostJsonAsync("api/pnc-catalogos/niveles", new { nombre });
        public Task<(bool ok, string body)> DesactivarNivelAsync(int id) =>
            _client.DeleteAsync($"api/pnc-catalogos/niveles/{id}");

        public Task<(bool ok, string body)> GetImpactosAsync() =>
            _client.GetAsync("api/pnc-catalogos/impactos");
        public Task<(bool ok, string body)> CrearImpactoAsync(string nombre) =>
            _client.PostJsonAsync("api/pnc-catalogos/impactos", new { nombre });
        public Task<(bool ok, string body)> DesactivarImpactoAsync(int id) =>
            _client.DeleteAsync($"api/pnc-catalogos/impactos/{id}");
    }
}
