using System.Collections.Generic;
using System.Threading.Tasks;

namespace QualityControlCenter.Backend.Services.InnpackApi
{
    // Wrapper delgado sobre InnpackApiClient para Control Documental — dato 100% compartido entre
    // INNPACK y Faret (ver CLAUDE.md), un solo Handler/wrapper para ambos frontends. Ver
    // contex.md sobre la migración de INNPACK a arquitectura API.
    public class InnpackControlDocumentalApiService
    {
        private readonly InnpackApiClient _client;

        public InnpackControlDocumentalApiService(InnpackApiClient client)
        {
            _client = client;
        }

        public Task<(bool ok, string body)> ListAsync(
            int page,
            int pageSize,
            string? texto,
            string? tipoDocumento,
            string? area,
            string? estado,
            string? alcanceEmpresa
        )
        {
            var query = $"api/control-documental?page={page}&pageSize={pageSize}";
            if (!string.IsNullOrWhiteSpace(texto))
                query += $"&texto={System.Uri.EscapeDataString(texto)}";
            if (!string.IsNullOrWhiteSpace(tipoDocumento))
                query += $"&tipoDocumento={System.Uri.EscapeDataString(tipoDocumento)}";
            if (!string.IsNullOrWhiteSpace(area))
                query += $"&area={System.Uri.EscapeDataString(area)}";
            if (!string.IsNullOrWhiteSpace(estado))
                query += $"&estado={System.Uri.EscapeDataString(estado)}";
            if (!string.IsNullOrWhiteSpace(alcanceEmpresa))
                query += $"&alcanceEmpresa={System.Uri.EscapeDataString(alcanceEmpresa)}";

            return _client.GetAsync(query);
        }

        public Task<(bool ok, string body)> GetAsync(int id) => _client.GetAsync($"api/control-documental/{id}");

        public Task<(bool ok, string body)> CrearAsync(object body) => _client.PostJsonAsync("api/control-documental", body);

        public Task<(bool ok, string body)> ActualizarAsync(int id, object body) =>
            _client.PutJsonAsync($"api/control-documental/{id}", body);

        public Task<(bool ok, string body)> CrearVersionAsync(int documentoId, object body) =>
            _client.PostJsonAsync($"api/control-documental/{documentoId}/version", body);

        public Task<(bool ok, string body)> EliminarAsync(int id, string? actualizadoPor)
        {
            var query = $"api/control-documental/{id}";
            if (!string.IsNullOrWhiteSpace(actualizadoPor))
                query += $"?actualizadoPor={System.Uri.EscapeDataString(actualizadoPor)}";
            return _client.DeleteAsync(query);
        }

        public Task<(bool ok, string body)> SubirAdjuntoAsync(int versionId, object body) =>
            _client.PostJsonAsync($"api/control-documental/adjunto/{versionId}", body);

        public Task<(bool ok, string body)> ObtenerAdjuntoAsync(int versionId) =>
            _client.GetAsync($"api/control-documental/adjunto/{versionId}");
    }
}
