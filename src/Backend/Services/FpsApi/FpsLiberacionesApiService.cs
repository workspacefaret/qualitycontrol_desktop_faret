using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Threading.Tasks;
using QualityControlCenter.Modules.TalleresExternos;

namespace QualityControlCenter.Backend.Services.FpsApi
{
    // Envuelve FpsApiClient + el parseo de GET /api/produccion/liberaciones (shape {ok, total,
    // data:[...]}), igual que los Faret*ApiService envuelven FaretApiClient para cada API Faret.
    public class FpsLiberacionesApiService
    {
        private readonly FpsApiClient _client;

        public FpsLiberacionesApiService(FpsApiClient client)
        {
            _client = client;
        }

        public bool IsConfigured => _client.IsConfigured;

        public async Task<(
            bool ok,
            List<LiberacionFpsDto> liberaciones,
            string? error
        )> ObtenerLiberacionesAsync(string np, string item, string codigo, string empresa)
        {
            var path =
                "liberaciones"
                + $"?np={Uri.EscapeDataString(np)}"
                + $"&item={Uri.EscapeDataString(item)}"
                + $"&codigo={Uri.EscapeDataString(codigo)}"
                + $"&empresa={Uri.EscapeDataString(empresa)}";

            var (ok, body) = await _client.GetAsync(path);
            if (!ok)
                return (false, new List<LiberacionFpsDto>(), ExtraerMensaje(body));

            try
            {
                using var doc = JsonDocument.Parse(body);
                var root = doc.RootElement;

                if (
                    !root.TryGetProperty("ok", out var okProp)
                    || okProp.ValueKind != JsonValueKind.True
                )
                    return (false, new List<LiberacionFpsDto>(), ExtraerMensaje(body));

                var lista = new List<LiberacionFpsDto>();
                if (
                    root.TryGetProperty("data", out var dataProp)
                    && dataProp.ValueKind == JsonValueKind.Array
                )
                {
                    foreach (var row in dataProp.EnumerateArray())
                    {
                        lista.Add(
                            new LiberacionFpsDto
                            {
                                Folio = GetLong(row, "Folio"),
                                Np = GetString(row, "Np"),
                                Item = GetString(row, "Item"),
                                CodigoArticulo = GetString(row, "CodigoArticulo"),
                                CantidadRequerida = GetDecimal(row, "CantidadRequerida"),
                                CantidadLiberacion = GetDecimal(row, "CantidadLiberacion"),
                                FechaLiberacion = GetDateTime(row, "FechaLiberacion"),
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
                    new List<LiberacionFpsDto>(),
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

        private static long GetLong(JsonElement row, string prop)
        {
            if (row.ValueKind != JsonValueKind.Object || !row.TryGetProperty(prop, out var v))
                return 0;
            if (v.ValueKind == JsonValueKind.Number && v.TryGetInt64(out var n))
                return n;
            return long.TryParse(v.ToString(), out var parsed) ? parsed : 0;
        }

        private static decimal GetDecimal(JsonElement row, string prop)
        {
            if (row.ValueKind != JsonValueKind.Object || !row.TryGetProperty(prop, out var v))
                return 0m;
            if (v.ValueKind == JsonValueKind.Number && v.TryGetDecimal(out var d))
                return d;
            return decimal.TryParse(v.ToString(), out var parsed) ? parsed : 0m;
        }

        private static DateTime GetDateTime(JsonElement row, string prop)
        {
            if (row.ValueKind != JsonValueKind.Object || !row.TryGetProperty(prop, out var v))
                return default;
            if (v.ValueKind == JsonValueKind.String && DateTime.TryParse(v.GetString(), out var d))
                return d;
            return default;
        }
    }
}
