using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using QualityControlCenter.Modules.EvaluacionOperadores;

namespace QualityControlCenter.Backend.Services.FpsApi
{
    // GET /api/produccion/sesiones-documentos?np=a,b (fps-api, solo lectura, x-api-key). Por lotes de 50 NP
    // (el máximo que acepta el endpoint). Si un lote falla, falla todo: nunca se calcula con FPS parcial.
    public class FpsSesionesApiService
    {
        public const int Lote = 50;
        private readonly FpsApiClient _client;

        public FpsSesionesApiService(FpsApiClient client)
        {
            _client = client;
        }

        public bool IsConfigured => _client.IsConfigured;

        // estado: "OK" | "NO_DESPLEGADO" (404: el endpoint aún no existe en el servidor) | "ERROR"
        public async Task<(string estado, FaretAtribucionFps.DatosFps datos, string? error)> ObtenerAsync(IEnumerable<long> nps, CancellationToken ct = default)
        {
            var datos = new FaretAtribucionFps.DatosFps();
            var lista = nps.Where(n => n > 0).Distinct().OrderBy(n => n).ToList();
            for (var i = 0; i < lista.Count; i += Lote)
            {
                var lote = lista.Skip(i).Take(Lote);
                ct.ThrowIfCancellationRequested();
                var (ok, body) = await _client.GetAsync("sesiones-documentos?np=" + string.Join(",", lote), ct);
                if (!ok)
                {
                    if (body.Contains("Cannot GET") || body.Contains("HTTP 404"))
                        return ("NO_DESPLEGADO", datos, "El endpoint de sesiones de FPS (sesiones-documentos) no está desplegado en el servidor.");
                    return ("ERROR", datos, "FPS no respondió correctamente al consultar las sesiones de producción.");
                }
                if (!FaretAtribucionFps.TryParseRespuesta(body, datos, out var error))
                    return ("ERROR", datos, error);
            }
            return ("OK", datos, null);
        }
    }
}
