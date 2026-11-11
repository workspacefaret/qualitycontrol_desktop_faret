using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace QualityControlCenter.Backend.Services.FaretApi
{
    // Registros del formulario "CALIDAD/PRODUCCION FARET" de la app móvil Flutter, vía la API
    // `calidad` (backend Node.js separado, sin autenticación).
    public class FaretInspeccionesApiService
    {
        private readonly FaretApiClient _client;

        public FaretInspeccionesApiService(FaretApiClient client)
        {
            _client = client;
        }

        public Task<(bool ok, string body)> GetListAsync(Dictionary<string, string?> filtros) =>
            _client.GetAsync($"calidad-faret/registros?{BuildQueryString(filtros)}");

        public Task<(bool ok, string body)> GetResumenAsync(Dictionary<string, string?> filtros) =>
            _client.GetAsync($"calidad-faret/resumen?{BuildQueryString(filtros)}");

        public Task<(bool ok, string body)> GetAdjuntosAsync(int registroId) =>
            _client.GetAsync($"calidad-faret/registros/{registroId}/adjuntos");

        public Task<(bool ok, string body)> EliminarAsync(int registroId) =>
            _client.DeleteAsync($"calidad-faret/registros/{registroId}");

        // Edición (ADMIN, ADMIN_TI, INSPECTOR; la API lo valida con el JWT de la sesión). Exige "motivo" en el payload.
        public Task<(bool ok, string body)> ActualizarAsync(int registroId, object payload) =>
            _client.PutJsonAsync($"calidad-faret/registros/{registroId}", payload);

        // Catálogo maestro de eventos (áreas -> eventos con criticidad) para elegir defectos al editar.
        public Task<(bool ok, string body)> GetCatalogoEventosAsync() =>
            _client.GetAsync("calidad-faret/catalogo-eventos");

        public Task<(bool ok, string body)> GetAuditoriaAsync(int registroId) =>
            _client.GetAsync($"calidad-faret/registros/{registroId}/auditoria");

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
