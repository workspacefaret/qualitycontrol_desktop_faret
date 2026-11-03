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

        // Laboratorio (REG-LAB-04): GET /produccion/laboratorio/registros?np= — órdenes (la NP
        // puede coincidir como NP Faret y/o NP Innpack de órdenes distintas), procesos de
        // laboratorio (Corrugado/Emplacado/Troquel/Termoformado/Pegado) y TODAS sus sesiones.
        // Las fechas llegan ya como texto local "aaaa-mm-dd hh:mm:ss" (sin zona horaria): no
        // convertirlas con DateTime/Date, se muestran tal cual.
        public async Task<(bool ok, RegistrosLaboratorioFpsDto? datos, string? error)> ObtenerRegistrosLaboratorioAsync(long np)
        {
            var (ok, body) = await _client.GetAsync($"laboratorio/registros?np={np}");
            if (!ok)
                return (false, null, ExtraerMensaje(body));

            try
            {
                using var doc = JsonDocument.Parse(body);
                var root = doc.RootElement;

                if (!root.TryGetProperty("ok", out var okProp) || okProp.ValueKind != JsonValueKind.True)
                    return (false, null, ExtraerMensaje(body));

                if (!root.TryGetProperty("data", out var data) || data.ValueKind != JsonValueKind.Object)
                    return (false, null, "Respuesta inválida de FPS: falta data.");

                var resultado = new RegistrosLaboratorioFpsDto { Np = GetString(data, "np") };

                foreach (var row in EnumerarArreglo(data, "ordenes"))
                {
                    resultado.Ordenes.Add(new OrdenLaboratorioFpsDto
                    {
                        OrdenTrabajo = GetLong(row, "OrdenTrabajo"),
                        NpFaret = GetString(row, "NotaVentaFaret"),
                        NpInnpack = GetString(row, "NotaVentaInnpack"),
                        CoincideNpFaret = GetLong(row, "CoincideNpFaret") == 1,
                        CoincideNpInnpack = GetLong(row, "CoincideNpInnpack") == 1,
                        Cliente = GetString(row, "Cliente"),
                        CodigoCliente = GetString(row, "CodigoCliente"),
                        EstadoDocumento = GetString(row, "EstadoDocumento"),
                        FechaIngreso = GetString(row, "FechaIngreso"),
                    });
                }

                foreach (var row in EnumerarArreglo(data, "procesos"))
                {
                    resultado.Procesos.Add(new ProcesoLaboratorioFpsDto
                    {
                        IdProceso = GetLong(row, "IdProceso"),
                        OrdenTrabajo = GetLong(row, "OrdenTrabajo"),
                        Item = GetString(row, "Item"),
                        ItemCode = GetString(row, "ItemCode"),
                        ItemName = GetString(row, "ItemName"),
                        CodigoProceso = GetString(row, "CodigoProceso"),
                        Categoria = GetString(row, "Categoria"),
                        NombreProceso = GetString(row, "NombreProceso"),
                        NombreCarpeta = GetString(row, "NombreCarpeta"),
                        CantidadTotal = GetString(row, "CantidadTotal"),
                    });
                }

                foreach (var row in EnumerarArreglo(data, "registros"))
                {
                    resultado.Registros.Add(new RegistroLaboratorioFpsDto
                    {
                        RecordKey = GetLong(row, "RecordKey"),
                        IdProceso = GetLong(row, "IdProceso"),
                        Status = row.TryGetProperty("Status", out var st) && st.ValueKind == JsonValueKind.Number ? st.GetInt32() : null,
                        Maquina = GetString(row, "Maquina"),
                        MaquinaDescripcion = GetString(row, "MaquinaDescripcion"),
                        Operador = GetString(row, "Operador"),
                        SetupStartDate = GetString(row, "SetupStartDate"),
                        ProductionStartDate = GetString(row, "ProductionStartDate"),
                        ProductionEndDate = GetString(row, "ProductionEndDate"),
                        ProductionQuantity = GetString(row, "ProductionQuantity"),
                    });
                }

                return (true, resultado, null);
            }
            catch (Exception ex)
            {
                return (false, null, $"Respuesta inválida de FPS: {ex.Message}");
            }
        }

        private static IEnumerable<JsonElement> EnumerarArreglo(JsonElement obj, string prop)
        {
            if (obj.TryGetProperty(prop, out var arr) && arr.ValueKind == JsonValueKind.Array)
            {
                foreach (var row in arr.EnumerateArray())
                    yield return row;
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

    public class RegistrosLaboratorioFpsDto
    {
        public string Np { get; set; } = "";
        public List<OrdenLaboratorioFpsDto> Ordenes { get; set; } = new();
        public List<ProcesoLaboratorioFpsDto> Procesos { get; set; } = new();
        public List<RegistroLaboratorioFpsDto> Registros { get; set; } = new();
    }

    public class OrdenLaboratorioFpsDto
    {
        public long OrdenTrabajo { get; set; }
        public string NpFaret { get; set; } = "";
        public string NpInnpack { get; set; } = "";
        public bool CoincideNpFaret { get; set; }
        public bool CoincideNpInnpack { get; set; }
        public string Cliente { get; set; } = "";
        public string CodigoCliente { get; set; } = "";
        public string EstadoDocumento { get; set; } = "";
        public string FechaIngreso { get; set; } = "";
    }

    public class ProcesoLaboratorioFpsDto
    {
        public long IdProceso { get; set; }
        public long OrdenTrabajo { get; set; }
        public string Item { get; set; } = "";
        public string ItemCode { get; set; } = "";
        public string ItemName { get; set; } = "";
        public string CodigoProceso { get; set; } = "";
        public string Categoria { get; set; } = "";
        public string NombreProceso { get; set; } = "";
        public string NombreCarpeta { get; set; } = "";
        public string CantidadTotal { get; set; } = "";
    }

    public class RegistroLaboratorioFpsDto
    {
        public long RecordKey { get; set; }
        public long IdProceso { get; set; }
        public int? Status { get; set; }
        public string Maquina { get; set; } = "";
        public string MaquinaDescripcion { get; set; } = "";
        public string Operador { get; set; } = "";
        public string SetupStartDate { get; set; } = "";
        public string ProductionStartDate { get; set; } = "";
        public string ProductionEndDate { get; set; } = "";
        public string ProductionQuantity { get; set; } = "";
    }
}
