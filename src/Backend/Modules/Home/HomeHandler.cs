using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Threading.Tasks;
using QualityControlCenter.Services;

namespace QualityControlCenter.Modules.Home
{
    public class HomeHandler
    {
        private readonly HomeService _service;

        public HomeHandler(DbService db)
        {
            _service = new HomeService(db);
        }

        public async Task<string> Handle(string action, Dictionary<string, object>? data)
        {
            try
            {
                Console.WriteLine($"📥 ACTION HOME: {action}");

                switch (action)
                {
                    case "inicio.getDashboard":
                        return await ObtenerDashboard();

                    case "inicio.frecuencias.actualizar":
                        return await ActualizarFrecuencia(data);

                    default:
                        return Error($"Acción no reconocida: {action}");
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"❌ ERROR HOME: {ex}");

                return Error(ex.Message);
            }
        }

        private async Task<string> ObtenerDashboard()
        {
            var kpis = await _service.ObtenerKpis();

            var desviaciones = await _service.ObtenerDesviacionesPorProceso();

            var topDefectos = await _service.ObtenerTopDefectos();

            var alertas = await _service.ObtenerAlertasActivas();

            var merma = await _service.ObtenerMermaPorProceso();

            var maquinas = await _service.ObtenerMaquinasConMasDesviaciones();

            var cumplimiento = await _service.ObtenerCumplimientoControles();

            var tendencia = await _service.ObtenerTendenciaNoConformes();

            var origen = await _service.ObtenerOrigenProblema();

            var resumen = await _service.ObtenerResumenGeneral();

            var frecuencias = await _service.ObtenerFrecuenciasInspeccion();

            return Ok(
                new
                {
                    kpis,
                    desviaciones,
                    topDefectos,
                    alertas,
                    merma,
                    maquinas,
                    cumplimiento,
                    tendencia,
                    origen,
                    resumen,
                    frecuencias,
                }
            );
        }

        private async Task<string> ActualizarFrecuencia(Dictionary<string, object>? payload)
        {
            var data = GetData(payload);
            var id = GetInt(data, "id", 0);
            var minutos = GetInt(data, "frecuenciaMinutos", 0);

            if (id <= 0 || minutos <= 0)
                return Error("Parámetros inválidos para actualizar la frecuencia.");

            await _service.ActualizarFrecuenciaInspeccion(id, minutos);

            return Ok((object?)null);
        }

        private static JsonElement GetData(Dictionary<string, object>? payload)
        {
            if (payload == null || !payload.ContainsKey("data"))
                return default;

            return payload["data"] is JsonElement element ? element : default;
        }

        private static int GetInt(JsonElement data, string prop, int defaultValue)
        {
            if (data.ValueKind != JsonValueKind.Object)
                return defaultValue;

            if (!data.TryGetProperty(prop, out var value))
                return defaultValue;

            if (value.ValueKind == JsonValueKind.Number && value.TryGetInt32(out var number))
                return number;

            return int.TryParse(value.ToString(), out var parsed) ? parsed : defaultValue;
        }

        private string Ok(object? data)
        {
            return JsonSerializer.Serialize(
                new
                {
                    ok = true,
                    data,
                    error = (string?)null,
                }
            );
        }

        private string Error(string message)
        {
            return JsonSerializer.Serialize(
                new
                {
                    ok = false,
                    data = (object?)null,
                    error = message,
                }
            );
        }
    }
}
