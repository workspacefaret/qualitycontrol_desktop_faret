using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Text.Json;
using System.Threading.Tasks;
using QualityControlCenter.Backend.Services.InnpackApi;

namespace QualityControlCenter.Modules.Formularios
{
    // Módulo "Formularios" (compartido INNPACK/Faret, solo lectura): formularios de
    // LogisticControlCenter (control_bins) leídos vía QualityControlInnpack.Api (api/formularios).
    // No hay escritura: los registra la app web de formularios. Las 3 acciones son lecturas
    // (.list/.detalle por sufijo, .abrirPdf en AccionesLectura de PermisosService).
    public class FormulariosHandler
    {
        private readonly InnpackFormulariosApiService _api;

        // Valor del frontend ("tipo") → segmento de ruta de la API. Lista cerrada: nada de lo que
        // llega del frontend se concatena a la URL sin pasar por acá.
        private static readonly Dictionary<string, string> Tipos = new()
        {
            ["inspeccionesVehiculares"] = "inspecciones-vehiculares",
            ["revisionCamionJornada"] = "revision-camion-jornada",
            ["checklistBodegaCajas"] = "checklist-bodega-cajas",
            ["revisionBodegaOficinas"] = "revision-bodega-oficinas",
        };

        // Los PDFs viven en la app web de formularios; solo se abre una URL https de ese host.
        private const string HostPdfPermitido = "solicitudes.faret.cl";

        private static readonly string[] CamposFiltro =
        {
            "fechaDesde",
            "fechaHasta",
            "patente",
            "conductor",
            "responsable",
            "estado",
        };

        private static readonly JsonSerializerOptions _jsonOpts = new()
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        };

        public FormulariosHandler(InnpackApiClient innpackClient)
        {
            _api = new InnpackFormulariosApiService(innpackClient);
        }

        public async Task<string> Handle(string action, Dictionary<string, object> data)
        {
            try
            {
                return action switch
                {
                    "formularios.list" => await HandleList(data),
                    "formularios.detalle" => await HandleDetalle(data),
                    "formularios.abrirPdf" => HandleAbrirPdf(data),
                    _ => Error($"Acción no reconocida en Formularios: {action}"),
                };
            }
            catch (Exception ex)
            {
                return Error(ex.Message);
            }
        }

        private async Task<string> HandleList(Dictionary<string, object> data)
        {
            var payload = GetDataElement(data);

            if (!TryGetTipo(payload, out var tipo))
                return Error("Formulario no soportado");

            var filtros = new Dictionary<string, string>();
            foreach (var campo in CamposFiltro)
                filtros[campo] = GetString(payload, campo);

            var (ok, body) = await _api.ListAsync(tipo, filtros);
            return Unwrap(ok, body);
        }

        private async Task<string> HandleDetalle(Dictionary<string, object> data)
        {
            var payload = GetDataElement(data);

            if (!TryGetTipo(payload, out var tipo))
                return Error("Formulario no soportado");

            if (tipo == "revision-camion-jornada")
                return Error("Este formulario no tiene detalle");

            if (!int.TryParse(GetString(payload, "id"), out var id) || id <= 0)
                return Error("ID de registro inválido");

            var (ok, body) = await _api.DetalleAsync(tipo, id);
            return Unwrap(ok, body);
        }

        // Abrir un PDF con el visor del sistema es local a la máquina del usuario (Process.Start),
        // no pasa por la API. Solo https hacia el host de la app web de formularios.
        private static string HandleAbrirPdf(Dictionary<string, object> data)
        {
            var url = GetString(GetDataElement(data), "url");

            if (
                !Uri.TryCreate(url, UriKind.Absolute, out var uri)
                || uri.Scheme != Uri.UriSchemeHttps
                || !string.Equals(uri.Host, HostPdfPermitido, StringComparison.OrdinalIgnoreCase)
            )
                return Error("URL de PDF inválida");

            Process.Start(
                new ProcessStartInfo { FileName = uri.AbsoluteUri, UseShellExecute = true }
            );
            return Ok(new { abierto = true });
        }

        // ---------- Helpers ----------

        private static bool TryGetTipo(JsonElement payload, out string tipo)
        {
            tipo = "";
            return Tipos.TryGetValue(GetString(payload, "tipo"), out tipo!);
        }

        // Desenvuelve ApiResponse<T> {success,message,data,errors} de QualityControlInnpack.Api —
        // mismo criterio que NoConformidadesHandler/UsuariosHandler.
        private static string Unwrap(bool ok, string body)
        {
            const string errorGenerico = "Error al comunicarse con la API Innpack";

            try
            {
                using var doc = JsonDocument.Parse(body);
                var root = doc.RootElement;

                if (!root.TryGetProperty("success", out var s) || !s.GetBoolean() || !ok)
                {
                    var msg = root.TryGetProperty("message", out var m) ? m.GetString() : null;
                    return Error(string.IsNullOrWhiteSpace(msg) ? errorGenerico : msg);
                }

                return Ok(
                    root.TryGetProperty("data", out var d)
                        ? JsonSerializer.Deserialize<object>(d.GetRawText())
                        : null
                );
            }
            catch
            {
                return Error(errorGenerico);
            }
        }

        private static JsonElement GetDataElement(Dictionary<string, object> data)
        {
            if (data.TryGetValue("data", out var rawData) && rawData is JsonElement jsonData)
                return jsonData;

            return default;
        }

        // Los valores llegan como JsonElement; un número (ej. id) no se puede leer con GetString().
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

        private static string Ok(object? data) =>
            JsonSerializer.Serialize(
                new
                {
                    ok = true,
                    data,
                    error = (string?)null,
                },
                _jsonOpts
            );

        private static string Error(string message) =>
            JsonSerializer.Serialize(
                new
                {
                    ok = false,
                    data = (object?)null,
                    error = message,
                },
                _jsonOpts
            );
    }
}
