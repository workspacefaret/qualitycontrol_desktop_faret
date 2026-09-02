using System;
using System.Threading.Tasks;

namespace QualityControlCenter.Backend.Services.InnpackApi
{
    // Wrapper delgado sobre InnpackApiClient para Certificados de Liberación
    // ("certificadosLiberacion.*") — dato real de Faret_Control_Calidad (sistema legado
    // "Sistema De Gestion CC"), alcanzado vía QualityControlInnpack.Api → fps-api → OPENQUERY.
    // Ambas empresas (FARET SPA/INNPACK SPA). Ver contex.md.
    public class InnpackCertificadosLiberacionApiService
    {
        private readonly InnpackApiClient _client;

        public InnpackCertificadosLiberacionApiService(InnpackApiClient client)
        {
            _client = client;
        }

        public Task<(bool ok, string body)> BuscarAsync(
            string? folio,
            string? np,
            string? cliente,
            string? empresa,
            string? operador,
            string? fechaDesde,
            string? fechaHasta
        )
        {
            var query = "api/certificados-liberacion?";
            if (!string.IsNullOrWhiteSpace(folio))
                query += $"folio={Uri.EscapeDataString(folio)}&";
            if (!string.IsNullOrWhiteSpace(np))
                query += $"np={Uri.EscapeDataString(np)}&";
            if (!string.IsNullOrWhiteSpace(cliente))
                query += $"cliente={Uri.EscapeDataString(cliente)}&";
            if (!string.IsNullOrWhiteSpace(empresa))
                query += $"empresa={Uri.EscapeDataString(empresa)}&";
            if (!string.IsNullOrWhiteSpace(operador))
                query += $"operador={Uri.EscapeDataString(operador)}&";
            if (!string.IsNullOrWhiteSpace(fechaDesde))
                query += $"fechaDesde={Uri.EscapeDataString(fechaDesde)}&";
            if (!string.IsNullOrWhiteSpace(fechaHasta))
                query += $"fechaHasta={Uri.EscapeDataString(fechaHasta)}&";

            return _client.GetAsync(query.TrimEnd('&', '?'));
        }

        public Task<(bool ok, string body)> ObtenerPdfAsync(long folio) =>
            _client.GetAsync($"api/certificados-liberacion/{folio}/pdf");

        public Task<(bool ok, string body)> ObtenerCalidadPdfAsync(long folio) =>
            _client.GetAsync($"api/certificados-liberacion/{folio}/calidad-pdf");
    }
}
