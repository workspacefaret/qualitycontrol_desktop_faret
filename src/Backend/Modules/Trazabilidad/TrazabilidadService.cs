using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using QualityControlCenter.Backend.Services.FpsApi;
using QualityControlCenter.Backend.Services.InnpackApi;
using QualityControlCenter.Backend.Services.PlanificacionApi;

namespace QualityControlCenter.Modules.Trazabilidad
{
    // La parte de Planificación FARET/FPS Materiales sigue igual (ya eran APIs externas); solo
    // ObtenerPaletizadoPorNp migró de MySQL directo a QualityControlInnpack.Api. Ver contex.md
    // sobre la migración de INNPACK a arquitectura API.
    public class TrazabilidadService
    {
        private readonly PlanificacionApiClient _planificacion;
        private readonly FpsMaterialesApiService _fpsMateriales;
        private readonly InnpackTrazabilidadApiService _repository;

        public TrazabilidadService(
            PlanificacionApiClient planificacion,
            FpsMaterialesApiService fpsMateriales,
            InnpackTrazabilidadApiService repository
        )
        {
            _planificacion = planificacion;
            _fpsMateriales = fpsMateriales;
            _repository = repository;
        }

        public async Task<(
            bool ok,
            List<ProcesoPlanDto> procesos,
            List<PaletTrazabilidadDto> paletizado,
            string? error
        )> ConsultarNpAsync(string np)
        {
            var procesos = await ObtenerProcesosAsync(np);
            if (!procesos.ok)
                return (false, new List<ProcesoPlanDto>(), new List<PaletTrazabilidadDto>(), procesos.error);

            await AdjuntarMaterialesAsync(procesos.data);

            var paletizado = await _repository.ObtenerPaletizadoPorNp(np);

            return (true, procesos.data, paletizado, null);
        }

        // Materiales reales (FPS, Tipo='INSUMO') por proceso — falla suave: si fps-api no está
        // configurada o no responde, los procesos igual se muestran, solo sin materiales. Id de
        // ProcesoPlanDto coincide con Id_Proceso en FPS (mismo origen de datos).
        private async Task AdjuntarMaterialesAsync(List<ProcesoPlanDto> procesos)
        {
            if (procesos.Count == 0 || !_fpsMateriales.IsConfigured)
                return;

            var ids = procesos.Select(p => p.Id).Distinct().ToList();
            var (ok, materiales, _) = await _fpsMateriales.ObtenerMaterialesPorProcesosAsync(ids);
            if (!ok)
                return;

            var porProceso = materiales
                .GroupBy(m => m.IdProceso)
                .ToDictionary(g => g.Key, g => g.ToList());

            foreach (var proceso in procesos)
            {
                if (porProceso.TryGetValue(proceso.Id.ToString(), out var lista))
                    proceso.Materiales = lista;
            }
        }

        // vista-planificacion no filtra por NP en el servidor (se cachea completa, TTL 300s del
        // lado de programa-produccion) — se trae entera y se filtra acá en memoria por np o nvInn
        // (un mismo NP Faret puede coincidir con cualquiera de los dos según el origen del pedido).
        private async Task<(bool ok, List<ProcesoPlanDto> data, string? error)> ObtenerProcesosAsync(
            string np
        )
        {
            if (!_planificacion.IsConfigured)
                return (
                    true,
                    new List<ProcesoPlanDto>(),
                    "Planificación FARET no está configurada en este equipo."
                );

            var (ok, body) = await _planificacion.GetAsync("api/plan/vista-planificacion");
            if (!ok)
                return (false, new List<ProcesoPlanDto>(), ExtraerMensaje(body));

            try
            {
                using var doc = JsonDocument.Parse(body);
                if (doc.RootElement.ValueKind != JsonValueKind.Array)
                    return (false, new List<ProcesoPlanDto>(), "Respuesta inesperada de Planificación FARET.");

                var lista = new List<ProcesoPlanDto>();
                foreach (var row in doc.RootElement.EnumerateArray())
                {
                    var rowNp = GetString(row, "np");
                    var rowNvInn = GetString(row, "nvInn");

                    if (rowNp != np && rowNvInn != np)
                        continue;

                    lista.Add(
                        new ProcesoPlanDto
                        {
                            Id = GetLong(row, "id"),
                            Np = rowNp,
                            NvInn = rowNvInn,
                            Cant = GetDecimal(row, "cant"),
                            Ent = GetNullableString(row, "ent"),
                            Sec = GetString(row, "sec"),
                            Rec = GetString(row, "rec"),
                            Est = GetString(row, "est"),
                            Item = GetString(row, "item"),
                            ItemName = GetString(row, "itemName"),
                            Cli = GetString(row, "cli"),
                            Proc = GetString(row, "proc"),
                            CantProd = GetDecimal(row, "cantProd"),
                            Vel = GetNullableDecimal(row, "vel"),
                            LeadDias = GetNullableInt(row, "leadDias"),
                        }
                    );
                }

                return (true, lista, null);
            }
            catch (Exception ex)
            {
                return (false, new List<ProcesoPlanDto>(), $"Respuesta inválida de Planificación FARET: {ex.Message}");
            }
        }

        private static string ExtraerMensaje(string body)
        {
            try
            {
                using var doc = JsonDocument.Parse(body);
                if (doc.RootElement.TryGetProperty("message", out var m) && m.ValueKind == JsonValueKind.String)
                    return m.GetString() ?? body;
            }
            catch
            {
                // body no era JSON — se usa tal cual.
            }
            return body;
        }

        private static string GetString(JsonElement row, string prop)
        {
            if (row.ValueKind != JsonValueKind.Object || !row.TryGetProperty(prop, out var v))
                return "";
            return v.ValueKind switch
            {
                JsonValueKind.String => v.GetString() ?? "",
                JsonValueKind.Number => v.ToString(),
                _ => "",
            };
        }

        private static string? GetNullableString(JsonElement row, string prop)
        {
            if (row.ValueKind != JsonValueKind.Object || !row.TryGetProperty(prop, out var v))
                return null;
            return v.ValueKind == JsonValueKind.String ? v.GetString() : null;
        }

        private static long GetLong(JsonElement row, string prop)
        {
            if (row.ValueKind != JsonValueKind.Object || !row.TryGetProperty(prop, out var v))
                return 0;
            if (v.ValueKind == JsonValueKind.Number && v.TryGetInt64(out var n))
                return n;
            return 0;
        }

        private static decimal GetDecimal(JsonElement row, string prop)
        {
            if (row.ValueKind != JsonValueKind.Object || !row.TryGetProperty(prop, out var v))
                return 0m;
            if (v.ValueKind == JsonValueKind.Number && v.TryGetDecimal(out var d))
                return d;
            return 0m;
        }

        private static decimal? GetNullableDecimal(JsonElement row, string prop)
        {
            if (row.ValueKind != JsonValueKind.Object || !row.TryGetProperty(prop, out var v))
                return null;
            return v.ValueKind == JsonValueKind.Number && v.TryGetDecimal(out var d) ? d : (decimal?)null;
        }

        private static int? GetNullableInt(JsonElement row, string prop)
        {
            if (row.ValueKind != JsonValueKind.Object || !row.TryGetProperty(prop, out var v))
                return null;
            return v.ValueKind == JsonValueKind.Number && v.TryGetInt32(out var n) ? n : (int?)null;
        }
    }
}
