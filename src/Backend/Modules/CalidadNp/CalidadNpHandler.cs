using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using QualityControlCenter.Backend.Services.InnpackApi;
using QualityControlCenter.Services;

namespace QualityControlCenter.Modules.CalidadNp
{
    // Calidad NP (solo INNPACK): informes de trazabilidad guardados, mermas, cierre interno de NP y certificados de
    // destrucción. Passthrough delgado hacia api/calidad-np de la API INNPACK: las reglas de negocio (saldos, estados,
    // correlativos, auditoría) viven ÚNICAMENTE en la API. Aquí solo se mapea acción → ruta y se valida la NP.
    public class CalidadNpHandler
    {
        private const string Base = "api/calidad-np/";
        private static readonly Regex NpRegex = new(@"^[A-Za-z0-9._-]{1,40}$", RegexOptions.Compiled);

        // acción → (verbo, ruta con {np} {id} {item})
        private static readonly Dictionary<string, (string Verbo, string Ruta)> Rutas = new()
        {
            ["calidadNp.resumen"] = ("GET", "resumen"),
            ["calidadNp.informes.list"] = ("GET", "np/{np}/informes"),
            ["calidadNp.informes.get"] = ("GET", "informes/{id}"),
            ["calidadNp.informes.guardar"] = ("POST", "np/{np}/informes"),
            ["calidadNp.mermas.list"] = ("GET", "np/{np}/mermas"),
            ["calidadNp.mermas.crear"] = ("POST", "np/{np}/mermas"),
            ["calidadNp.mermas.corregir"] = ("POST", "mermas/{id}/corregir"),
            ["calidadNp.mermas.pendienteValidacion"] = ("POST", "mermas/{id}/pendiente-validacion"),
            ["calidadNp.mermas.validar"] = ("POST", "mermas/{id}/validar"),
            ["calidadNp.mermas.anular"] = ("POST", "mermas/{id}/anular"),
            ["calidadNp.cierre.get"] = ("GET", "np/{np}/cierre/{item}"),
            ["calidadNp.cierre.guardar"] = ("POST", "np/{np}/cierre/{item}"),
            ["calidadNp.cierre.area"] = ("POST", "np/{np}/cierre/{item}/areas"),
            ["calidadNp.certificados.archivos.agregar"] = ("POST", "certificados/{id}/archivos"),
            ["calidadNp.certificados.archivos.anular"] = ("POST", "certificados/{id}/archivos/{archivoId}/anular"),
            ["calidadNp.certificados.list"] = ("GET", "certificados"),
            ["calidadNp.certificados.get"] = ("GET", "certificados/{id}"),
            ["calidadNp.certificados.flujo"] = ("GET", "certificados/flujo"),
            ["calidadNp.certificados.crear"] = ("POST", "certificados"),
            ["calidadNp.certificados.editar"] = ("PUT", "certificados/{id}"),
            ["calidadNp.certificados.solicitarAprobacion"] = ("POST", "certificados/{id}/solicitar-aprobacion"),
            ["calidadNp.certificados.aprobar"] = ("POST", "certificados/{id}/aprobar"),
            ["calidadNp.certificados.rechazar"] = ("POST", "certificados/{id}/rechazar"),
            ["calidadNp.certificados.emitir"] = ("POST", "certificados/{id}/emitir"),
            ["calidadNp.certificados.anular"] = ("POST", "certificados/{id}/anular"),
            ["calidadNp.certificados.confirmarEjecucion"] = ("POST", "certificados/{id}/confirmar-ejecucion"),
        };

        private static readonly JsonSerializerOptions _jsonOptions = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

        private readonly InnpackApiClient _client;

        public CalidadNpHandler(InnpackApiClient client)
        {
            _client = client;
        }

        public async Task<string> Handle(string action, Dictionary<string, object> data)
        {
            try
            {
                var d = GetDataElement(data);
                if (action == "calidadNp.mermas.evidencia")
                    return await AbrirEvidencia(d);
                if (action is "calidadNp.certificados.exportarExcel" or "calidadNp.certificados.exportarPdf")
                    return await ExportarCertificado(action, d);
                if (action == "calidadNp.certificados.documento.conservar")
                    return await ConservarDocumento(d);
                if (action is "calidadNp.certificados.documento.get" or "calidadNp.certificados.archivo.abrir")
                    return await LeerArchivoCertificado(action, d);
                if (!Rutas.TryGetValue(action, out var ruta))
                    return Error($"Acción no reconocida: {action}");

                var path = ruta.Ruta;
                if (path.Contains("{np}"))
                {
                    var np = GetString(d, "np").Trim();
                    if (!NpRegex.IsMatch(np))
                        return Error("Debes indicar una NP válida (letras, números, punto o guion, hasta 40 caracteres).");
                    path = path.Replace("{np}", Uri.EscapeDataString(np));
                }
                if (path.Contains("{id}"))
                {
                    if (!TryGetInt(d, "id", out var id))
                        return Error("Falta el identificador del registro.");
                    path = path.Replace("{id}", id.ToString());
                }
                if (path.Contains("{archivoId}"))
                {
                    if (!TryGetInt(d, "archivoId", out var archivoId))
                        return Error("Falta el archivo.");
                    path = path.Replace("{archivoId}", archivoId.ToString());
                }
                if (path.Contains("{item}"))
                {
                    if (!TryGetInt(d, "item", out var item))
                        return Error("Debes indicar el ítem de la NP.");
                    path = path.Replace("{item}", item.ToString());
                }

                // Filtros opcionales por query string (solo dos listados los usan).
                var query = new List<string>();
                if (action == "calidadNp.mermas.list" && TryGetInt(d, "item", out var itemFiltro))
                    query.Add($"item={itemFiltro}");
                if (action == "calidadNp.resumen")
                {
                    // Período opcional (yyyy-MM-dd); la API valida el rango.
                    foreach (var campo in new[] { "desde", "hasta" })
                    {
                        var valor = GetString(d, campo).Trim();
                        if (System.Text.RegularExpressions.Regex.IsMatch(valor, @"^\d{4}-\d{2}-\d{2}$")) query.Add($"{campo}={valor}");
                    }
                }
                if (action == "calidadNp.certificados.list")
                {
                    var estado = GetString(d, "estado").Trim();
                    var npFiltro = GetString(d, "np").Trim();
                    if (estado.Length > 0) query.Add($"estado={Uri.EscapeDataString(estado)}");
                    if (npFiltro.Length > 0) query.Add($"np={Uri.EscapeDataString(npFiltro)}");
                }
                if (query.Count > 0)
                    path += "?" + string.Join("&", query);

                var (ok, body) = ruta.Verbo switch
                {
                    "GET" => await _client.GetAsync(Base + path),
                    "PUT" => await _client.PutJsonAsync(Base + path, d),
                    _ => await _client.PostJsonAsync(Base + path, d.ValueKind == JsonValueKind.Object ? d : new Dictionary<string, object>()),
                };
                return Forward(ok, body);
            }
            catch (Exception ex)
            {
                return Error(ex.Message);
            }
        }

        // Evidencia de una merma: se escribe a una carpeta temporal y se abre con la app del sistema.
        private async Task<string> AbrirEvidencia(JsonElement d)
        {
            if (!TryGetInt(d, "id", out var id))
                return Error("Falta la merma.");
            var (ok, body) = await _client.GetAsync($"{Base}mermas/{id}/evidencia");
            if (!TryUnwrap(body, out var payload, out var error) || !ok)
                return Error(error);
            var nombre = Path.GetFileName(payload.GetProperty("nombreArchivo").GetString() ?? "evidencia");
            var contenido = Convert.FromBase64String(payload.GetProperty("contenidoBase64").GetString() ?? "");
            if (!ArchivosSeguros.SePuedeAbrir(nombre))
                return Error(ArchivosSeguros.MensajeBloqueo);
            var carpeta = Path.Combine(Path.GetTempPath(), "QCC_CalidadNp");
            Directory.CreateDirectory(carpeta);
            var ruta = Path.Combine(carpeta, $"merma{id}_{nombre}");
            await File.WriteAllBytesAsync(ruta, contenido);
            Process.Start(new ProcessStartInfo { FileName = ruta, UseShellExecute = true });
            return Ok(new { nombreArchivo = nombre });
        }

        // Conserva en la API el documento tal como se ve al emitir (la API solo admite uno por certificado).
        private async Task<string> ConservarDocumento(JsonElement d)
        {
            var exportado = await ExportarCertificado("calidadNp.certificados.exportarPdf", d);
            using var doc = JsonDocument.Parse(exportado);
            if (!doc.RootElement.GetProperty("ok").GetBoolean())
                return exportado;
            TryGetInt(d, "id", out var id);
            var html = doc.RootElement.GetProperty("data").GetProperty("html").GetString();
            var (ok, body) = await _client.PostJsonAsync($"{Base}certificados/{id}/archivos", new Dictionary<string, object?> { ["tipo"] = "DOCUMENTO_EMITIDO", ["html"] = html });
            return Forward(ok, body);
        }

        // Documento emitido: se devuelve el HTML original (el front lo imprime en un marco sin scripts), verificando su huella.
        // Evidencia: se escribe en una carpeta temporal y se abre con la aplicación del sistema.
        private async Task<string> LeerArchivoCertificado(string action, JsonElement d)
        {
            if (!TryGetInt(d, "id", out var id) || !TryGetInt(d, "archivoId", out var archivoId))
                return Error("Falta el certificado o el archivo.");
            var (ok, body) = await _client.GetAsync($"{Base}certificados/{id}/archivos/{archivoId}");
            if (!TryUnwrap(body, out var payload, out var error) || !ok)
                return Error(error);
            var contenido = Convert.FromBase64String(payload.GetProperty("contenidoBase64").GetString() ?? "");
            var huella = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(contenido)).ToLowerInvariant();
            if (!string.Equals(huella, payload.GetProperty("sha256").GetString()?.Trim(), StringComparison.OrdinalIgnoreCase))
                return Error("El archivo recibido no coincide con la huella registrada: no se muestra.");
            if (action == "calidadNp.certificados.documento.get")
            {
                if (payload.GetProperty("tipoMime").GetString() != "text/html")
                    return Error("El archivo no es el documento emitido.");
                return Ok(new { html = System.Text.Encoding.UTF8.GetString(contenido), sha256 = huella });
            }
            var nombre = Path.GetFileName(payload.GetProperty("nombreArchivo").GetString() ?? "evidencia");
            if (!ArchivosSeguros.SePuedeAbrir(nombre))
                return Error(ArchivosSeguros.MensajeBloqueo);
            var carpeta = Path.Combine(Path.GetTempPath(), "QCC_CalidadNp");
            Directory.CreateDirectory(carpeta);
            var ruta = Path.Combine(carpeta, $"cert{id}_{archivoId}_{nombre}");
            await File.WriteAllBytesAsync(ruta, contenido);
            Process.Start(new ProcessStartInfo { FileName = ruta, UseShellExecute = true });
            return Ok(new { nombreArchivo = nombre });
        }

        // Certificado en el formato oficial REG-SGI-CDD-V11: Excel (plantilla rellenada) o HTML imprimible del mismo libro (PDF).
        private async Task<string> ExportarCertificado(string action, JsonElement d)
        {
            if (!TryGetInt(d, "id", out var id))
                return Error("Falta el certificado.");
            var (ok, body) = await _client.GetAsync($"{Base}certificados/{id}");
            if (!TryUnwrap(body, out var cert, out var error) || !ok)
                return Error(error);

            decimal? liberada = d.ValueKind == JsonValueKind.Object && d.TryGetProperty("cantidadLiberada", out var l) && l.ValueKind == JsonValueKind.Number ? l.GetDecimal() : null;
            using var libro = CertificadoDestruccionV11.Construir(cert, liberada);
            var c = cert.GetProperty("certificado");
            var nombre = c.TryGetProperty("correlativo", out var corr) && corr.ValueKind == JsonValueKind.String ? corr.GetString() : null;
            nombre = Regex.Replace(nombre ?? $"BORRADOR-{id}", @"[^A-Za-z0-9._-]", "_");

            if (action == "calidadNp.certificados.exportarPdf")
                return Ok(new { fileName = $"REG-SGI-CDD-V11_{nombre}.pdf", html = MuestraLaboratorio.RegLab04Html.Render(libro, $"REG-SGI-CDD-V11 {nombre}") });
            return Ok(new { fileName = $"REG-SGI-CDD-V11_{nombre}.xlsx", base64 = Convert.ToBase64String(CertificadoDestruccionV11.ABytes(libro)) });
        }

        private static string Forward(bool ok, string body)
        {
            if (!TryUnwrap(body, out var payload, out var error) || !ok)
                return Error(error);
            var data = payload.ValueKind == JsonValueKind.Undefined ? null : JsonSerializer.Deserialize<object>(payload.GetRawText());
            return Ok(data);
        }

        // Desenvuelve {success,message,data,errors} de la API INNPACK; si hay error devuelve su mensaje.
        private static bool TryUnwrap(string body, out JsonElement data, out string error)
        {
            data = default;
            error = "Error al comunicarse con la API Innpack";
            try
            {
                using var doc = JsonDocument.Parse(body);
                var root = doc.RootElement;
                if (!root.TryGetProperty("success", out var s))
                    return false;
                if (!s.GetBoolean())
                {
                    error = root.TryGetProperty("message", out var m) ? (m.GetString() ?? error) : error;
                    return false;
                }
                if (root.TryGetProperty("data", out var d))
                    data = d.Clone();
                return true;
            }
            catch
            {
                return false;
            }
        }

        private static JsonElement GetDataElement(Dictionary<string, object> data) =>
            data.TryGetValue("data", out var raw) && raw is JsonElement e ? e : default;

        private static string GetString(JsonElement obj, string prop)
        {
            if (obj.ValueKind != JsonValueKind.Object || !obj.TryGetProperty(prop, out var v))
                return "";
            return v.ValueKind switch
            {
                JsonValueKind.String => v.GetString() ?? "",
                JsonValueKind.Number => v.ToString(),
                _ => "",
            };
        }

        private static bool TryGetInt(JsonElement obj, string prop, out int id)
        {
            id = 0;
            if (obj.ValueKind != JsonValueKind.Object || !obj.TryGetProperty(prop, out var v))
                return false;
            return v.ValueKind == JsonValueKind.Number
                ? v.TryGetInt32(out id) && id > 0
                : v.ValueKind == JsonValueKind.String && int.TryParse(v.GetString(), out id) && id > 0;
        }

        private static string Ok(object? data) =>
            JsonSerializer.Serialize(new { ok = true, data, error = (string?)null }, _jsonOptions);

        private static string Error(string message) =>
            JsonSerializer.Serialize(new { ok = false, data = (object?)null, error = message }, _jsonOptions);
    }
}
