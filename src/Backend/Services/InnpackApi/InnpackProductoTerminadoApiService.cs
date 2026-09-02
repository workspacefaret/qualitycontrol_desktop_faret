using System;
using System.Text;
using System.Threading.Tasks;

namespace QualityControlCenter.Backend.Services.InnpackApi
{
    // Wrapper delgado sobre InnpackApiClient para Producto Terminado ("productoTerminado.*",
    // módulo híbrido INNPACK+FARET con scope por `empresa`). Ver contex.md sobre la migración de
    // INNPACK a arquitectura API.
    public class InnpackProductoTerminadoApiService
    {
        private readonly InnpackApiClient _client;

        public InnpackProductoTerminadoApiService(InnpackApiClient client)
        {
            _client = client;
        }

        public Task<(bool ok, string body)> FiltrosAsync(string empresa) =>
            _client.GetAsync($"api/producto-terminado/filtros?empresa={Uri.EscapeDataString(empresa)}");

        public Task<(bool ok, string body)> ResumenAsync(string empresa, FiltroQueryParts f) =>
            _client.GetAsync($"api/producto-terminado/resumen?{BuildQuery(empresa, f)}");

        public Task<(bool ok, string body)> ListAsync(string empresa, FiltroQueryParts f, int page, int limit) =>
            _client.GetAsync($"api/producto-terminado?{BuildQuery(empresa, f)}&page={page}&limit={limit}");

        public Task<(bool ok, string body)> DetalleAsync(int id, string empresa) =>
            _client.GetAsync($"api/producto-terminado/{id}?empresa={Uri.EscapeDataString(empresa)}");

        public Task<(bool ok, string body)> ExportarDetalleAsync(string empresa, FiltroQueryParts f) =>
            _client.GetAsync($"api/producto-terminado/exportar-detalle?{BuildQuery(empresa, f)}");

        public Task<(bool ok, string body)> EliminarAsync(int id, string empresa) =>
            _client.DeleteAsync($"api/producto-terminado/{id}?empresa={Uri.EscapeDataString(empresa)}");

        private static string BuildQuery(string empresa, FiltroQueryParts f)
        {
            var sb = new StringBuilder();
            sb.Append("empresa=").Append(Uri.EscapeDataString(empresa));
            AppendIfNotEmpty(sb, "fechaDesde", f.FechaDesde);
            AppendIfNotEmpty(sb, "fechaHasta", f.FechaHasta);
            AppendIfNotEmpty(sb, "np", f.Np);
            AppendIfNotEmpty(sb, "codigoProducto", f.CodigoProducto);
            AppendIfNotEmpty(sb, "proceso", f.Proceso);
            AppendIfNotEmpty(sb, "maquina", f.Maquina);
            AppendIfNotEmpty(sb, "turno", f.Turno);
            if (f.InspectorId.HasValue)
                sb.Append("&inspectorId=").Append(f.InspectorId.Value);
            AppendIfNotEmpty(sb, "resultado", f.Resultado);
            if (f.OrigenId.HasValue)
                sb.Append("&origenId=").Append(f.OrigenId.Value);
            return sb.ToString();
        }

        private static void AppendIfNotEmpty(StringBuilder sb, string name, string? value)
        {
            if (!string.IsNullOrWhiteSpace(value))
                sb.Append('&').Append(name).Append('=').Append(Uri.EscapeDataString(value));
        }

        public class FiltroQueryParts
        {
            public string? FechaDesde { get; set; }
            public string? FechaHasta { get; set; }
            public string? Np { get; set; }
            public string? CodigoProducto { get; set; }
            public string? Proceso { get; set; }
            public string? Maquina { get; set; }
            public string? Turno { get; set; }
            public int? InspectorId { get; set; }
            public string? Resultado { get; set; }
            public int? OrigenId { get; set; }
        }
    }
}
