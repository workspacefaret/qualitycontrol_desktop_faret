using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Threading.Tasks;
using QualityControlCenter.Backend.Services.FaretApi;
using QualityControlCenter.Backend.Services.InnpackApi;

namespace QualityControlCenter.Modules.AlertasAtendidas
{
    // Alertas globales (Inicio Faret): registro central de alertas atendidas en api/alertas-atendidas de la API INNPACK
    // (tabla alertas_atendidas). Passthrough delgado: la API guarda quién/cuándo/qué huella y es idempotente. Marcar una
    // alerta NUNCA modifica el registro de negocio (no cierra NC, no aprueba documentos). `atendidaPor` lo informa el
    // NO se envía: la API verifica la identidad real. En sesión Faret se reenvía el JWT del usuario en X-Faret-User-Token
    // (la API lo valida contra la API Faret y exige EDITAR sobre el módulo de la alerta); en sesión INNPACK basta el JWT propio.
    // La empresa sale de la SESIÓN, nunca del frontend.
    public class AlertasAtendidasHandler
    {
        private const string Base = "api/alertas-atendidas";
        private static readonly HashSet<string> TiposValidos = new() { "doc", "pnc", "nci" };
        private static readonly JsonSerializerOptions _jsonOptions = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

        private readonly InnpackApiClient _client;
        private readonly FaretApiClient _faret;
        private readonly string _empresa;

        public AlertasAtendidasHandler(InnpackApiClient client, FaretApiClient faret, string? empresa)
        {
            _client = client;
            _faret = faret;
            _empresa = (empresa ?? "").ToUpperInvariant();
        }

        public async Task<string> Handle(string action, Dictionary<string, object> data)
        {
            try
            {
                if (_empresa != "FARET" && _empresa != "INNPACK")
                    return Error("Sesión no válida: inicia sesión nuevamente.");
                var d = data.TryGetValue("data", out var raw) && raw is JsonElement e ? e : default;
                switch (action)
                {
                    case "alertasAtendidas.list":
                    {
                        var tipos = GetString(d, "tipos");
                        var url = $"{Base}?empresa={_empresa}" + (tipos.Length > 0 ? $"&tipos={Uri.EscapeDataString(tipos)}" : "");
                        var (ok, body) = await _client.GetAsync(url);
                        return Forward(ok, body);
                    }
                    case "alertasAtendidas.marcar":
                    {
                        var tipo = GetString(d, "tipoAlerta").ToLowerInvariant();
                        if (!TiposValidos.Contains(tipo))
                            return Error("Tipo de alerta no válido.");
                        if (GetString(d, "registroId").Length == 0 || GetString(d, "huella").Length == 0)
                            return Error("Falta el registro o la huella de la alerta.");
                        var cuerpo = new Dictionary<string, object>
                        {
                            ["tipoAlerta"] = tipo,
                            ["registroId"] = GetString(d, "registroId"),
                            ["huella"] = GetString(d, "huella"),
                        };
                        IReadOnlyDictionary<string, string>? cab = null;
                        if (_empresa == "FARET")
                        {
                            var tok = _faret.CurrentToken;
                            if (string.IsNullOrEmpty(tok))
                                return Error("Sesión Faret expirada. Vuelve a iniciar sesión.");
                            cab = new Dictionary<string, string> { ["X-Faret-User-Token"] = tok };
                        }
                        var (ok, body) = await _client.PostJsonAsync(Base, cuerpo, cab);
                        return Forward(ok, body);
                    }
                    default:
                        return Error($"Acción no reconocida: {action}");
                }
            }
            catch (Exception ex)
            {
                return Error(ex.Message);
            }
        }

        private static string Forward(bool ok, string body)
        {
            try
            {
                using var doc = JsonDocument.Parse(body);
                var root = doc.RootElement;
                if (!ok || !root.TryGetProperty("success", out var s) || !s.GetBoolean())
                    return Error(root.TryGetProperty("message", out var m) && m.ValueKind == JsonValueKind.String ? m.GetString()! : "Error al comunicarse con la API Innpack");
                var payload = root.TryGetProperty("data", out var dt) ? JsonSerializer.Deserialize<object>(dt.GetRawText()) : null;
                return Ok(payload);
            }
            catch
            {
                return Error("Error al comunicarse con la API Innpack");
            }
        }

        private static string GetString(JsonElement obj, string prop)
        {
            if (obj.ValueKind != JsonValueKind.Object || !obj.TryGetProperty(prop, out var v))
                return "";
            return v.ValueKind switch
            {
                JsonValueKind.String => (v.GetString() ?? "").Trim(),
                JsonValueKind.Number => v.ToString(),
                _ => "",
            };
        }

        private static string Ok(object? data) => JsonSerializer.Serialize(new { ok = true, data, error = (string?)null }, _jsonOptions);

        private static string Error(string message) => JsonSerializer.Serialize(new { ok = false, data = (object?)null, error = message }, _jsonOptions);
    }
}
