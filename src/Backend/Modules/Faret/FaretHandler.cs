using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Threading.Tasks;
using QualityControlCenter.Backend.Services.FaretApi;

namespace QualityControlCenter.Modules.Faret
{
    public class FaretHandler
    {
        private readonly FaretApiClient _client;
        private readonly FaretAuthApiService _auth;
        private readonly FaretCatalogosApiService _catalogos;
        private readonly FaretRegistrosControlApiService _registros;
        private readonly FaretImportacionApiService _importacion;

        private static readonly JsonSerializerOptions _jsonOpts = new()
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        };

        public FaretHandler(FaretApiClient client)
        {
            _client = client;
            _auth = new FaretAuthApiService(client);
            _catalogos = new FaretCatalogosApiService(client);
            _registros = new FaretRegistrosControlApiService(client);
            _importacion = new FaretImportacionApiService(client);
        }

        public async Task<string> Handle(string action, Dictionary<string, object> data)
        {
            if (!_client.IsConfigured)
                return Error("API Faret no configurada. Revise config.json");

            return action switch
            {
                "faret.login" => await HandleLogin(data),
                "faret.logout" => HandleLogout(),
                "faret.health" => await HandleHealth(),
                "faret.catalogos.areas" => await HandleCatalogo(_catalogos.GetAreasAsync),
                "faret.catalogos.inspectores" => await HandleCatalogo(_catalogos.GetInspectoresAsync),
                "faret.catalogos.operadores" => await HandleCatalogo(_catalogos.GetOperadoresAsync),
                "faret.catalogos.maquinas" => await HandleCatalogo(_catalogos.GetMaquinasAsync),
                "faret.catalogos.defectos" => await HandleCatalogo(_catalogos.GetDefectosAsync),
                "faret.registros.list" => await HandleRegistrosList(),
                "faret.registros.get" => await HandleRegistrosGet(data),
                "faret.importacion.validar" => await HandleImportacionValidar(data),
                "faret.importacion.confirmar" => await HandleImportacionConfirmar(data),
                "faret.importacion.list" => await HandleImportacionList(),
                "faret.data.list" => await HandleDataList(data),
                "faret.data.resumen" => await HandleDataResumen(data),
                _ => Error($"Acción Faret no reconocida: {action}"),
            };
        }

        private async Task<string> HandleLogin(Dictionary<string, object> data)
        {
            if (!TryGetString(data, "identificador", out var identificador) || string.IsNullOrEmpty(identificador))
                return Error("Falta identificador");

            if (!TryGetString(data, "password", out var password) || string.IsNullOrEmpty(password))
                return Error("Falta password");

            var (ok, loginData, error) = await _auth.LoginAsync(identificador, password);
            if (!ok)
                return Error(error ?? "Login fallido");

            return Ok(new
            {
                username = loginData!.Username,
                role = loginData.Role,
            });
        }

        private string HandleLogout()
        {
            _auth.Logout();
            return Ok(new { message = "Sesión Faret cerrada" });
        }

        private async Task<string> HandleHealth()
        {
            var (ok, body) = await _client.GetAsync("api/health");
            if (!ok)
                return Error("API Faret sin conexión");

            return Ok(new { status = "conectado", detalle = body });
        }

        private async Task<string> HandleCatalogo(Func<Task<(bool ok, string body)>> fetch)
        {
            if (!_client.HasToken)
                return Error("No autenticado en API Faret");

            var (ok, body) = await fetch();
            if (!ok)
            {
                string msg = "Error al obtener catálogo";
                try
                {
                    using var errDoc = JsonDocument.Parse(body);
                    if (errDoc.RootElement.TryGetProperty("error", out var e))
                        msg = e.GetString() ?? msg;
                }
                catch { }
                return Error(msg);
            }

            var parsed = JsonSerializer.Deserialize<object>(body);
            return Ok(parsed);
        }

        private async Task<string> HandleRegistrosList()
        {
            if (!_client.HasToken)
                return Error("No autenticado en API Faret");

            var (ok, body) = await _registros.GetListAsync();
            if (!ok)
            {
                string msg = "Error al obtener registros";
                try
                {
                    using var errDoc = JsonDocument.Parse(body);
                    if (errDoc.RootElement.TryGetProperty("error", out var e))
                        msg = e.GetString() ?? msg;
                }
                catch { }
                return Error(msg);
            }

            var parsed = JsonSerializer.Deserialize<object>(body);
            return Ok(parsed);
        }

        private async Task<string> HandleRegistrosGet(Dictionary<string, object> data)
        {
            if (!_client.HasToken)
                return Error("No autenticado en API Faret");

            if (!TryGetInt(data, "id", out var id))
                return Error("Falta id del registro");

            var (ok, body) = await _registros.GetByIdAsync(id);
            if (!ok)
            {
                string msg = "Error al obtener registro";
                try
                {
                    using var errDoc = JsonDocument.Parse(body);
                    if (errDoc.RootElement.TryGetProperty("error", out var e))
                        msg = e.GetString() ?? msg;
                }
                catch { }
                return Error(msg);
            }

            var parsed = JsonSerializer.Deserialize<object>(body);
            return Ok(parsed);
        }

        private async Task<string> HandleImportacionValidar(Dictionary<string, object> data)
        {
            if (!_client.HasToken)
                return Error("No autenticado en API Faret");

            if (!TryGetString(data, "fileName", out var fileName) || string.IsNullOrEmpty(fileName))
                return Error("Falta fileName");

            if (!TryGetString(data, "base64", out var base64) || string.IsNullOrEmpty(base64))
                return Error("Falta el contenido del archivo (base64)");

            byte[] bytes;
            try
            {
                bytes = Convert.FromBase64String(base64);
            }
            catch (FormatException)
            {
                return Error("Archivo inválido (base64 corrupto)");
            }

            var (ok, body) = await _importacion.ValidarAsync(fileName, bytes);
            if (!TryUnwrapApiResponse(body, out var payload, out var error) || !ok)
                return Error(error);

            return Ok(JsonSerializer.Deserialize<object>(payload.GetRawText()));
        }

        private async Task<string> HandleImportacionConfirmar(Dictionary<string, object> data)
        {
            if (!_client.HasToken)
                return Error("No autenticado en API Faret");

            if (!TryGetString(data, "loteId", out var loteId) || string.IsNullOrEmpty(loteId))
                return Error("Falta loteId");

            var (ok, body) = await _importacion.ConfirmarAsync(loteId);
            if (!TryUnwrapApiResponse(body, out var payload, out var error) || !ok)
                return Error(error);

            return Ok(JsonSerializer.Deserialize<object>(payload.GetRawText()));
        }

        private async Task<string> HandleImportacionList()
        {
            if (!_client.HasToken)
                return Error("No autenticado en API Faret");

            var (ok, body) = await _importacion.GetListAsync();
            if (!TryUnwrapApiResponse(body, out var payload, out var error) || !ok)
                return Error(error);

            return Ok(JsonSerializer.Deserialize<object>(payload.GetRawText()));
        }

        private async Task<string> HandleDataList(Dictionary<string, object> data)
        {
            if (!_client.HasToken)
                return Error("No autenticado en API Faret");

            var filtros = BuildDataFiltros(data);
            if (TryGetInt(data, "page", out var page) && page > 0)
                filtros["page"] = page.ToString();
            if (TryGetInt(data, "pageSize", out var pageSize) && pageSize > 0)
                filtros["pageSize"] = pageSize.ToString();

            var (ok, body) = await _importacion.GetPncListAsync(filtros);
            if (!TryUnwrapApiResponse(body, out var payload, out var error) || !ok)
                return Error(error);

            return Ok(JsonSerializer.Deserialize<object>(payload.GetRawText()));
        }

        private async Task<string> HandleDataResumen(Dictionary<string, object> data)
        {
            if (!_client.HasToken)
                return Error("No autenticado en API Faret");

            var filtros = BuildDataFiltros(data);

            var (ok, body) = await _importacion.GetPncResumenAsync(filtros);
            if (!TryUnwrapApiResponse(body, out var payload, out var error) || !ok)
                return Error(error);

            return Ok(JsonSerializer.Deserialize<object>(payload.GetRawText()));
        }

        private static Dictionary<string, string?> BuildDataFiltros(Dictionary<string, object> data)
        {
            var filtros = new Dictionary<string, string?>();

            TryGetString(data, "cliente", out var cliente);
            TryGetString(data, "tipoPnc", out var tipoPnc);
            TryGetString(data, "nivel", out var nivel);
            TryGetString(data, "fechaDesde", out var fechaDesde);
            TryGetString(data, "fechaHasta", out var fechaHasta);

            filtros["cliente"] = cliente;
            filtros["tipoPnc"] = tipoPnc;
            filtros["nivel"] = nivel;
            filtros["fechaDesde"] = fechaDesde;
            filtros["fechaHasta"] = fechaHasta;

            return filtros;
        }

        // La API Faret responde con ApiResponse<T> { success, message, data, errors } o,
        // en errores generados por el cliente HTTP local (timeout/red), { ok, error }.
        private static bool TryUnwrapApiResponse(string body, out JsonElement data, out string error)
        {
            data = default;
            error = "Error al comunicarse con la API Faret";
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
                    return false;
                }

                if (root.TryGetProperty("error", out var e))
                {
                    error = e.GetString() ?? error;
                    return false;
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
            if (!data.TryGetValue(key, out var raw)) return false;
            if (raw is JsonElement el) { value = el.GetString(); return true; }
            value = raw?.ToString();
            return value != null;
        }

        private static bool TryGetInt(Dictionary<string, object> data, string key, out int value)
        {
            value = 0;
            if (!data.TryGetValue(key, out var raw)) return false;
            if (raw is JsonElement el && el.TryGetInt32(out value)) return true;
            return int.TryParse(raw?.ToString(), out value);
        }

        private string Ok(object? data) =>
            JsonSerializer.Serialize(new { ok = true, data }, _jsonOpts);

        private string Error(string message) =>
            JsonSerializer.Serialize(new { ok = false, error = message }, _jsonOpts);
    }
}
