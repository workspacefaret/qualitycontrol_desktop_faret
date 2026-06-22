using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Threading.Tasks;
using QualityControlCenter.Services;

namespace QualityControlCenter.Modules.RegistrosProduccion
{
    public class RegistrosProduccionHandler
    {
        private readonly RegistrosProduccionRepository _repository;

        private static readonly JsonSerializerOptions _jsonOptions = new()
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        };

        public RegistrosProduccionHandler(DbService db)
        {
            _repository = new RegistrosProduccionRepository(db);
        }

        public async Task<string> Handle(string action, Dictionary<string, object> data)
        {
            try
            {
                if (action == "registrosProduccion.obtenerFiltros")
                {
                    var filtros = await _repository.ObtenerFiltros();

                    return JsonSerializer.Serialize(
                        new
                        {
                            ok = true,
                            data = filtros,
                            error = (string?)null,
                        },
                        _jsonOptions
                    );
                }

                if (action == "registrosProduccion.validarRegistro")
                {
                    var id = 0;

                    if (
                        data.TryGetValue("id", out var rawId)
                        && int.TryParse(rawId?.ToString(), out var parsedId)
                    )
                    {
                        id = parsedId;
                    }

                    await _repository.ValidarRegistro(id);

                    return JsonSerializer.Serialize(
                        new
                        {
                            ok = true,
                            data = (object?)null,
                            error = (string?)null,
                        },
                        _jsonOptions
                    );
                }

                if (action == "registrosProduccion.rechazarRegistro")
                {
                    var id = 0;

                    if (
                        data.TryGetValue("id", out var rawId)
                        && int.TryParse(rawId?.ToString(), out var parsedId)
                    )
                    {
                        id = parsedId;
                    }

                    await _repository.RechazarRegistro(id);

                    return JsonSerializer.Serialize(
                        new
                        {
                            ok = true,
                            data = (object?)null,
                            error = (string?)null,
                        },
                        _jsonOptions
                    );
                }

                if (action == "registrosProduccion.validarTodo")
                {
                    await _repository.ValidarTodo();

                    return JsonSerializer.Serialize(
                        new
                        {
                            ok = true,
                            data = (object?)null,
                            error = (string?)null,
                        },
                        _jsonOptions
                    );
                }

                if (action == "registrosProduccion.rechazarTodo")
                {
                    await _repository.RechazarTodo();

                    return JsonSerializer.Serialize(
                        new
                        {
                            ok = true,
                            data = (object?)null,
                            error = (string?)null,
                        },
                        _jsonOptions
                    );
                }

                if (action == "registrosProduccion.obtenerResumen")
                {
                    var fechaDesde = "";
                    var fechaHasta = "";
                    var inspector = "";
                    var turno = "";
                    var proceso = "";

                    if (
                        data.TryGetValue("data", out var rawData) && rawData is JsonElement jsonData
                    )
                    {
                        if (jsonData.TryGetProperty("fechaDesde", out var desdeProp))
                        {
                            fechaDesde = desdeProp.GetString() ?? "";
                        }

                        if (jsonData.TryGetProperty("fechaHasta", out var hastaProp))
                        {
                            fechaHasta = hastaProp.GetString() ?? "";
                        }

                        if (jsonData.TryGetProperty("inspector", out var inspectorProp))
                        {
                            inspector = inspectorProp.GetString() ?? "";
                        }

                        if (jsonData.TryGetProperty("turno", out var turnoProp))
                        {
                            turno = turnoProp.GetString() ?? "";
                        }

                        if (jsonData.TryGetProperty("proceso", out var procesoProp))
                        {
                            proceso = procesoProp.GetString() ?? "";
                        }
                    }

                    var resumen = await _repository.ObtenerResumen(
                        fechaDesde,
                        fechaHasta,
                        inspector,
                        turno,
                        proceso
                    );

                    return JsonSerializer.Serialize(
                        new
                        {
                            ok = true,
                            data = resumen,
                            error = (string?)null,
                        },
                        _jsonOptions
                    );
                }

                return JsonSerializer.Serialize(
                    new
                    {
                        ok = false,
                        data = (object?)null,
                        error = $"Acción registrosProduccion no reconocida: {action}",
                    },
                    _jsonOptions
                );
            }
            catch (Exception ex)
            {
                return JsonSerializer.Serialize(
                    new
                    {
                        ok = false,
                        data = (object?)null,
                        error = ex.Message,
                    },
                    _jsonOptions
                );
            }
        }
    }
}
