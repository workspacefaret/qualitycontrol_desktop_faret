using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text.Json;
using System.Threading.Tasks;
using QualityControlCenter.Backend.Services.InnpackApi;
using QualityControlCenter.Backend.Services.SapRecepcionApi;

namespace QualityControlCenter.Modules.DespachosDiarios
{
    // Despachos Diarios — solo lectura, INNPACK y Faret (dato 100% compartido, mismo patrón que
    // Certificados de Liberación y Formularios): la cantidad liberada sale del Certificado de
    // Terminaciones y Calidad del Producto (Faret_Control_Calidad), alcanzado vía
    // QualityControlInnpack.Api → fps-api. Este desktop nunca conecta SQL Server directo.
    // Además expone lo realmente despachado según SAP (pallets y unidades por empresa) a través de
    // apisapfaret (Service Layer, GET api/despachos/resumen) — misma API que ya usa Recepción de Calidad.
    public class DespachosDiariosHandler
    {
        // apisapfaret rechaza rangos mayores a 400 días (protege el Service Layer): se acota antes de llamar.
        private const int MaxDiasSap = 399;

        private readonly InnpackCertificadosLiberacionApiService _api;
        private readonly SapRecepcionApiClient _sap;

        private static readonly JsonSerializerOptions _jsonOptions = new()
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        };

        public DespachosDiariosHandler(InnpackApiClient client, SapRecepcionApiClient sapClient)
        {
            _api = new InnpackCertificadosLiberacionApiService(client);
            _sap = sapClient;
        }

        public async Task<string> Handle(string action, Dictionary<string, object> data)
        {
            try
            {
                if (action == "despachosDiarios.resumen")
                {
                    var jsonData = GetDataElement(data);
                    var fechaDesde = GetString(jsonData, "fechaDesde");
                    var fechaHasta = GetString(jsonData, "fechaHasta");

                    return await Forward(_api.ObtenerDespachosAsync(fechaDesde, fechaHasta));
                }

                // resumen = totales por empresa y por día; detalle = línea por línea (qué documento, cliente
                // y producto explica cada pallet/unidad). Misma ventana de fechas y mismas reglas.
                // categorias = totales por categoría de producto (Estuches, Fajas, Cajas...) y por día, para filtrar los KPI.
                if (
                    action == "despachosDiarios.sap.resumen"
                    || action == "despachosDiarios.sap.detalle"
                    || action == "despachosDiarios.sap.categorias"
                )
                {
                    var jsonData = GetDataElement(data);
                    return await HandleSap(
                        action.Substring("despachosDiarios.sap.".Length),
                        GetString(jsonData, "fechaDesde"),
                        GetString(jsonData, "fechaHasta"),
                        GetString(jsonData, "empresa"),
                        GetString(jsonData, "categoria"),
                        GetString(jsonData, "seleccion"),
                        GetString(jsonData, "cliente")
                    );
                }

                return Error($"Accion no reconocida: {action}");
            }
            catch (Exception ex)
            {
                return Error($"Error interno: {ex.Message}");
            }
        }

        // Pallets y unidades despachados según SAP, por empresa (INNPACK y FARET). Las fechas llegan como
        // yyyy-MM-dd (o vacías = "todo el historial"); como apisapfaret limita el rango, se acota a los
        // últimos 400 días y se avisa con `acotado` para que la pantalla lo indique.
        private async Task<string> HandleSap(string ruta, string fechaDesde, string fechaHasta, string empresa, string categoria, string seleccion, string cliente)
        {
            if (!_sap.IsConfigured)
                return Error("SAP (apisapfaret) no está configurado en este equipo");

            // empresa es opcional (vacía = INNPACK y FARET); si viene, solo se acepta una de las dos.
            if (empresa != "" && empresa != "INNPACK" && empresa != "FARET")
                return Error("La empresa debe ser INNPACK o FARET");

            // categoria (detalle) y seleccion (categorias) son opcionales: una o varias categorías separadas por coma.
            // La API valida cada una contra su catálogo (400 si alguna no existe); aquí solo se acota el largo.
            if (categoria.Length > 400 || seleccion.Length > 400)
                return Error("La selección de categorías no es válida");

            // cliente es opcional en las tres rutas: uno o varios códigos SAP (CardCode) separados por coma (la API acepta hasta 50
            // de 20 caracteres). La API valida la forma de cada código (400 si no cumple); aquí solo se acota el largo.
            if (cliente.Length > 1100)
                return Error("La selección de clientes no es válida");

            var hasta = ParseFecha(fechaHasta) ?? DateTime.Today;
            var desde = ParseFecha(fechaDesde);
            if (desde.HasValue && desde.Value > hasta)
                return Error("La fecha desde no puede ser posterior a la fecha hasta");

            var acotado = false;
            if (!desde.HasValue || (hasta - desde.Value).TotalDays > MaxDiasSap)
            {
                desde = hasta.AddDays(-MaxDiasSap);
                acotado = true;
            }

            var (ok, body) = await _sap.GetAsync(
                $"api/despachos/{ruta}?desde={desde.Value:yyyyMMdd}&hasta={hasta:yyyyMMdd}"
                    + (empresa != "" ? $"&empresa={empresa}" : "")
                    + (cliente != "" ? $"&cliente={Uri.EscapeDataString(cliente)}" : "")
                    + (ruta == "detalle" && categoria != "" ? $"&categoria={Uri.EscapeDataString(categoria)}" : "")
                    + (ruta == "categorias" && seleccion != "" ? $"&seleccion={Uri.EscapeDataString(seleccion)}" : "")
            );

            try
            {
                using var doc = JsonDocument.Parse(body);
                var root = doc.RootElement;

                if (!ok || !root.TryGetProperty("empresas", out var empresas))
                {
                    var mensaje =
                        root.TryGetProperty("error", out var e) && e.ValueKind == JsonValueKind.String ? e.GetString()
                        : root.TryGetProperty("message", out var m) && m.ValueKind == JsonValueKind.String ? m.GetString()
                        : null;
                    return Error(mensaje ?? "No se pudo consultar los despachos en SAP");
                }

                object? errores = root.TryGetProperty("errors", out var er) && er.ValueKind == JsonValueKind.Array
                    ? JsonSerializer.Deserialize<object>(er.GetRawText())
                    : null;

                return Ok(
                    new
                    {
                        desde = desde.Value.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                        hasta = hasta.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                        acotado,
                        empresas = JsonSerializer.Deserialize<object>(empresas.GetRawText()),
                        errors = errores,
                    }
                );
            }
            catch (JsonException)
            {
                return Error("Respuesta inválida de SAP (apisapfaret)");
            }
        }

        private static DateTime? ParseFecha(string valor) =>
            DateTime.TryParseExact(
                valor,
                "yyyy-MM-dd",
                CultureInfo.InvariantCulture,
                DateTimeStyles.None,
                out var f
            )
                ? f.Date
                : null;

        private static JsonElement GetDataElement(Dictionary<string, object> data)
        {
            if (data.TryGetValue("data", out var rawData) && rawData is JsonElement jsonData)
                return jsonData;

            return default;
        }

        private static string GetString(JsonElement obj, string prop)
        {
            if (obj.ValueKind != JsonValueKind.Object || !obj.TryGetProperty(prop, out var value))
                return "";
            return value.ValueKind switch
            {
                JsonValueKind.String => value.GetString() ?? "",
                JsonValueKind.Number => value.ToString(),
                _ => "",
            };
        }

        private static async Task<string> Forward(Task<(bool ok, string body)> call)
        {
            var (ok, body) = await call;

            if (!TryUnwrapApiResponse(body, out var payload, out var error) || !ok)
                return Error(error);

            var responseData =
                payload.ValueKind == JsonValueKind.Undefined
                    ? null
                    : JsonSerializer.Deserialize<object>(payload.GetRawText());
            return Ok(responseData);
        }

        // Desenvuelve el shape ApiResponse<T> {success,message,data,errors} de
        // QualityControlInnpack.Api — mismo criterio ya usado en CertificadosLiberacionHandler.cs.
        private static bool TryUnwrapApiResponse(
            string body,
            out JsonElement data,
            out string error
        )
        {
            data = default;
            error = "Error al comunicarse con la API Innpack";

            try
            {
                using var doc = JsonDocument.Parse(body);
                var root = doc.RootElement;

                if (root.TryGetProperty("success", out var s))
                {
                    if (!s.GetBoolean())
                    {
                        error = root.TryGetProperty("message", out var m)
                            ? (m.GetString() ?? error)
                            : error;
                        return false;
                    }

                    if (root.TryGetProperty("data", out var d))
                    {
                        data = d.Clone();
                        return true;
                    }

                    return true;
                }

                return false;
            }
            catch
            {
                return false;
            }
        }

        private static string Ok(object? data)
        {
            return JsonSerializer.Serialize(
                new
                {
                    ok = true,
                    data,
                    error = (string?)null,
                },
                _jsonOptions
            );
        }

        private static string Error(string message)
        {
            return JsonSerializer.Serialize(
                new
                {
                    ok = false,
                    data = (object?)null,
                    error = message,
                },
                _jsonOptions
            );
        }
    }
}
