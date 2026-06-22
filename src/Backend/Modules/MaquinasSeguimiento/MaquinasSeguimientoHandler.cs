using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Threading.Tasks;
using QualityControlCenter.Services;

namespace QualityControlCenter.Modules.MaquinasSeguimiento
{
    public class MaquinasSeguimientoHandler
    {
        private readonly MaquinasSeguimientoRepository _repository;

        private static readonly JsonSerializerOptions _jsonOptions = new()
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        };

        public MaquinasSeguimientoHandler(DbService db)
        {
            _repository = new MaquinasSeguimientoRepository(db);
        }

        public async Task<string> Handle(string action, Dictionary<string, object> data)
        {
            try
            {
                if (action == "maquinasSeguimiento.obtenerResumen")
                {
                    int? maquinaId = null;

                    if (
                        data.TryGetValue("data", out var rawData) && rawData is JsonElement jsonData
                    )
                    {
                        if (jsonData.TryGetProperty("maquinaId", out var maquinaIdProp))
                        {
                            if (maquinaIdProp.ValueKind == JsonValueKind.Number)
                            {
                                maquinaId = maquinaIdProp.GetInt32();
                            }
                            else if (maquinaIdProp.ValueKind == JsonValueKind.String)
                            {
                                var value = maquinaIdProp.GetString();

                                if (int.TryParse(value, out var parsed))
                                {
                                    maquinaId = parsed;
                                }
                            }
                        }
                    }

                    var resumen = await _repository.ObtenerResumen(maquinaId);

                    return JsonSerializer.Serialize(
                        new { ok = true, data = resumen },
                        _jsonOptions
                    );
                }

                return JsonSerializer.Serialize(
                    new
                    {
                        ok = false,
                        error = $"Acción máquinas seguimiento no reconocida: {action}",
                    },
                    _jsonOptions
                );
            }
            catch (Exception ex)
            {
                return JsonSerializer.Serialize(
                    new { ok = false, error = ex.Message },
                    _jsonOptions
                );
            }
        }
    }
}
