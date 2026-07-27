using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace QualityControlCenter.Backend.Services.FaretApi
{
    // Registros del formulario "CONTROL PALLET / PAPEL FARET" de la app móvil Flutter, vía la API
    // `calidad` (backend Node.js separado, sin autenticación) — mismo cliente/base URL que
    // FaretInspeccionesApiService, path distinto (`calidad-faret-pallet` en vez de `calidad-faret`).
    public class FaretInspeccionesPalletApiService
    {
        private readonly FaretApiClient _client;

        public FaretInspeccionesPalletApiService(FaretApiClient client)
        {
            _client = client;
        }

        public Task<(bool ok, string body)> GetListAsync(Dictionary<string, string?> filtros) =>
            _client.GetAsync($"calidad-faret-pallet/registros?{BuildQueryString(filtros)}");

        public Task<(bool ok, string body)> GetByIdAsync(int registroId) =>
            _client.GetAsync($"calidad-faret-pallet/registros/{registroId}");

        public Task<(bool ok, string body)> EliminarAsync(int registroId) =>
            _client.DeleteAsync($"calidad-faret-pallet/registros/{registroId}");

        private static string BuildQueryString(Dictionary<string, string?> filtros) =>
            string.Join(
                "&",
                filtros
                    .Where(kv => !string.IsNullOrEmpty(kv.Value))
                    .Select(kv =>
                        $"{Uri.EscapeDataString(kv.Key)}={Uri.EscapeDataString(kv.Value!)}"
                    )
            );
    }
}
