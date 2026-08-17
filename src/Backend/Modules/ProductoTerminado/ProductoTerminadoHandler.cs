using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Threading.Tasks;
using QualityControlCenter.Services;

namespace QualityControlCenter.Modules.ProductoTerminado
{
    public class ProductoTerminadoHandler
    {
        private readonly ProductoTerminadoRepository _repository;

        private static readonly JsonSerializerOptions _jsonOptions = new()
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        };

        public ProductoTerminadoHandler(DbService db)
        {
            _repository = new ProductoTerminadoRepository(db);
        }

        public async Task<string> Handle(string action, Dictionary<string, object> data)
        {
            try
            {
                var jsonDataRaiz = GetDataElement(data);
                var empresa = GetString(jsonDataRaiz, "empresa");

                // Scope obligatorio: cada módulo frontend (INNPACK/Faret) SIEMPRE debe mandar el
                // suyo. Sin esta validación, olvidar el campo en el frontend mostraría los datos de
                // ambas empresas mezclados en vez de fallar de forma visible.
                if (empresa != "INNPACK" && empresa != "FARET")
                    return Error("Falta indicar la empresa (INNPACK o FARET)");

                if (action == "productoTerminado.filtros")
                {
                    var filtros = await _repository.ObtenerFiltros(empresa);
                    return Ok(filtros);
                }

                if (action == "productoTerminado.resumen")
                {
                    var f = BuildFiltroParams(data, empresa);
                    var resumen = await _repository.ObtenerResumen(f);
                    return Ok(resumen);
                }

                if (action == "productoTerminado.list")
                {
                    var f = BuildFiltroParams(data, empresa);
                    var jsonData = GetDataElement(data);

                    var page = GetInt(jsonData, "page") ?? 1;
                    var limit = GetInt(jsonData, "limit") ?? 50;

                    if (page < 1)
                        page = 1;

                    if (limit < 1 || limit > 500)
                        limit = 50;

                    var (items, total) = await _repository.ObtenerRegistros(f, page, limit);

                    return Ok(
                        new
                        {
                            items,
                            total,
                            page,
                            limit,
                        }
                    );
                }

                if (action == "productoTerminado.detalle")
                {
                    var jsonData = GetDataElement(data);
                    var id = GetInt(jsonData, "id") ?? 0;

                    if (id <= 0)
                        return Error("Falta el id de la inspección");

                    var detalle = await _repository.ObtenerDetalle(id, empresa);

                    if (detalle == null)
                        return Error("No se encontró la inspección solicitada");

                    return Ok(detalle);
                }

                if (action == "productoTerminado.exportarDetalle")
                {
                    var f = BuildFiltroParams(data, empresa);
                    var filas = await _repository.ObtenerFilasExportacion(f);
                    return Ok(filas);
                }

                if (action == "productoTerminado.eliminar")
                {
                    var jsonData = GetDataElement(data);
                    var id = GetInt(jsonData, "id") ?? 0;

                    if (id <= 0)
                        return Error("Falta el id de la inspección");

                    var eliminado = await _repository.Eliminar(id, empresa);

                    if (!eliminado)
                        return Error("No se encontró la inspección solicitada");

                    return Ok(null);
                }

                return Error($"Acción productoTerminado no reconocida: {action}");
            }
            catch (Exception ex)
            {
                return Error(ex.Message);
            }
        }

        private static JsonElement GetDataElement(Dictionary<string, object> data)
        {
            if (data.TryGetValue("data", out var rawData) && rawData is JsonElement jsonData)
                return jsonData;

            return default;
        }

        private static ProductoTerminadoFiltroParams BuildFiltroParams(
            Dictionary<string, object> data,
            string empresa
        )
        {
            var jsonData = GetDataElement(data);

            return new ProductoTerminadoFiltroParams
            {
                Empresa = empresa,
                FechaDesde = GetString(jsonData, "fechaDesde"),
                FechaHasta = GetString(jsonData, "fechaHasta"),
                Np = GetString(jsonData, "np"),
                CodigoProducto = GetString(jsonData, "codigoProducto"),
                Proceso = GetString(jsonData, "proceso"),
                Maquina = GetString(jsonData, "maquina"),
                Turno = GetString(jsonData, "turno"),
                InspectorId = GetInt(jsonData, "inspectorId"),
                Resultado = GetString(jsonData, "resultado"),
                OrigenId = GetInt(jsonData, "origenId"),
            };
        }

        // Mismo gotcha documentado en CLAUDE.md: un JsonElement puede llegar como Number o String
        // según cómo lo haya mandado el JS — estos dos helpers nunca asumen el tipo.
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

        private static int? GetInt(JsonElement obj, string prop)
        {
            if (obj.ValueKind != JsonValueKind.Object)
                return null;

            if (!obj.TryGetProperty(prop, out var value))
                return null;

            if (value.ValueKind == JsonValueKind.Number && value.TryGetInt32(out var i))
                return i;

            if (value.ValueKind == JsonValueKind.String && int.TryParse(value.GetString(), out var parsed))
                return parsed;

            return null;
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
