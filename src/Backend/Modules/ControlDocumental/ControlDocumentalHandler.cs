using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using QualityControlCenter.Repositories.ControlDocumental;
using QualityControlCenter.Services;

namespace QualityControlCenter.Modules.ControlDocumental
{
    // Módulo "Control Documental" — INNPACK, standalone (MySQL calidad).
    // Etapa 2: list/get/create/update + cambio de versión (ver contex-control-documental.md).
    public class ControlDocumentalHandler
    {
        private readonly ControlDocumentalRepository _repo;

        private static readonly JsonSerializerOptions _jsonOpts = new()
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        };

        private static readonly string[] EstadosValidos = { "VIGENTE", "EN_REVISION", "OBSOLETO" };
        private static readonly string[] AlcancesValidos = { "INNPACK", "FARET", "AMBAS" };

        public ControlDocumentalHandler(DbService db)
        {
            _repo = new ControlDocumentalRepository(db);
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

            var (items, total) = await _repo.Listar(page, pageSize, texto, tipoDocumento, area, estado, alcanceEmpresa);

            var pages = (int)Math.Ceiling(total / (double)pageSize);
            return Ok(
                new
                {
                    items,
                    total,
                    page,
                    pageSize,
                    pages,
                }
            );
        }

        private async Task<string> HandleGet(Dictionary<string, object> data)
        {
            if (!TryGetInt(data, "id", out var id))
                return Error("Falta el id del documento");

            var item = await _repo.ObtenerPorId(id);
            if (item == null)
                return Error("Documento no encontrado");

            return Ok(item);
        }

        private static Dictionary<string, object?> LeerCamposDocumento(Dictionary<string, object> data)
        {
            var campos = new Dictionary<string, object?>();
            foreach (var json in new[]
            {
                "codigoBase",
                "tipoDocumento",
                "area",
                "nombre",
                "alcanceEmpresa",
                "estado",
                "responsable",
                "ubicacion",
                "observaciones",
            })
            {
                if (!data.ContainsKey(json))
                    continue;
                TryGetString(data, json, out var str);
                campos[json] = string.IsNullOrWhiteSpace(str) ? null : str;
            }
            return campos;
        }

        private async Task<string> HandleCreate(Dictionary<string, object> data)
        {
            var campos = LeerCamposDocumento(data);
            TryGetString(data, "creadoPor", out var creadoPor);
            TryGetString(data, "version", out var version);
            TryGetString(data, "fechaActualizacion", out var fechaActualizacion);
            TryGetString(data, "proximaRevision", out var proximaRevision);

            if (!campos.TryGetValue("codigoBase", out var codigoBase) || string.IsNullOrWhiteSpace(codigoBase?.ToString()))
                return Error("Falta el código base del documento");
            if (!campos.TryGetValue("tipoDocumento", out var tipoDocumento) || string.IsNullOrWhiteSpace(tipoDocumento?.ToString()))
                return Error("Falta el tipo de documento");
            if (!campos.TryGetValue("nombre", out var nombre) || string.IsNullOrWhiteSpace(nombre?.ToString()))
                return Error("Falta el nombre del documento");
            if (string.IsNullOrWhiteSpace(version))
                return Error("Falta la versión inicial");
            if (string.IsNullOrWhiteSpace(fechaActualizacion))
                return Error("Falta la fecha de actualización de la versión inicial");

            if (
                campos.TryGetValue("estado", out var estadoVal)
                && estadoVal != null
                && !EstadosValidos.Contains(estadoVal.ToString())
            )
                return Error($"Estado inválido. Valores permitidos: {string.Join(", ", EstadosValidos)}");

            if (
                campos.TryGetValue("alcanceEmpresa", out var alcanceVal)
                && alcanceVal != null
                && !AlcancesValidos.Contains(alcanceVal.ToString())
            )
                return Error($"Alcance inválido. Valores permitidos: {string.Join(", ", AlcancesValidos)}");

            if (string.IsNullOrWhiteSpace(proximaRevision))
                proximaRevision = CalcularProximaRevision(fechaActualizacion!);

            var id = await _repo.Crear(campos, version!, fechaActualizacion!, proximaRevision, creadoPor);
            return Ok(new { id });
        }

        private async Task<string> HandleUpdate(Dictionary<string, object> data)
        {
            if (!TryGetInt(data, "id", out var id))
                return Error("Falta el id del documento");

            var campos = LeerCamposDocumento(data);
            if (campos.Count == 0)
                return Error("No se recibió ningún campo para actualizar");

            if (
                campos.TryGetValue("estado", out var estadoVal)
                && estadoVal != null
                && !EstadosValidos.Contains(estadoVal.ToString())
            )
                return Error($"Estado inválido. Valores permitidos: {string.Join(", ", EstadosValidos)}");

            if (
                campos.TryGetValue("alcanceEmpresa", out var alcanceVal)
                && alcanceVal != null
                && !AlcancesValidos.Contains(alcanceVal.ToString())
            )
                return Error($"Alcance inválido. Valores permitidos: {string.Join(", ", AlcancesValidos)}");

            TryGetString(data, "actualizadoPor", out var actualizadoPor);
            await _repo.Actualizar(id, campos, actualizadoPor);
            return Ok(new { id });
        }

        private async Task<string> HandleVersionCrear(Dictionary<string, object> data)
        {
            if (!TryGetInt(data, "documentoId", out var documentoId))
                return Error("Falta el id del documento");

            TryGetString(data, "version", out var version);
            TryGetString(data, "fechaActualizacion", out var fechaActualizacion);
            TryGetString(data, "proximaRevision", out var proximaRevision);
            TryGetString(data, "creadoPor", out var creadoPor);

            if (string.IsNullOrWhiteSpace(version))
                return Error("Falta la versión");
            if (string.IsNullOrWhiteSpace(fechaActualizacion))
                return Error("Falta la fecha de actualización");

            if (string.IsNullOrWhiteSpace(proximaRevision))
                proximaRevision = CalcularProximaRevision(fechaActualizacion!);

            var versionId = await _repo.CrearVersion(documentoId, version!, fechaActualizacion!, proximaRevision, creadoPor);
            return Ok(new { id = versionId });
        }

        // Replica la única fórmula viva del Excel original: próxima revisión = fecha última
        // actualización + 365 días (editable por el usuario si no aplica).
        private static string CalcularProximaRevision(string fechaActualizacion)
        {
            if (DateTime.TryParse(fechaActualizacion, out var fecha))
                return fecha.AddDays(365).ToString("yyyy-MM-dd");
            return fechaActualizacion;
        }

        // ---------- Helpers de payload (mismo patrón que NoConformidadesHandler / FaretHandler) ----------

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
