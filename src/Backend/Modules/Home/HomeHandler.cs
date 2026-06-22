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
                }
            );
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
