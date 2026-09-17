using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Threading.Tasks;

namespace QualityControlCenter.Backend.Services.FpsApi
{
    // "N.° de registro de producción" (QCC Laboratorio, solo INNPACK): envuelve
    // GET /produccion/registros-por-proceso/:idProceso (WorkOrderRecords), mismo patrón que
    // FpsMaterialesApiService.
    public class FpsRegistroProduccionApiService
    {
        private readonly FpsApiClient _client;

        public FpsRegistroProduccionApiService(FpsApiClient client)
        {
            _client = client;
        }

        public bool IsConfigured => _client.IsConfigured;

        public async Task<(bool ok, List<RegistroProduccionFpsDto> registros, string? error)> ObtenerPorProcesoAsync(long idProceso)
        {
            var (ok, body) = await _client.GetAsync($"registros-por-proceso/{idProceso}");
            if (!ok)
                return (false, new List<RegistroProduccionFpsDto>(), ExtraerMensaje(body));

            try
            {
                using var doc = JsonDocument.Parse(body);
                var root = doc.RootElement;

                if (!root.TryGetProperty("ok", out var okProp) || okProp.ValueKind != JsonValueKind.True)
                    return (false, new List<RegistroProduccionFpsDto>(), ExtraerMensaje(body));

                var lista = new List<RegistroProduccionFpsDto>();
                if (root.TryGetProperty("data", out var dataProp) && dataProp.ValueKind == JsonValueKind.Array)
                {
                    foreach (var row in dataProp.EnumerateArray())
                    {
                        lista.Add(new RegistroProduccionFpsDto
                        {
                            RecordKey = GetLong(row, "RecordKey"),
                            IdProceso = GetLong(row, "IdProceso"),
                            Maquina = GetString(row, "Maquina"),
                            MaquinaDescripcion = GetString(row, "MaquinaDescripcion"),
                            Operador = GetString(row, "Operador"),
                            ProductionStartDate = GetString(row, "ProductionStartDate"),
                            ProductionEndDate = GetString(row, "ProductionEndDate"),
                            ProductionQuantity = GetString(row, "ProductionQuantity"),
                        });
                    }
                }

                return (true, lista, null);
            }
            catch (Exception ex)
            {
                return (false, new List<RegistroProduccionFpsDto>(), $"Respuesta inválida de FPS: {ex.Message}");
            }
        }

        private static string ExtraerMensaje(string body)
        {
            try
            {
                using var doc = JsonDocument.Parse(body);
                if (doc.RootElement.TryGetProperty("message", out var m) && m.ValueKind == JsonValueKind.String)
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
            if (v.ValueKind == JsonValueKind.String && long.TryParse(v.GetString(), out var s))
                return s;
            return 0;
        }
    }

    public class RegistroProduccionFpsDto
    {
        public long RecordKey { get; set; }
        public long IdProceso { get; set; }
        public string Maquina { get; set; } = "";
        public string MaquinaDescripcion { get; set; } = "";
        public string Operador { get; set; } = "";
        public string ProductionStartDate { get; set; } = "";
        public string ProductionEndDate { get; set; } = "";
        public string ProductionQuantity { get; set; } = "";
    }
}
