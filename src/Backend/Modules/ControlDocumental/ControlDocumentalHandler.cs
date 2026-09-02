using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using QualityControlCenter.Backend.Services.InnpackApi;

namespace QualityControlCenter.Modules.ControlDocumental
{
    // Migrado a QualityControlInnpack.Api — ya no consulta MySQL directo desde el desktop
    // (ControlDocumentalRepository.cs de este módulo queda sin uso). Dato 100% compartido entre
    // INNPACK y Faret (ver CLAUDE.md) — ambos frontends siguen llamando las mismas acciones
    // "controlDocumental.*" sin ningún wiring separado, igual que antes de la migración. El
    // payload de este módulo viaja plano (sin envoltura "data"), así que se reenvía a la API
    // quitando solo la clave "action" y los ids que van en la URL — preserva exactamente la
    // semántica de "actualización parcial" (clave ausente = no tocar ese campo) sin reconstruir
    // el body campo por campo. La decisión de previsualizar un adjunto vs. escribirlo a disco y
    // abrirlo con la app del sistema (Process.Start) sigue siendo responsabilidad del desktop —
    // la API solo entrega el contenido crudo en base64. Ver contex.md sobre la migración de
    // INNPACK a arquitectura API.
    public class ControlDocumentalHandler
    {
        private readonly InnpackControlDocumentalApiService _api;

        private static readonly JsonSerializerOptions _jsonOpts = new()
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        };

        public ControlDocumentalHandler(InnpackApiClient client)
        {
            _api = new InnpackControlDocumentalApiService(client);
        }

        public async Task<string> Handle(string action, Dictionary<string, object> data)
        {
            try
            {
                return action switch
                {
                    "controlDocumental.list" => await HandleList(data),
                    "controlDocumental.get" => await HandleGet(data),
                    "controlDocumental.create" => await HandleCreate(data),
                    "controlDocumental.update" => await HandleUpdate(data),
                    "controlDocumental.version.crear" => await HandleVersionCrear(data),
                    "controlDocumental.eliminar" => await HandleEliminar(data),
                    "controlDocumental.adjunto.subir" => await HandleAdjuntoSubir(data),
                    "controlDocumental.adjunto.abrir" => await HandleAdjuntoAbrir(data),
                    _ => Error($"Acción no reconocida en ControlDocumental: {action}"),
                };
            }
            catch (Exception ex)
            {
                return Error(ex.Message);
            }
        }

        private async Task<string> HandleList(Dictionary<string, object> data)
        {
            var page = TryGetInt(data, "page", out var p) && p > 0 ? p : 1;
            var pageSize = TryGetInt(data, "pageSize", out var ps) && ps > 0 ? ps : 50;

            TryGetString(data, "texto", out var texto);
            TryGetString(data, "tipoDocumento", out var tipoDocumento);
            TryGetString(data, "area", out var area);
            TryGetString(data, "estado", out var estado);
            TryGetString(data, "alcanceEmpresa", out var alcanceEmpresa);

            return await Forward(_api.ListAsync(page, pageSize, texto, tipoDocumento, area, estado, alcanceEmpresa));
        }

        private async Task<string> HandleGet(Dictionary<string, object> data)
        {
            if (!TryGetInt(data, "id", out var id))
                return Error("Falta el id del documento");

            return await Forward(_api.GetAsync(id));
        }

        private async Task<string> HandleCreate(Dictionary<string, object> data)
        {
            var body = BuildBody(data, "action");
            return await Forward(_api.CrearAsync(body));
        }

        private async Task<string> HandleUpdate(Dictionary<string, object> data)
        {
            if (!TryGetInt(data, "id", out var id))
                return Error("Falta el id del documento");

            var body = BuildBody(data, "action", "id");
            return await Forward(_api.ActualizarAsync(id, body));
        }

        private async Task<string> HandleVersionCrear(Dictionary<string, object> data)
        {
            if (!TryGetInt(data, "documentoId", out var documentoId))
                return Error("Falta el id del documento");

            var body = BuildBody(data, "action", "documentoId");
            return await Forward(_api.CrearVersionAsync(documentoId, body));
        }

        private async Task<string> HandleEliminar(Dictionary<string, object> data)
        {
            if (!TryGetInt(data, "id", out var id))
                return Error("Falta el id del documento");

            TryGetString(data, "actualizadoPor", out var actualizadoPor);
            return await Forward(_api.EliminarAsync(id, actualizadoPor));
        }

        private async Task<string> HandleAdjuntoSubir(Dictionary<string, object> data)
        {
            if (!TryGetInt(data, "documentoVersionId", out var versionId))
                return Error("Falta el id de la versión");

            var body = BuildBody(data, "action", "documentoVersionId");
            return await Forward(_api.SubirAdjuntoAsync(versionId, body));
        }

        // Imágenes/PDF: reenvía el base64 al frontend para previsualizar embebido (WebView2
        // renderiza PDF nativo vía data: URI). Word u otros no previsualizables: se escriben a una
        // carpeta temporal y se abren con la app del sistema — mismo patrón que UpdateService usa
        // para lanzar el instalador del auto-updater. Esta decisión no puede vivir en la API
        // (Process.Start es inherentemente local a la máquina del usuario).
        private async Task<string> HandleAdjuntoAbrir(Dictionary<string, object> data)
        {
            if (!TryGetInt(data, "documentoVersionId", out var versionId))
                return Error("Falta el id de la versión");

            var (ok, body) = await _api.ObtenerAdjuntoAsync(versionId);
            if (!TryUnwrapApiResponse(body, out var payload, out var error) || !ok)
                return Error(error);

            var nombreArchivo = payload.GetProperty("nombreArchivo").GetString() ?? "";
            var tipoMime = payload.GetProperty("tipoMime").GetString() ?? "";
            var contenidoBase64 = payload.GetProperty("contenidoBase64").GetString() ?? "";

            if (tipoMime.StartsWith("image/") || tipoMime == "application/pdf")
            {
                return Ok(
                    new
                    {
                        previsualizable = true,
                        nombreArchivo,
                        tipoMime,
                        contenidoBase64,
                    }
                );
            }

            var contenido = Convert.FromBase64String(contenidoBase64);
            var carpetaTemp = Path.Combine(Path.GetTempPath(), "QCC_ControlDocumental");
            Directory.CreateDirectory(carpetaTemp);
            var rutaArchivo = Path.Combine(carpetaTemp, $"{versionId}_{nombreArchivo}");
            await File.WriteAllBytesAsync(rutaArchivo, contenido);

            Process.Start(new ProcessStartInfo { FileName = rutaArchivo, UseShellExecute = true });

            return Ok(new { previsualizable = false, nombreArchivo });
        }

        // Copia el payload plano quitando las claves indicadas (siempre "action" + los ids que van
        // en la URL) — preserva exactamente qué claves llegaron del frontend, incluida la
        // semántica de "actualización parcial" de ControlDocumentalService en la API.
        private static Dictionary<string, object> BuildBody(Dictionary<string, object> data, params string[] excluir)
        {
            var excluidas = new HashSet<string>(excluir, StringComparer.OrdinalIgnoreCase);
            return data.Where(kv => !excluidas.Contains(kv.Key)).ToDictionary(kv => kv.Key, kv => kv.Value);
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

        private static bool TryGetString(Dictionary<string, object> data, string key, out string? value)
        {
            value = null;
            if (!data.TryGetValue(key, out var raw))
                return false;
            if (raw is JsonElement el)
            {
                if (el.ValueKind == JsonValueKind.Null)
                    return false;
                value = el.ValueKind == JsonValueKind.String ? el.GetString() : el.ToString();
                return true;
            }
            value = raw?.ToString();
            return value != null;
        }

        private static bool TryGetInt(Dictionary<string, object> data, string key, out int value)
        {
            value = 0;
            if (!data.TryGetValue(key, out var raw))
                return false;
            if (raw is JsonElement el && el.TryGetInt32(out value))
                return true;
            return int.TryParse(raw?.ToString(), out value);
        }

        private static string Ok(object? data) =>
            JsonSerializer.Serialize(new { ok = true, data, error = (string?)null }, _jsonOpts);

        private static string Error(string message) =>
            JsonSerializer.Serialize(new { ok = false, data = (object?)null, error = message }, _jsonOpts);
    }
}
