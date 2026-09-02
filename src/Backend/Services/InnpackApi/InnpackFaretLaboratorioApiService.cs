using System.Threading.Tasks;

namespace QualityControlCenter.Backend.Services.InnpackApi
{
    // Wrapper delgado sobre InnpackApiClient para Laboratorio Faret ("faretLab.*", réplica de
    // InnpackMuestraLaboratorioApiService pero contra api/faret-laboratorio — módulo EXCLUSIVO DE
    // FARET, tablas propias faret_muestra_laboratorio*. Ver contex.md sobre la migración de INNPACK
    // a arquitectura API.
    public class InnpackFaretLaboratorioApiService
    {
        private readonly InnpackApiClient _client;

        public InnpackFaretLaboratorioApiService(InnpackApiClient client)
        {
            _client = client;
        }

        public Task<(bool ok, string body)> CrearMuestraAsync(object request) => _client.PostJsonAsync("api/faret-laboratorio", request);

        public Task<(bool ok, string body)> ListAsync(string? estado, string? tipoMuestra, string? np)
        {
            var query = "api/faret-laboratorio?";
            if (!string.IsNullOrWhiteSpace(estado))
                query += $"estado={System.Uri.EscapeDataString(estado)}&";
            if (!string.IsNullOrWhiteSpace(tipoMuestra))
                query += $"tipoMuestra={System.Uri.EscapeDataString(tipoMuestra)}&";
            if (!string.IsNullOrWhiteSpace(np))
                query += $"np={System.Uri.EscapeDataString(np)}&";
            return _client.GetAsync(query.TrimEnd('&', '?'));
        }

        public Task<(bool ok, string body)> DetalleAsync(int id) => _client.GetAsync($"api/faret-laboratorio/{id}");

        public Task<(bool ok, string body)> GuardarHumedadAsync(object request) => _client.PostJsonAsync("api/faret-laboratorio/humedad", request);

        public Task<(bool ok, string body)> GuardarGramajeAsync(object request) => _client.PostJsonAsync("api/faret-laboratorio/gramaje", request);

        public Task<(bool ok, string body)> GuardarCobbAsync(object request) => _client.PostJsonAsync("api/faret-laboratorio/cobb", request);

        public Task<(bool ok, string body)> GuardarEspesorAsync(object request) => _client.PostJsonAsync("api/faret-laboratorio/espesor", request);

        public Task<(bool ok, string body)> GuardarRctAsync(object request) => _client.PostJsonAsync("api/faret-laboratorio/rct", request);

        public Task<(bool ok, string body)> GuardarFctAsync(object request) => _client.PostJsonAsync("api/faret-laboratorio/fct", request);

        public Task<(bool ok, string body)> GuardarEctAsync(object request) => _client.PostJsonAsync("api/faret-laboratorio/ect", request);

        public Task<(bool ok, string body)> GuardarBctMedidoAsync(object request) =>
            _client.PostJsonAsync("api/faret-laboratorio/bct-medido", request);

        public Task<(bool ok, string body)> GuardarBctTeoricoAsync(object request) =>
            _client.PostJsonAsync("api/faret-laboratorio/bct-teorico", request);

        public Task<(bool ok, string body)> GuardarViscosidadAsync(object request) =>
            _client.PostJsonAsync("api/faret-laboratorio/viscosidad", request);

        public Task<(bool ok, string body)> GuardarPhAsync(object request) => _client.PostJsonAsync("api/faret-laboratorio/ph", request);

        public Task<(bool ok, string body)> GuardarSolidosAsync(object request) => _client.PostJsonAsync("api/faret-laboratorio/solidos", request);

        public Task<(bool ok, string body)> GuardarLugolAsync(object request) => _client.PostJsonAsync("api/faret-laboratorio/lugol", request);

        public Task<(bool ok, string body)> ListarEspecificacionesAsync() => _client.GetAsync("api/faret-laboratorio/especificaciones");

        public Task<(bool ok, string body)> GuardarEspecificacionAsync(object request) =>
            _client.PostJsonAsync("api/faret-laboratorio/especificaciones", request);

        public Task<(bool ok, string body)> CambiarActivoEspecificacionAsync(int id, bool activo) =>
            _client.PatchJsonAsync($"api/faret-laboratorio/especificaciones/{id}/activo", new { activo });

        public Task<(bool ok, string body)> AnularEnsayoAsync(int ensayoId, string motivo) =>
            _client.PostJsonAsync($"api/faret-laboratorio/ensayos/{ensayoId}/anular", new { motivo });

        public Task<(bool ok, string body)> CrearNoConformidadAsync(int muestraId, string? usuarioNombre) =>
            _client.PostJsonAsync($"api/faret-laboratorio/{muestraId}/nc", new { usuarioNombre });
    }
}
