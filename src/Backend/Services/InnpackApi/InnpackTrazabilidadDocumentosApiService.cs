using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace QualityControlCenter.Backend.Services.InnpackApi
{
    // Wrapper delgado sobre InnpackApiClient para el panel documental SGI y el factor unidades/pliego
    // de Trazabilidad (Fase 1b, solo INNPACK): api/trazabilidad-documentos/*. Devuelve el cuerpo crudo
    // {success,message,data} que el handler desenvuelve.
    public class InnpackTrazabilidadDocumentosApiService
    {
        private const string Base = "api/trazabilidad-documentos";
        private readonly InnpackApiClient _client;

        public InnpackTrazabilidadDocumentosApiService(InnpackApiClient client)
        {
            _client = client;
        }

        private static string Np(string np) => Uri.EscapeDataString(np);

        public Task<(bool ok, string body)> ListarAsync(string np) => _client.GetAsync($"{Base}/np/{Np(np)}/documentos");

        public Task<(bool ok, string body)> HistorialAsync(string np, int requisitoId) =>
            _client.GetAsync($"{Base}/np/{Np(np)}/requisito/{requisitoId}/historial");

        public Task<(bool ok, string body)> SubirAsync(string np, object body) => _client.PostJsonAsync($"{Base}/np/{Np(np)}/documentos", body);

        public Task<(bool ok, string body)> ArchivoAsync(int id) => _client.GetAsync($"{Base}/documentos/{id}/archivo");

        public Task<(bool ok, string body)> AnularAsync(int id, object body) => _client.PostJsonAsync($"{Base}/documentos/{id}/anular", body);

        public Task<(bool ok, string body)> ZipAsync(string np) => _client.GetAsync($"{Base}/np/{Np(np)}/zip");

        public Task<(bool ok, string body)> FactoresAsync(string np) => _client.GetAsync($"{Base}/np/{Np(np)}/factores");

        public Task<(bool ok, string body)> ProponerFactorAsync(string np, object body) => _client.PostJsonAsync($"{Base}/np/{Np(np)}/factores", body);

        public Task<(bool ok, string body)> ConfirmarFactorAsync(int id) =>
            _client.PostJsonAsync($"{Base}/factores/{id}/confirmar", new Dictionary<string, object>());

        public Task<(bool ok, string body)> RechazarFactorAsync(int id, object body) => _client.PostJsonAsync($"{Base}/factores/{id}/rechazar", body);

        public Task<(bool ok, string body)> AuditoriaAsync(string np) => _client.GetAsync($"{Base}/np/{Np(np)}/auditoria");
    }
}
