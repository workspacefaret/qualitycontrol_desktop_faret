using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using QualityControlCenter.Repositories.NoConformidades;
using QualityControlCenter.Services;

namespace QualityControlCenter.Modules.NoConformidades
{
    // Módulo "No Conformidades" — INNPACK, standalone (MySQL calidad, sin relación con Faret).
    public class NoConformidadesHandler
    {
        private readonly NoConformidadesRepository _repo;

        private static readonly JsonSerializerOptions _jsonOpts = new()
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        };

        private static readonly string[] NivelesValidos = { "Crítico", "Mayor", "Menor" };
        private static readonly string[] EstadosGestionValidos =
        {
            "PENDIENTE",
            "ASIGNADA",
            "EN_GESTION",
            "CERRADA",
        };
        private static readonly string[] MetodologiasValidas = { "CINCO_PORQUES", "ISHIKAWA", "MIXTA" };
        private static readonly string[] EstadosAccionValidos =
        {
            "PENDIENTE",
            "EN_PROCESO",
            "COMPLETADA",
            "CANCELADA",
        };

        public NoConformidadesHandler(DbService db)
        {
            _repo = new NoConformidadesRepository(db);
        }

        public async Task<string> Handle(string action, Dictionary<string, object> data)
        {
            try
            {
                return action switch
                {
                    "noConformidades.list" => await HandleList(data),
                    "noConformidades.resumen" => await HandleResumen(data),
                    "noConformidades.filtrosOpciones" => await HandleFiltrosOpciones(),
                    "noConformidades.get" => await HandleGet(data),
                    "noConformidades.create" => await HandleCreate(data),
                    "noConformidades.update" => await HandleUpdate(data),
                    "noConformidades.gestion.actualizar" => await HandleGestionActualizar(data),
                    "noConformidades.cerrar" => await HandleCerrar(data),
                    "noConformidades.seguimiento.list" => await HandleSeguimientoList(data),
                    "noConformidades.seguimiento.crear" => await HandleSeguimientoCrear(data),
                    "noConformidades.analisis.get" => await HandleAnalisisGet(data),
                    "noConformidades.analisis.guardar" => await HandleAnalisisGuardar(data),
                    "noConformidades.acciones.list" => await HandleAccionesList(data),
                    "noConformidades.acciones.crear" => await HandleAccionesCrear(data),
                    "noConformidades.acciones.actualizar" => await HandleAccionesActualizar(data),
                    _ => Error($"Acción no reconocida en NoConformidades: {action}"),
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

            var (cliente, tipoPnc, nivel, estadoGestion, responsable, fechaDesde, fechaHasta) =
                LeerFiltros(data);

            var (items, total) = await _repo.Listar(
                page,
                pageSize,
                cliente,
                tipoPnc,
                nivel,
                estadoGestion,
                responsable,
                fechaDesde,
                fechaHasta
            );

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

        private async Task<string> HandleResumen(Dictionary<string, object> data)
        {
            var (cliente, tipoPnc, nivel, estadoGestion, responsable, fechaDesde, fechaHasta) =
                LeerFiltros(data);

            var resumen = await _repo.ObtenerResumen(
                cliente,
                tipoPnc,
                nivel,
                estadoGestion,
                responsable,
                fechaDesde,
                fechaHasta
            );
            return Ok(resumen);
        }

        private async Task<string> HandleFiltrosOpciones()
        {
            var opciones = await _repo.ObtenerFiltrosOpciones();
            return Ok(opciones);
        }

        private async Task<string> HandleGet(Dictionary<string, object> data)
        {
            if (!TryGetInt(data, "id", out var id))
                return Error("Falta el id de la no conformidad");

            var item = await _repo.ObtenerPorId(id);
            if (item == null)
                return Error("No conformidad no encontrada");

            return Ok(item);
        }

        private static (
            string? Cliente,
            string? TipoPnc,
            string? Nivel,
            string? EstadoGestion,
            string? Responsable,
            string? FechaDesde,
            string? FechaHasta
        ) LeerFiltros(Dictionary<string, object> data)
        {
            TryGetString(data, "cliente", out var cliente);
            TryGetString(data, "tipoPnc", out var tipoPnc);
            TryGetString(data, "nivel", out var nivel);
            TryGetString(data, "estadoGestion", out var estadoGestion);
            TryGetString(data, "responsable", out var responsable);
            TryGetString(data, "fechaDesde", out var fechaDesde);
            TryGetString(data, "fechaHasta", out var fechaHasta);
            return (cliente, tipoPnc, nivel, estadoGestion, responsable, fechaDesde, fechaHasta);
        }

        // Arma el diccionario de campos editables presentes en el payload (create: todos los
        // provistos; update parcial: solo los que el frontend decidió mandar).
        private static Dictionary<string, object?> LeerCamposEditables(Dictionary<string, object> data)
        {
            var campos = new Dictionary<string, object?>();
            foreach (var (json, _, tipo) in NoConformidadesRepository.GetCamposEditables())
            {
                if (!data.ContainsKey(json))
                    continue;

                switch (tipo)
                {
                    case "decimal":
                        if (TryGetDecimal(data, json, out var dec))
                            campos[json] = dec;
                        else
                            campos[json] = null;
                        break;
                    default:
                        TryGetString(data, json, out var str);
                        campos[json] = string.IsNullOrWhiteSpace(str) ? null : str;
                        break;
                }
            }
            return campos;
        }

        private async Task<string> HandleCreate(Dictionary<string, object> data)
        {
            var campos = LeerCamposEditables(data);
            TryGetString(data, "creadoPor", out var creadoPor);

            if (!ValidarObligatoriosCreate(campos, out var validationError))
                return Error(validationError);

            var (id, codigo) = await _repo.Crear(campos, creadoPor);
            return Ok(new { id, codigo });
        }

        private static bool ValidarObligatoriosCreate(
            Dictionary<string, object?> campos,
            out string error
        )
        {
            error = "";

            string[] textoObligatorio =
            {
                "tipo",
                "origen",
                "titulo",
                "descripcion",
                "severidad",
                "proceso",
                "fechaDeteccion",
                "npNv",
                "cliente",
                "producto",
                "categoriaDefecto",
                "nivel",
                "descripcionDefecto",
            };

            foreach (var campo in textoObligatorio)
            {
                if (!campos.TryGetValue(campo, out var v) || v == null || string.IsNullOrWhiteSpace(v.ToString()))
                {
                    error = $"Falta el campo obligatorio: {campo}";
                    return false;
                }
            }

            if (!campos.TryGetValue("cantRequerida", out var cr) || cr == null)
            {
                error = "Falta la cantidad requerida";
                return false;
            }
            if (!campos.TryGetValue("cantRechazada", out var cd) || cd == null)
            {
                error = "Falta la cantidad rechazada";
                return false;
            }

            var nivel = campos["nivel"]!.ToString();
            if (!NivelesValidos.Contains(nivel))
            {
                error = $"Nivel inválido. Valores permitidos: {string.Join(", ", NivelesValidos)}";
                return false;
            }

            return true;
        }

        private async Task<string> HandleUpdate(Dictionary<string, object> data)
        {
            if (!TryGetInt(data, "id", out var id))
                return Error("Falta el id de la no conformidad");

            var campos = LeerCamposEditables(data);
            if (campos.Count == 0)
                return Error("No se recibió ningún campo para actualizar");

            if (campos.TryGetValue("nivel", out var nivelVal) && nivelVal != null)
            {
                if (!NivelesValidos.Contains(nivelVal.ToString()))
                    return Error($"Nivel inválido. Valores permitidos: {string.Join(", ", NivelesValidos)}");
            }

            TryGetString(data, "actualizadoPor", out var actualizadoPor);
            await _repo.Actualizar(id, campos, actualizadoPor);
            return Ok(new { id });
        }

        private async Task<string> HandleGestionActualizar(Dictionary<string, object> data)
        {
            if (!TryGetInt(data, "id", out var id))
                return Error("Falta el id de la no conformidad");

            TryGetString(data, "responsable", out var responsable);
            TryGetString(data, "estadoGestion", out var estadoGestion);
            TryGetString(data, "fechaCompromiso", out var fechaCompromiso);
            TryGetString(data, "actualizadoPor", out var actualizadoPor);

            if (!string.IsNullOrWhiteSpace(estadoGestion) && !EstadosGestionValidos.Contains(estadoGestion))
                return Error(
                    $"Estado de gestión inválido. Valores permitidos: {string.Join(", ", EstadosGestionValidos)}"
                );

            await _repo.ActualizarGestion(id, responsable, estadoGestion, fechaCompromiso, actualizadoPor);
            return Ok(new { id });
        }

        private async Task<string> HandleCerrar(Dictionary<string, object> data)
        {
            if (!TryGetInt(data, "id", out var id))
                return Error("Falta el id de la no conformidad");

            if (!TryGetString(data, "cerradoPor", out var cerradoPor) || string.IsNullOrWhiteSpace(cerradoPor))
                return Error("Falta quién cierra la no conformidad");

            TryGetString(data, "comentarioCierre", out var comentarioCierre);

            await _repo.Cerrar(id, cerradoPor!, comentarioCierre);
            return Ok(new { id });
        }

        private async Task<string> HandleSeguimientoList(Dictionary<string, object> data)
        {
            if (!TryGetInt(data, "id", out var id))
                return Error("Falta el id de la no conformidad");

            var items = await _repo.ListarSeguimiento(id);
            return Ok(items);
        }

        private async Task<string> HandleSeguimientoCrear(Dictionary<string, object> data)
        {
            if (!TryGetInt(data, "id", out var id))
                return Error("Falta el id de la no conformidad");

            if (!TryGetString(data, "comentario", out var comentario) || string.IsNullOrWhiteSpace(comentario))
                return Error("Falta el comentario de seguimiento");

            TryGetString(data, "autor", out var autor);

            await _repo.CrearSeguimiento(id, comentario!, autor);
            return Ok(new { id });
        }

        private async Task<string> HandleAnalisisGet(Dictionary<string, object> data)
        {
            if (!TryGetInt(data, "id", out var id))
                return Error("Falta el id de la no conformidad");

            var analisis = await _repo.ObtenerAnalisis(id);
            return Ok(analisis);
        }

        private async Task<string> HandleAnalisisGuardar(Dictionary<string, object> data)
        {
            if (!TryGetInt(data, "id", out var id))
                return Error("Falta el id de la no conformidad");

            if (!TryGetString(data, "metodologia", out var metodologia) || string.IsNullOrWhiteSpace(metodologia))
                return Error("Falta la metodología");
            if (!MetodologiasValidas.Contains(metodologia))
                return Error($"Metodología inválida. Valores permitidos: {string.Join(", ", MetodologiasValidas)}");

            if (
                !TryGetString(data, "problemaDetectado", out var problemaDetectado)
                || string.IsNullOrWhiteSpace(problemaDetectado)
            )
                return Error("Falta el problema detectado");

            TryGetString(data, "porque1", out var porque1);
            TryGetString(data, "porque2", out var porque2);
            TryGetString(data, "porque3", out var porque3);
            TryGetString(data, "porque4", out var porque4);
            TryGetString(data, "porque5", out var porque5);
            TryGetString(data, "causaRaiz", out var causaRaiz);
            TryGetString(data, "conclusion", out var conclusion);
            TryGetString(data, "usuario", out var usuario);

            var analisisId = await _repo.GuardarAnalisis(
                id,
                metodologia!,
                problemaDetectado!,
                porque1,
                porque2,
                porque3,
                porque4,
                porque5,
                causaRaiz,
                conclusion,
                usuario
            );

            return Ok(new { id = analisisId });
        }

        private async Task<string> HandleAccionesList(Dictionary<string, object> data)
        {
            if (!TryGetInt(data, "id", out var id))
                return Error("Falta el id de la no conformidad");

            var items = await _repo.ListarAcciones(id);
            return Ok(items);
        }

        private async Task<string> HandleAccionesCrear(Dictionary<string, object> data)
        {
            if (!TryGetInt(data, "id", out var id))
                return Error("Falta el id de la no conformidad");

            if (!TryGetString(data, "descripcion", out var descripcion) || string.IsNullOrWhiteSpace(descripcion))
                return Error("Falta la descripción de la acción");
            if (!TryGetString(data, "responsable", out var responsable) || string.IsNullOrWhiteSpace(responsable))
                return Error("Falta el responsable");
            if (!TryGetString(data, "fechaLimite", out var fechaLimite) || string.IsNullOrWhiteSpace(fechaLimite))
                return Error("Falta la fecha límite");

            TryGetString(data, "prioridad", out var prioridad);
            TryGetString(data, "creadoPor", out var creadoPor);
            int? analisisId = TryGetInt(data, "analisisId", out var aid) ? aid : null;

            await _repo.CrearAccion(id, analisisId, descripcion!, responsable!, fechaLimite!, prioridad, creadoPor);
            return Ok((object?)null);
        }

        private async Task<string> HandleAccionesActualizar(Dictionary<string, object> data)
        {
            if (!TryGetInt(data, "accionId", out var accionId))
                return Error("Falta el id de la acción correctiva");

            if (!TryGetString(data, "descripcion", out var descripcion) || string.IsNullOrWhiteSpace(descripcion))
                return Error("Falta la descripción de la acción");
            if (!TryGetString(data, "responsable", out var responsable) || string.IsNullOrWhiteSpace(responsable))
                return Error("Falta el responsable");
            if (!TryGetString(data, "fechaLimite", out var fechaLimite) || string.IsNullOrWhiteSpace(fechaLimite))
                return Error("Falta la fecha límite");
            if (!TryGetString(data, "estado", out var estado) || string.IsNullOrWhiteSpace(estado))
                return Error("Falta el estado");
            if (!EstadosAccionValidos.Contains(estado))
                return Error($"Estado inválido. Valores permitidos: {string.Join(", ", EstadosAccionValidos)}");

            TryGetString(data, "prioridad", out var prioridad);
            TryGetString(data, "actualizadoPor", out var actualizadoPor);

            await _repo.ActualizarAccion(
                accionId,
                descripcion!,
                responsable!,
                fechaLimite!,
                prioridad,
                estado!,
                actualizadoPor
            );
            return Ok((object?)null);
        }

        // ---------- Helpers de payload (mismo patrón que FaretHandler) ----------

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

        private static bool TryGetDecimal(Dictionary<string, object> data, string key, out decimal value)
        {
            value = 0;
            if (!data.TryGetValue(key, out var raw))
                return false;
            if (raw is JsonElement el)
            {
                if (el.ValueKind != JsonValueKind.Number || !el.TryGetDecimal(out value))
                    return false;
                return true;
            }
            return decimal.TryParse(raw?.ToString(), out value);
        }

        private static string Ok(object? data) =>
            JsonSerializer.Serialize(new { ok = true, data, error = (string?)null }, _jsonOpts);

        private static string Error(string message) =>
            JsonSerializer.Serialize(new { ok = false, data = (object?)null, error = message }, _jsonOpts);
    }
}
