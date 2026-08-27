using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using QualityControlCenter.Modules.Trazabilidad;

namespace QualityControlCenter.Backend.Services.FpsApi
{
    // Envuelve FpsApiClient + el parseo de GET /api/produccion/materiales-por-proceso (shape
    // {ok, total, data:[...]}), mismo patrón que FpsLiberacionesApiService.
    public class FpsMaterialesApiService
    {
        private readonly FpsApiClient _client;

        public FpsMaterialesApiService(FpsApiClient client)
        {
            _client = client;
        }

        public bool IsConfigured => _client.IsConfigured;

        public async Task<(
            bool ok,
            List<MaterialInsumoDto> materiales,
            string? error
        )> ObtenerMaterialesPorProcesosAsync(IEnumerable<long> idsProceso)
        {
            var ids = idsProceso.Select(id => id.ToString()).ToList();
            if (ids.Count == 0)
                return (true, new List<MaterialInsumoDto>(), null);

            var path = "materiales-por-proceso?ids=" + string.Join(",", ids);

            var (ok, body) = await _client.GetAsync(path);
            if (!ok)
                return (false, new List<MaterialInsumoDto>(), ExtraerMensaje(body));

            try
            {
                using var doc = JsonDocument.Parse(body);
                var root = doc.RootElement;

                if (
                    !root.TryGetProperty("ok", out var okProp)
                    || okProp.ValueKind != JsonValueKind.True
                )
                    return (false, new List<MaterialInsumoDto>(), ExtraerMensaje(body));

                var lista = new List<MaterialInsumoDto>();
                if (
                    root.TryGetProperty("data", out var dataProp)
                    && dataProp.ValueKind == JsonValueKind.Array
                )
                {
                    foreach (var row in dataProp.EnumerateArray())
                    {
                        lista.Add(
                            new MaterialInsumoDto
                            {
                                IdProceso = GetString(row, "Id_Proceso"),
                                ItemCode = GetString(row, "ItemCode"),
                                ItemName = GetString(row, "ItemName"),
                            }
                        );
                    }
                }

                return (true, lista, null);
            }
            catch (Exception ex)
            {
                return (
                    false,
                    new List<MaterialInsumoDto>(),
                    $"Respuesta inválida de FPS: {ex.Message}"
                );
            }
        }

        private static string ExtraerMensaje(string body)
        {
            try
            {
                using var doc = JsonDocument.Parse(body);
                if (
                    doc.RootElement.TryGetProperty("message", out var m)
                    && m.ValueKind == JsonValueKind.String
                )
                    return m.GetString() ?? body;
            }
            catch
            {
                // body no era JSON — se usa tal cual.
            }
            return body;
        }

        private static string GetString(JsonElement row, string prop)
        {
            if (row.ValueKind != JsonValueKind.Object || !row.TryGetProperty(prop, out var v))
                return "";
            return v.ValueKind switch
            {
                JsonValueKind.String => v.GetString() ?? "",
                JsonValueKind.Number => v.ToString(),
                _ => "",
            };
        }
    }
}
