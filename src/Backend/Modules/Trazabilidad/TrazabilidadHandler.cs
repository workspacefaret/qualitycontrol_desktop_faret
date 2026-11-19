using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using QualityControlCenter.Backend.Services.FpsApi;
using QualityControlCenter.Backend.Services.InnpackApi;
using QualityControlCenter.Backend.Services.PlanificacionApi;

namespace QualityControlCenter.Modules.Trazabilidad
{
    // Módulo de solo consulta (INNPACK): NP en Planificación FARET (programa-produccion, vía API,
    // sin auth) + materiales por proceso (fps-api, Tipo='INSUMO' en FPS_PRODUCCION) + paletizado
    // en registro_paletizado (migrado a QualityControlInnpack.Api, ya no MySQL directo desde el
    // desktop). No inserta ni recalcula nada — ver contex.md para el detalle de arquitectura.
    public class TrazabilidadHandler
    {
        private readonly TrazabilidadService _service;
        private readonly FpsTrazabilidadApiService? _fpsTrazabilidad;
        private readonly InnpackTrazabilidadDocumentosApiService _docs;

        private static readonly JsonSerializerOptions _jsonOptions = new()
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        };

        public TrazabilidadHandler(
            InnpackApiClient innpackClient,
            PlanificacionApiClient planificacionClient,
            FpsMaterialesApiService fpsMaterialesClient,
            FpsTrazabilidadApiService? fpsTrazabilidad = null
        )
        {
            _fpsTrazabilidad = fpsTrazabilidad;
            _docs = new InnpackTrazabilidadDocumentosApiService(innpackClient);
            _service = new TrazabilidadService(
                planificacionClient,
                fpsMaterialesClient,
                new InnpackTrazabilidadApiService(innpackClient)
            );
        }

        public async Task<string> Handle(string action, Dictionary<string, object> data)
        {
            try
            {
                if (action == "trazabilidad.consultarNp")
                {
                    var jsonData = GetDataElement(data);
                    var np = GetString(jsonData, "np").Trim();

                    if (string.IsNullOrEmpty(np))
                        return Error("Debes indicar el NP a consultar");

                    var (ok, procesos, paletizado, error) = await _service.ConsultarNpAsync(np);
                    if (!ok)
                        return Error(error ?? "No se pudo consultar Planificación FARET");

                    return Ok(
                        new
                        {
                            np,
                            procesos,
                            paletizado,
                            avisoPlanificacion = error, // aviso no bloqueante (ej. API no configurada)
                        }
                    );
                }

                // Trazabilidad integral (Fase 1a, solo lectura): NP completa o búsqueda inversa por lote,
                // ambas desde fps-api (FPS + SAP + liberaciones QCS). Los registros de Calidad los pide
                // el frontend a sus propias acciones (registrosControl / productoTerminado).
                if (action == "trazabilidad.integral" || action == "trazabilidad.lote")
                {
                    if (_fpsTrazabilidad is null)
                        return Error("La trazabilidad integral no está disponible en esta instalación.");

                    var jsonData = GetDataElement(data);
                    string estado;
                    JsonElement resultado;
                    string? error;
                    if (action == "trazabilidad.integral")
                    {
                        var np = GetString(jsonData, "np").Trim();
                        if (!FpsTrazabilidadApiService.NpValido(np))
                            return Error("Debes indicar un NP numérico válido.");
                        (estado, resultado, error) = await _fpsTrazabilidad.ObtenerNpAsync(np);
                    }
                    else
                    {
                        var lote = GetString(jsonData, "lote").Trim();
                        if (!FpsTrazabilidadApiService.LoteValido(lote))
                            return Error("Lote inválido: hasta 36 caracteres (letras, números, punto, guion, barra o guion bajo).");
                        (estado, resultado, error) = await _fpsTrazabilidad.ObtenerLoteAsync(lote);
                    }

                    if (estado != "OK")
                        return Error(error ?? "No se pudo consultar FPS.");
                    return Ok(resultado);
                }

                // Formato oficial REG-SGI-TDP-V05: el frontend manda el modelo ya armado (mismo del PDF); aquí solo se dibuja.
                if (action == "trazabilidad.exportarV05Excel")
                {
                    var modelo = GetDataElement(data);
                    var np = GetString(modelo, "np").Trim();
                    if (!NpRegex.IsMatch(np))
                        return Error("Debes indicar una NP válida (letras, números, punto o guion, hasta 40 caracteres).");
                    var bytes = TrazabilidadV05Excel.Construir(modelo);
                    return Ok(new { fileName = $"REG-SGI-TDP-V05_NP{np}.xlsx", base64 = Convert.ToBase64String(bytes) });
                }

                // Fase 1b: panel documental SGI y factor unidades/pliego (API INNPACK, tablas trazabilidad_*).
                if (
                    action.StartsWith("trazabilidad.documentos.")
                    || action.StartsWith("trazabilidad.factor.")
                    || action == "trazabilidad.auditoria.list"
                )
                    return await HandleDocumentos(action, GetDataElement(data));

                return Error($"Acción no reconocida: {action}");
            }
            catch (Exception ex)
            {
                return Error($"Error interno: {ex.Message}");
            }
        }

        // ── Fase 1b: documentos SGI y factor ─────────────────────────────────────────────────

        private static readonly Regex NpRegex = new(@"^[0-9A-Za-z._-]{1,40}$", RegexOptions.Compiled);
        private static readonly string[] CamposSubida =
        {
            "requisitoId", "estado", "nombreArchivo", "contenidoBase64", "fechaDocumento", "lote", "observacion",
        };

        private async Task<string> HandleDocumentos(string action, JsonElement d)
        {
            var np = GetString(d, "np").Trim();
            var necesitaNp = action is not ("trazabilidad.documentos.abrir" or "trazabilidad.documentos.anular"
                or "trazabilidad.factor.confirmar" or "trazabilidad.factor.rechazar");
            if (necesitaNp && !NpRegex.IsMatch(np))
                return Error("Debes indicar una NP válida (letras, números, punto o guion, hasta 40 caracteres).");

            switch (action)
            {
                case "trazabilidad.documentos.list":
                    return await Forward(_docs.ListarAsync(np));
                case "trazabilidad.documentos.historial":
                    if (!TryGetId(d, "requisitoId", out var requisitoId))
                        return Error("Falta el requisito documental.");
                    return await Forward(_docs.HistorialAsync(np, requisitoId));
                case "trazabilidad.documentos.subir":
                {
                    var body = new Dictionary<string, object>();
                    foreach (var campo in CamposSubida)
                        if (d.TryGetProperty(campo, out var v) && v.ValueKind != JsonValueKind.Null)
                            body[campo] = v.Clone();
                    return await Forward(_docs.SubirAsync(np, body));
                }
                case "trazabilidad.documentos.anular":
                    if (!TryGetId(d, "id", out var docId))
                        return Error("Falta el documento.");
                    return await Forward(_docs.AnularAsync(docId, new Dictionary<string, object> { ["motivo"] = GetString(d, "motivo") }));
                case "trazabilidad.documentos.abrir":
                    return await AbrirDocumento(d);
                case "trazabilidad.documentos.zip":
                    return await GuardarZip(np);
                case "trazabilidad.factor.list":
                    return await Forward(_docs.FactoresAsync(np));
                case "trazabilidad.factor.proponer":
                {
                    var body = new Dictionary<string, object>();
                    foreach (var campo in new[] { "item", "unidadesPorPliego", "origen", "referenciaFps", "observacion" })
                        if (d.TryGetProperty(campo, out var v) && v.ValueKind != JsonValueKind.Null)
                            body[campo] = v.Clone();
                    return await Forward(_docs.ProponerFactorAsync(np, body));
                }
                case "trazabilidad.factor.confirmar":
                    if (!TryGetId(d, "id", out var fId))
                        return Error("Falta el factor.");
                    return await Forward(_docs.ConfirmarFactorAsync(fId));
                case "trazabilidad.factor.rechazar":
                    if (!TryGetId(d, "id", out var fIdR))
                        return Error("Falta el factor.");
                    return await Forward(_docs.RechazarFactorAsync(fIdR, new Dictionary<string, object> { ["motivo"] = GetString(d, "motivo") }));
                case "trazabilidad.auditoria.list":
                    return await Forward(_docs.AuditoriaAsync(np));
                default:
                    return Error($"Acción no reconocida: {action}");
            }
        }

        // Escribe el archivo a una carpeta temporal y lo abre con la app del sistema (mismo patrón que
        // Control Documental para formatos no embebibles). El nombre se reduce a nombre de archivo.
        private async Task<string> AbrirDocumento(JsonElement d)
        {
            if (!TryGetId(d, "id", out var id))
                return Error("Falta el documento.");
            var (ok, body) = await _docs.ArchivoAsync(id);
            if (!TryUnwrap(body, out var payload, out var error) || !ok)
                return Error(error);

            var nombre = Path.GetFileName(payload.GetProperty("nombreArchivo").GetString() ?? "documento");
            var contenido = Convert.FromBase64String(payload.GetProperty("contenidoBase64").GetString() ?? "");
            var carpeta = Path.Combine(Path.GetTempPath(), "QCC_Trazabilidad");
            Directory.CreateDirectory(carpeta);
            var ruta = Path.Combine(carpeta, $"{id}_{nombre}");
            await File.WriteAllBytesAsync(ruta, contenido);
            Process.Start(new ProcessStartInfo { FileName = ruta, UseShellExecute = true });
            return Ok(new { nombreArchivo = nombre });
        }

        // Guarda el ZIP en Descargas (nunca sobrescribe) y lo muestra en el Explorador.
        private async Task<string> GuardarZip(string np)
        {
            var (ok, body) = await _docs.ZipAsync(np);
            if (!TryUnwrap(body, out var payload, out var error) || !ok)
                return Error(error);

            var nombre = Path.GetFileName(payload.GetProperty("nombreArchivo").GetString() ?? $"Trazabilidad_NP{np}.zip");
            var contenido = Convert.FromBase64String(payload.GetProperty("contenidoBase64").GetString() ?? "");
            var destino = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads");
            if (!Directory.Exists(destino))
                destino = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);

            if (DirectorioPruebas != null)
                destino = DirectorioPruebas;

            var ruta = Path.Combine(destino, nombre);
            var baseName = Path.GetFileNameWithoutExtension(nombre);
            for (var n = 2; File.Exists(ruta); n++)
                ruta = Path.Combine(destino, $"{baseName}_{DateTime.Now:yyyyMMdd_HHmmss}_{n}.zip");
            await File.WriteAllBytesAsync(ruta, contenido);

            if (DirectorioPruebas == null)
                Process.Start(new ProcessStartInfo { FileName = "explorer.exe", Arguments = $"/select,\"{ruta}\"", UseShellExecute = true });

            return Ok(new
            {
                ruta,
                incluidos = payload.GetProperty("incluidos").GetInt32(),
                faltantes = payload.GetProperty("faltantes").GetInt32(),
            });
        }

        // Solo para pruebas locales: evita abrir el Explorador.
        internal static string? DirectorioPruebas { get; set; }

        private static bool TryGetId(JsonElement obj, string prop, out int id)
        {
            id = 0;
            if (obj.ValueKind != JsonValueKind.Object || !obj.TryGetProperty(prop, out var v))
                return false;
            return v.ValueKind == JsonValueKind.Number
                ? v.TryGetInt32(out id) && id > 0
                : v.ValueKind == JsonValueKind.String && int.TryParse(v.GetString(), out id) && id > 0;
        }

        private static async Task<string> Forward(Task<(bool ok, string body)> call)
        {
            var (ok, body) = await call;
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

        private static JsonElement GetDataElement(Dictionary<string, object> data)
        {
            if (data.TryGetValue("data", out var rawData) && rawData is JsonElement jsonData)
                return jsonData;

            return default;
        }

        private static string GetString(JsonElement obj, string prop)
        {
            if (obj.ValueKind != JsonValueKind.Object)
                return "";

            if (!obj.TryGetProperty(prop, out var value))
                return "";

            return value.ValueKind switch
            {
                JsonValueKind.String => value.GetString() ?? "",
                JsonValueKind.Number => value.ToString(),
                _ => "",
            };
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
