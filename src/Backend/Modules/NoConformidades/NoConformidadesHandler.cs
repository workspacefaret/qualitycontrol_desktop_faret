using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using QualityControlCenter.Backend.Services.InnpackApi;

namespace QualityControlCenter.Modules.NoConformidades
{
    // Módulo "No Conformidades" — INNPACK, standalone (sin relación con Faret). Migrado a
    // QualityControlInnpack.Api (Paso 14 de la migración) — ya no consulta MySQL directo desde el
    // desktop (NoConformidadesRepository.cs de este módulo queda sin uso). Toda la validación de
    // negocio (estados válidos, obligatorios, tamaños/mimes de adjuntos) se trasladó a
    // NoConformidadesService en la API — este Handler solo valida presencia de ids/campos
    // estructurales (los que van en la URL) y reenvía. create/update reenvían el payload plano tal
    // cual (mismo patrón "BuildBody" ya usado en ControlDocumentalHandler, Paso 9) para preservar
    // la semántica de "actualización parcial" (clave ausente = no tocar ese campo). Ver contex.md
    // sobre la migración de INNPACK a arquitectura API.
    public class NoConformidadesHandler
    {
        private readonly InnpackNoConformidadesApiService _api;
        private readonly InnpackNoConformidadesCatalogosApiService _catalogos;

        private static readonly JsonSerializerOptions _jsonOpts = new()
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        };

        public NoConformidadesHandler(InnpackApiClient innpackClient)
        {
            _api = new InnpackNoConformidadesApiService(innpackClient);
            _catalogos = new InnpackNoConformidadesCatalogosApiService(innpackClient);
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
                    "noConformidades.eliminar" => await HandleEliminar(data),
                    "noConformidades.gestion.actualizar" => await HandleGestionActualizar(data),
                    "noConformidades.cerrar" => await HandleCerrar(data),
                    "noConformidades.seguimiento.list" => await HandleSeguimientoList(data),
                    "noConformidades.seguimiento.crear" => await HandleSeguimientoCrear(data),
                    "noConformidades.analisis.get" => await HandleAnalisisGet(data),
                    "noConformidades.analisis.guardar" => await HandleAnalisisGuardar(data),
                    "noConformidades.acciones.list" => await HandleAccionesList(data),
                    "noConformidades.acciones.crear" => await HandleAccionesCrear(data),
                    "noConformidades.acciones.actualizar" => await HandleAccionesActualizar(data),
                    "noConformidades.adjuntos.list" => await HandleAdjuntosList(data),
                    "noConformidades.adjuntos.subir" => await HandleAdjuntosSubir(data),
                    "noConformidades.adjuntos.abrir" => await HandleAdjuntosAbrir(data),
                    "noConformidades.adjuntos.eliminar" => await HandleAdjuntosEliminar(data),
                    "noConformidades.catalogos.clientes.list" => await HandleCatalogoList("clientes"),
                    "noConformidades.catalogos.clientes.crear" => await HandleCatalogoCrear("clientes", data),
                    "noConformidades.catalogos.clientes.desactivar" => await HandleCatalogoDesactivar("clientes", data),
                    "noConformidades.catalogos.categoriasDefecto.list" => await HandleCatalogoList("categoriasDefecto"),
                    "noConformidades.catalogos.categoriasDefecto.crear" => await HandleCatalogoCrear("categoriasDefecto", data),
                    "noConformidades.catalogos.categoriasDefecto.desactivar" => await HandleCatalogoDesactivar("categoriasDefecto", data),
                    "noConformidades.catalogos.tiposFalla.list" => await HandleCatalogoList("tiposFalla"),
                    "noConformidades.catalogos.tiposFalla.crear" => await HandleCatalogoCrear("tiposFalla", data),
                    "noConformidades.catalogos.tiposFalla.desactivar" => await HandleCatalogoDesactivar("tiposFalla", data),
                    "noConformidades.catalogos.supervisores.list" => await HandleCatalogoList("supervisores"),
                    "noConformidades.catalogos.supervisores.crear" => await HandleCatalogoCrear("supervisores", data),
                    "noConformidades.catalogos.supervisores.desactivar" => await HandleCatalogoDesactivar("supervisores", data),
                    "noConformidades.catalogos.revisores.list" => await HandleCatalogoList("revisores"),
                    "noConformidades.catalogos.revisores.crear" => await HandleCatalogoCrear("revisores", data),
                    "noConformidades.catalogos.revisores.desactivar" => await HandleCatalogoDesactivar("revisores", data),
                    "noConformidades.catalogos.areas.list" => await HandleCatalogoList("areas"),
                    "noConformidades.catalogos.areas.crear" => await HandleCatalogoCrear("areas", data),
                    "noConformidades.catalogos.areas.desactivar" => await HandleCatalogoDesactivar("areas", data),
                    "noConformidades.catalogos.familiasProducto.list" => await HandleCatalogoList("familiasProducto"),
                    "noConformidades.catalogos.familiasProducto.crear" => await HandleCatalogoCrear("familiasProducto", data),
                    "noConformidades.catalogos.familiasProducto.desactivar" => await HandleCatalogoDesactivar("familiasProducto", data),
                    "noConformidades.catalogos.niveles.list" => await HandleCatalogoList("niveles"),
                    "noConformidades.catalogos.niveles.crear" => await HandleCatalogoCrear("niveles", data),
                    "noConformidades.catalogos.niveles.desactivar" => await HandleCatalogoDesactivar("niveles", data),
                    "noConformidades.catalogos.impactos.list" => await HandleCatalogoList("impactos"),
                    "noConformidades.catalogos.impactos.crear" => await HandleCatalogoCrear("impactos", data),
                    "noConformidades.catalogos.impactos.desactivar" => await HandleCatalogoDesactivar("impactos", data),
                    _ => Error($"Acción no reconocida en NoConformidades: {action}"),
                };
            }
            catch (Exception ex)
            {
                return Error(ex.Message);
            }
        }

        // ---------- Catálogos (Paso 2, sin cambios) ----------

        private async Task<string> HandleCatalogoList(string catalogo)
        {
            var (ok, body) = await _catalogos.ListAsync(catalogo);
            if (!TryUnwrapApiResponse(body, out var payload, out var error) || !ok)
                return Error(error);

            return Ok(JsonSerializer.Deserialize<object>(payload.GetRawText()));
        }

        private async Task<string> HandleCatalogoCrear(string catalogo, Dictionary<string, object> data)
        {
            if (!TryGetString(data, "nombre", out var nombreRaw) || string.IsNullOrWhiteSpace(nombreRaw))
                return Error("Falta el nombre");

            TryGetString(data, "creadoPor", out var creadoPor);

            var (ok, body) = await _catalogos.CrearAsync(catalogo, nombreRaw!.Trim(), creadoPor);
            if (!TryUnwrapApiResponse(body, out var payload, out var error) || !ok)
                return Error(error);

            return Ok(JsonSerializer.Deserialize<object>(payload.GetRawText()));
        }

        private async Task<string> HandleCatalogoDesactivar(string catalogo, Dictionary<string, object> data)
        {
            if (!TryGetInt(data, "id", out var id))
                return Error("Falta el id");

            var (ok, body) = await _catalogos.DesactivarAsync(catalogo, id);
            if (!TryUnwrapApiResponse(body, out _, out var error) || !ok)
                return Error(error);

            return Ok((object?)null);
        }

        // ---------- No Conformidades (Paso 14) ----------

        private async Task<string> HandleList(Dictionary<string, object> data)
        {
            var page = TryGetInt(data, "page", out var p) && p > 0 ? p : 1;
            var pageSize = TryGetInt(data, "pageSize", out var ps) && ps > 0 ? ps : 50;
            var (cliente, tipoPnc, nivel, estadoGestion, area, fechaDesde, fechaHasta) = LeerFiltros(data);

            return await Forward(_api.ListAsync(page, pageSize, cliente, tipoPnc, nivel, estadoGestion, area, fechaDesde, fechaHasta));
        }

        private async Task<string> HandleResumen(Dictionary<string, object> data)
        {
            var (cliente, tipoPnc, nivel, estadoGestion, area, fechaDesde, fechaHasta) = LeerFiltros(data);
            return await Forward(_api.ResumenAsync(cliente, tipoPnc, nivel, estadoGestion, area, fechaDesde, fechaHasta));
        }

        private async Task<string> HandleFiltrosOpciones() => await Forward(_api.FiltrosOpcionesAsync());

        private async Task<string> HandleGet(Dictionary<string, object> data)
        {
            if (!TryGetInt(data, "id", out var id))
                return Error("Falta el id de la no conformidad");

            return await Forward(_api.GetAsync(id));
        }

        private static (
            string? Cliente,
            string? TipoPnc,
            string? Nivel,
            string? EstadoGestion,
            string? Area,
            string? FechaDesde,
            string? FechaHasta
        ) LeerFiltros(Dictionary<string, object> data)
        {
            TryGetString(data, "cliente", out var cliente);
            TryGetString(data, "tipoPnc", out var tipoPnc);
            TryGetString(data, "nivel", out var nivel);
            TryGetString(data, "estadoGestion", out var estadoGestion);
            TryGetString(data, "area", out var area);
            TryGetString(data, "fechaDesde", out var fechaDesde);
            TryGetString(data, "fechaHasta", out var fechaHasta);
            return (cliente, tipoPnc, nivel, estadoGestion, area, fechaDesde, fechaHasta);
        }

        private async Task<string> HandleCreate(Dictionary<string, object> data)
        {
            var body = BuildBody(data, "action");
            return await Forward(_api.CrearAsync(body));
        }

        private async Task<string> HandleUpdate(Dictionary<string, object> data)
        {
            if (!TryGetInt(data, "id", out var id))
                return Error("Falta el id de la no conformidad");

            var body = BuildBody(data, "action", "id");
            return await Forward(_api.ActualizarAsync(id, body));
        }

        // Borrado lógico — disponible para cualquier usuario logueado, sin gating de rol (mismo
        // criterio que el resto del módulo, ninguna acción de NoConformidades restringe por rol).
        private async Task<string> HandleEliminar(Dictionary<string, object> data)
        {
            if (!TryGetInt(data, "id", out var id))
                return Error("Falta el id de la no conformidad");

            TryGetString(data, "actualizadoPor", out var actualizadoPor);
            return await Forward(_api.EliminarAsync(id, actualizadoPor));
        }

        private async Task<string> HandleGestionActualizar(Dictionary<string, object> data)
        {
            if (!TryGetInt(data, "id", out var id))
                return Error("Falta el id de la no conformidad");

            TryGetString(data, "responsable", out var responsable);
            TryGetString(data, "estadoGestion", out var estadoGestion);
            TryGetString(data, "fechaCompromiso", out var fechaCompromiso);
            TryGetString(data, "actualizadoPor", out var actualizadoPor);

            return await Forward(_api.GestionActualizarAsync(id, new { responsable, estadoGestion, fechaCompromiso, actualizadoPor }));
        }

        private async Task<string> HandleCerrar(Dictionary<string, object> data)
        {
            if (!TryGetInt(data, "id", out var id))
                return Error("Falta el id de la no conformidad");

            TryGetString(data, "cerradoPor", out var cerradoPor);
            TryGetString(data, "comentarioCierre", out var comentarioCierre);

            return await Forward(_api.CerrarAsync(id, new { cerradoPor, comentarioCierre }));
        }

        private async Task<string> HandleSeguimientoList(Dictionary<string, object> data)
        {
            if (!TryGetInt(data, "id", out var id))
                return Error("Falta el id de la no conformidad");

            return await Forward(_api.SeguimientoListAsync(id));
        }

        private async Task<string> HandleSeguimientoCrear(Dictionary<string, object> data)
        {
            if (!TryGetInt(data, "id", out var id))
                return Error("Falta el id de la no conformidad");

            TryGetString(data, "comentario", out var comentario);
            TryGetString(data, "autor", out var autor);

            return await Forward(_api.SeguimientoCrearAsync(id, new { comentario, autor }));
        }

        private async Task<string> HandleAnalisisGet(Dictionary<string, object> data)
        {
            if (!TryGetInt(data, "id", out var id))
                return Error("Falta el id de la no conformidad");

            return await Forward(_api.AnalisisGetAsync(id));
        }

        private async Task<string> HandleAnalisisGuardar(Dictionary<string, object> data)
        {
            if (!TryGetInt(data, "id", out var id))
                return Error("Falta el id de la no conformidad");

            TryGetString(data, "metodologia", out var metodologia);
            TryGetString(data, "problemaDetectado", out var problemaDetectado);
            TryGetString(data, "porque1", out var porque1);
            TryGetString(data, "porque2", out var porque2);
            TryGetString(data, "porque3", out var porque3);
            TryGetString(data, "porque4", out var porque4);
            TryGetString(data, "porque5", out var porque5);
            TryGetString(data, "causaRaiz", out var causaRaiz);
            TryGetString(data, "conclusion", out var conclusion);
            TryGetString(data, "usuario", out var usuario);

            return await Forward(
                _api.AnalisisGuardarAsync(
                    id,
                    new
                    {
                        metodologia,
                        problemaDetectado,
                        porque1,
                        porque2,
                        porque3,
                        porque4,
                        porque5,
                        causaRaiz,
                        conclusion,
                        usuario,
                    }
                )
            );
        }

        private async Task<string> HandleAccionesList(Dictionary<string, object> data)
        {
            if (!TryGetInt(data, "id", out var id))
                return Error("Falta el id de la no conformidad");

            return await Forward(_api.AccionesListAsync(id));
        }

        private async Task<string> HandleAccionesCrear(Dictionary<string, object> data)
        {
            if (!TryGetInt(data, "id", out var id))
                return Error("Falta el id de la no conformidad");

            TryGetString(data, "descripcion", out var descripcion);
            TryGetString(data, "responsable", out var responsable);
            TryGetString(data, "fechaLimite", out var fechaLimite);
            TryGetString(data, "prioridad", out var prioridad);
            TryGetString(data, "creadoPor", out var creadoPor);
            int? analisisId = TryGetInt(data, "analisisId", out var aid) ? aid : null;

            return await Forward(
                _api.AccionesCrearAsync(id, new { analisisId, descripcion, responsable, fechaLimite, prioridad, creadoPor })
            );
        }

        private async Task<string> HandleAccionesActualizar(Dictionary<string, object> data)
        {
            if (!TryGetInt(data, "accionId", out var accionId))
                return Error("Falta el id de la acción correctiva");

            TryGetString(data, "descripcion", out var descripcion);
            TryGetString(data, "responsable", out var responsable);
            TryGetString(data, "fechaLimite", out var fechaLimite);
            TryGetString(data, "estado", out var estado);
            TryGetString(data, "prioridad", out var prioridad);
            TryGetString(data, "actualizadoPor", out var actualizadoPor);

            return await Forward(
                _api.AccionesActualizarAsync(accionId, new { descripcion, responsable, fechaLimite, prioridad, estado, actualizadoPor })
            );
        }

        // ---------- Adjuntos: PDF análisis de causa raíz + evidencia fotográfica ----------

        private async Task<string> HandleAdjuntosList(Dictionary<string, object> data)
        {
            if (!TryGetInt(data, "id", out var id))
                return Error("Falta el id de la no conformidad");

            return await Forward(_api.AdjuntosListAsync(id));
        }

        private async Task<string> HandleAdjuntosSubir(Dictionary<string, object> data)
        {
            if (!TryGetInt(data, "id", out var id))
                return Error("Falta el id de la no conformidad");

            TryGetString(data, "tipo", out var tipo);
            TryGetString(data, "nombreArchivo", out var nombreArchivo);
            TryGetString(data, "tipoMime", out var tipoMime);
            TryGetString(data, "contenidoBase64", out var contenidoBase64);
            TryGetString(data, "subidoPor", out var subidoPor);

            return await Forward(
                _api.AdjuntosSubirAsync(id, new { tipo, nombreArchivo, tipoMime, contenidoBase64, subidoPor })
            );
        }

        private async Task<string> HandleAdjuntosAbrir(Dictionary<string, object> data)
        {
            if (!TryGetInt(data, "id", out var id))
                return Error("Falta el id de la no conformidad");
            if (!TryGetInt(data, "adjuntoId", out var adjuntoId))
                return Error("Falta el id del adjunto");

            return await Forward(_api.AdjuntosAbrirAsync(id, adjuntoId));
        }

        private async Task<string> HandleAdjuntosEliminar(Dictionary<string, object> data)
        {
            if (!TryGetInt(data, "id", out var id))
                return Error("Falta el id de la no conformidad");
            if (!TryGetInt(data, "adjuntoId", out var adjuntoId))
                return Error("Falta el id del adjunto");

            return await Forward(_api.AdjuntosEliminarAsync(id, adjuntoId));
        }

        // ---------- Helpers (mismo patrón que ControlDocumentalHandler) ----------

        // Copia el payload plano quitando las claves indicadas (siempre "action" + los ids que van
        // en la URL) — preserva exactamente qué claves llegaron del frontend, incluida la
        // semántica de "actualización parcial" de NoConformidadesService en la API.
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
