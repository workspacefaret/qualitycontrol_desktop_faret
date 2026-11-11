using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Threading.Tasks;
using QualityControlCenter.Backend.Services.InnpackApi;

namespace QualityControlCenter.Modules.EvaluacionOperadores
{
    // Módulo "Evaluación de Calidad por Operador" — INNPACK, SOLO LECTURA, indicador descriptivo.
    // No tiene endpoint propio en la API: reutiliza la lectura ya existente de No Conformidades
    // (GET api/no-conformidades, ámbito PRODUCTO, con el JWT de la sesión) y agrega en el desktop
    // (EvaluacionOperadoresCalculator, función pura). No toca SQL ni credenciales de BD, no escribe
    // nada y no reenvía filas crudas al frontend: solo agregados. Única acción:
    // evaluacionOperadores.resumen (lectura por sufijo en PermisosService).
    public class EvaluacionOperadoresHandler
    {
        private readonly InnpackNoConformidadesApiService _api;

        private static readonly JsonSerializerOptions _jsonOpts = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

        // verNombres: solo con permiso EDITAR del módulo (o ADMIN_TI). Con VER los operadores salen como OP-xxxxxx.
        private readonly bool _verNombres;
        private readonly string? _rutaAuditoria;

        public EvaluacionOperadoresHandler(InnpackApiClient innpackClient, bool verNombres = false, string? rutaAuditoria = null)
        {
            _api = new InnpackNoConformidadesApiService(innpackClient);
            _verNombres = verNombres;
            _rutaAuditoria = rutaAuditoria;
        }

        public async Task<string> Handle(string action, Dictionary<string, object> data)
        {
            try
            {
                return action switch
                {
                    "evaluacionOperadores.resumen" => await HandleResumen(data),
                    "evaluacionOperadores.auditoria.resumen" => HandleAuditoria(),
                    _ => Error($"Acción no reconocida en EvaluacionOperadores: {action}"),
                };
            }
            catch (Exception ex)
            {
                return Error(ex.Message);
            }
        }

        private async Task<string> HandleResumen(Dictionary<string, object> data)
        {
            int? anio = TryGetInt(data, "anio", out var a) ? a : null;
            int? mes = TryGetInt(data, "mes", out var m) ? m : null;
            if (anio is < 2000 or > 2100) return Error("Año inválido");
            if (mes is < 1 or > 12) return Error("Mes inválido");
            TryGetString(data, "maquina", out var maquina);
            TryGetString(data, "operador", out var operador);

            // ambito PRODUCTO + empresa INNPACK: la API incluye las filas legacy con empresa NULL y excluye FARET.
            var (ok, body) = await _api.ListAsync(1, 999999, "PRODUCTO", "INNPACK", null, null, null, null, null, null, null, null, null);
            if (!EvaluacionOperadoresParser.TryParseFilas(body, out var filas, out var error) || !ok)
                return Error(error);

            // Privacidad: sin permiso de nombres, los operadores se seudonimizan ANTES de calcular (el filtro por
            // operador recibe el mismo seudónimo que se le mostró).
            var visibles = EvaluacionOperadoresAuditoria.AplicarPrivacidad(filas, _verNombres);
            var resultado = EvaluacionOperadoresCalculator.Calcular(visibles, new EvaluacionFiltros(anio, mes, maquina, operador));
            return Ok(new { nombresVisibles = _verNombres, resultado });
        }

        // Resumen de la auditoría histórica FPS↔Calidad (archivo local agregado, sin nombres). No es un error que no exista.
        private string HandleAuditoria()
        {
            var (disponible, datos, error) = EvaluacionOperadoresAuditoria.Cargar(_rutaAuditoria);
            if (error != "") return Error(error);
            return Ok(new { disponible, auditoria = datos });
        }

        private static bool TryGetString(Dictionary<string, object> data, string key, out string? value)
        {
            value = null;
            if (!data.TryGetValue(key, out var raw)) return false;
            if (raw is JsonElement el)
            {
                if (el.ValueKind == JsonValueKind.Null) return false;
                value = el.ValueKind == JsonValueKind.String ? el.GetString() : el.ToString();
                return !string.IsNullOrWhiteSpace(value);
            }
            value = raw?.ToString();
            return !string.IsNullOrWhiteSpace(value);
        }

        private static bool TryGetInt(Dictionary<string, object> data, string key, out int value)
        {
            value = 0;
            if (!data.TryGetValue(key, out var raw)) return false;
            if (raw is JsonElement el)
            {
                if (el.ValueKind == JsonValueKind.Number) return el.TryGetInt32(out value);
                if (el.ValueKind == JsonValueKind.String) return int.TryParse(el.GetString(), out value);
                return false;
            }
            return int.TryParse(raw?.ToString(), out value);
        }

        private static string Ok(object? data) =>
            JsonSerializer.Serialize(new { ok = true, data, error = (string?)null }, _jsonOpts);

        private static string Error(string message) =>
            JsonSerializer.Serialize(new { ok = false, data = (object?)null, error = message }, _jsonOpts);
    }
}
