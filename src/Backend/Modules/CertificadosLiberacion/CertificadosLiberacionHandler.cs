using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Text.Json;
using System.Threading.Tasks;
using QualityControlCenter.Backend.Services.InnpackApi;

namespace QualityControlCenter.Modules.CertificadosLiberacion
{
    // Certificados de Liberación — búsqueda y descarga de PDF ya generados por el sistema legado
    // "Sistema De Gestion CC" (Faret_Control_Calidad, servidor 192.168.1.231), alcanzados vía
    // QualityControlInnpack.Api → fps-api → OPENQUERY. Este desktop nunca conecta SQL Server
    // directo para este módulo. Ambas empresas (FARET SPA/INNPACK SPA). Ver contex.md.
    public class CertificadosLiberacionHandler
    {
        private readonly InnpackCertificadosLiberacionApiService _api;

        private static readonly JsonSerializerOptions _jsonOptions = new()
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        };

        public CertificadosLiberacionHandler(InnpackApiClient client)
        {
            _api = new InnpackCertificadosLiberacionApiService(client);
        }

        public async Task<string> Handle(string action, Dictionary<string, object> data)
        {
            try
            {
                var jsonData = GetDataElement(data);

                if (action == "certificadosLiberacion.buscar")
                {
                    var folio = GetString(jsonData, "folio");
                    var np = GetString(jsonData, "np");
                    var cliente = GetString(jsonData, "cliente");
                    var empresa = GetString(jsonData, "empresa");
                    var operador = GetString(jsonData, "operador");
                    var fechaDesde = GetString(jsonData, "fechaDesde");
                    var fechaHasta = GetString(jsonData, "fechaHasta");

                    return await Forward(_api.BuscarAsync(folio, np, cliente, empresa, operador, fechaDesde, fechaHasta));
                }

                if (action == "certificadosLiberacion.pdf.descargar")
                {
                    var folio = GetLong(jsonData, "folio") ?? 0;
                    if (folio <= 0)
                        return Error("Falta indicar el folio");

                    return await DescargarPdf(_api.ObtenerPdfAsync(folio));
                }

                if (action == "certificadosLiberacion.calidadPdf.descargar")
                {
                    var folio = GetLong(jsonData, "folio") ?? 0;
                    if (folio <= 0)
                        return Error("Falta indicar el folio");

                    return await DescargarPdf(_api.ObtenerCalidadPdfAsync(folio));
                }

                return Error($"Accion no reconocida: {action}");
            }
            catch (Exception ex)
            {
                return Error($"Error interno: {ex.Message}");
            }
        }

        // Descarga el PDF (base64) a la carpeta Descargas del usuario y lo abre con la app del
        // sistema — mismo patrón ya usado por Excel (MessageRouter.GuardarExcel): nombre único con
        // sufijo de fecha/hora si ya existe un archivo con ese nombre, sin sobrescribir. Compartido
        // entre Certificado de Terminaciones (blob ya guardado) y Certificado de Calidad
        // (generado en vivo) — ambos llegan con el mismo shape {fileName, base64}.
        private async Task<string> DescargarPdf(Task<(bool ok, string body)> llamada)
        {
            var (ok, body) = await llamada;

            if (!TryUnwrapApiResponse(body, out var payload, out var error) || !ok)
                return Error(error);

            var fileName = payload.TryGetProperty("fileName", out var fn) ? fn.GetString() ?? "certificado.pdf" : "certificado.pdf";
            var base64 = payload.TryGetProperty("base64", out var b64) ? b64.GetString() ?? "" : "";

            if (string.IsNullOrWhiteSpace(base64))
                return Error("El certificado no trae contenido");

            var downloads = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
                "Downloads"
            );
            if (!Directory.Exists(downloads))
                downloads = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);

            var finalPath = Path.Combine(downloads, fileName);
            if (File.Exists(finalPath))
            {
                var name = Path.GetFileNameWithoutExtension(fileName);
                var ext = Path.GetExtension(fileName);
                finalPath = Path.Combine(downloads, $"{name}_{DateTime.Now:yyyyMMdd_HHmmss}{ext}");
            }

            var bytes = Convert.FromBase64String(base64);
            await File.WriteAllBytesAsync(finalPath, bytes);

            try
            {
                Process.Start(new ProcessStartInfo { FileName = finalPath, UseShellExecute = true });
            }
            catch { }

            return Ok(new { path = finalPath });
        }

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

        private static long? GetLong(JsonElement obj, string prop)
        {
            if (obj.ValueKind != JsonValueKind.Object || !obj.TryGetProperty(prop, out var value))
                return null;
            if (value.ValueKind == JsonValueKind.Number && value.TryGetInt64(out var i))
                return i;
            if (value.ValueKind == JsonValueKind.String && long.TryParse(value.GetString(), out var parsed))
                return parsed;
            return null;
        }

        private static async Task<string> Forward(Task<(bool ok, string body)> call)
        {
            var (ok, body) = await call;

            if (!TryUnwrapApiResponse(body, out var payload, out var error) || !ok)
                return Error(error);

            var responseData = payload.ValueKind == JsonValueKind.Undefined ? null : JsonSerializer.Deserialize<object>(payload.GetRawText());
            return Ok(responseData);
        }

        // Desenvuelve el shape ApiResponse<T> {success,message,data,errors} de
        // QualityControlInnpack.Api — mismo criterio ya usado en UsuariosHandler.cs.
        private static bool TryUnwrapApiResponse(string body, out JsonElement data, out string error)
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
                        error = root.TryGetProperty("message", out var m) ? (m.GetString() ?? error) : error;
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
