using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using QualityControlCenter.Backend.Services.FpsApi;

namespace QualityControlCenter.Modules.MuestraLaboratorio
{
    // Artículos (números de artículo de la NV INNPACK en SAP) de una muestra de Laboratorio, a partir
    // de su NP. Regla: la NP es inequívoca si todas las órdenes FPS en que aparece (como NP Faret o
    // NP Innpack) apuntan a UNA sola NV INNPACK. Si apuntan a varias, se usa el proceso FPS guardado
    // en la muestra (idProcesoFps) para saber su orden; sin él, no se muestra nada. Nunca se usan NV
    // FARET ni se deduce una relación que FPS no tenga.
    public static class ArticulosNpResolver
    {
        public const string Ok = "OK";
        public const string SinNvInnpack = "SIN_NV_INNPACK";
        public const string SinArticulos = "SIN_ARTICULOS";
        public const string Ambiguo = "AMBIGUO";
        public const string SapNoDisponible = "SAP_NO_DISPONIBLE";
        public const string FpsNoDisponible = "FPS_NO_DISPONIBLE";
        public const string NpNoEncontrada = "NP_NO_ENCONTRADA";

        private const int MaxConcurrencia = 4;

        public sealed class Resultado
        {
            public long Np { get; set; }
            public long IdProcesoFps { get; set; }
            public List<string> Articulos { get; set; } = new();
            public string Estado { get; set; } = "";
        }

        public delegate Task<(bool ok, RegistrosLaboratorioFpsDto? datos, string? error)> Consulta(long np, bool completo);

        public static async Task<List<Resultado>> ResolverAsync(IReadOnlyList<(long np, long idProceso)> pedidos, Consulta consultar)
        {
            // Una sola consulta por NP (y modo) aunque varias muestras compartan NP.
            var cache = new Dictionary<(long, bool), Task<(bool ok, RegistrosLaboratorioFpsDto? datos, string? error)>>();
            using var limite = new SemaphoreSlim(MaxConcurrencia);

            Task<(bool ok, RegistrosLaboratorioFpsDto? datos, string? error)> Obtener(long np, bool completo)
            {
                lock (cache)
                {
                    if (!cache.TryGetValue((np, completo), out var t))
                    {
                        t = ConLimite(limite, () => consultar(np, completo));
                        cache[(np, completo)] = t;
                    }
                    return t;
                }
            }

            var tareas = pedidos.Select(p => ResolverUno(p.np, p.idProceso, Obtener)).ToList();
            return (await Task.WhenAll(tareas)).ToList();
        }

        private static async Task<T> ConLimite<T>(SemaphoreSlim limite, Func<Task<T>> fn)
        {
            await limite.WaitAsync();
            try { return await fn(); }
            finally { limite.Release(); }
        }

        private static async Task<Resultado> ResolverUno(
            long np,
            long idProceso,
            Func<long, bool, Task<(bool ok, RegistrosLaboratorioFpsDto? datos, string? error)>> obtener)
        {
            var r = new Resultado { Np = np, IdProcesoFps = idProceso };
            (bool ok, RegistrosLaboratorioFpsDto? datos, string? error) liviano;
            try { liviano = await obtener(np, false); }
            catch { r.Estado = FpsNoDisponible; return r; }

            if (!liviano.ok || liviano.datos == null)
            {
                r.Estado = (liviano.error ?? "").Contains("No se encontró", StringComparison.OrdinalIgnoreCase) ? NpNoEncontrada : FpsNoDisponible;
                return r;
            }
            if (!string.IsNullOrEmpty(liviano.datos.ArticulosInnpackError))
            {
                r.Estado = SapNoDisponible;
                return r;
            }

            var ordenes = liviano.datos.Ordenes;
            var nvs = ordenes.Select(o => (o.NpInnpack ?? "").Trim()).Where(nv => nv.Length > 0 && nv != "0").Distinct().ToList();
            if (nvs.Count == 0)
            {
                r.Estado = SinNvInnpack;
                return r;
            }

            string? nvElegida = nvs.Count == 1 ? nvs[0] : null;
            if (nvElegida == null)
            {
                if (idProceso <= 0)
                {
                    r.Estado = Ambiguo;
                    return r;
                }
                // Varias NV INNPACK: la orden del proceso FPS que se guardó con la muestra lo resuelve.
                (bool ok, RegistrosLaboratorioFpsDto? datos, string? error) completo;
                try { completo = await obtener(np, true); }
                catch { r.Estado = FpsNoDisponible; return r; }
                if (!completo.ok || completo.datos == null)
                {
                    r.Estado = FpsNoDisponible;
                    return r;
                }
                if (!string.IsNullOrEmpty(completo.datos.ArticulosInnpackError))
                {
                    r.Estado = SapNoDisponible;
                    return r;
                }
                var proceso = completo.datos.Procesos.FirstOrDefault(p => p.IdProceso == idProceso);
                var orden = proceso == null ? null : completo.datos.Ordenes.FirstOrDefault(o => o.OrdenTrabajo == proceso.OrdenTrabajo);
                if (orden == null)
                {
                    r.Estado = Ambiguo;
                    return r;
                }
                nvElegida = (orden.NpInnpack ?? "").Trim();
                if (nvElegida.Length == 0 || nvElegida == "0")
                {
                    r.Estado = SinNvInnpack;
                    return r;
                }
                ordenes = completo.datos.Ordenes;
            }

            foreach (var o in ordenes.Where(o => (o.NpInnpack ?? "").Trim() == nvElegida))
                foreach (var a in o.ArticulosInnpack)
                    if (!r.Articulos.Contains(a.ItemCode))
                        r.Articulos.Add(a.ItemCode);

            r.Estado = r.Articulos.Count > 0 ? Ok : SinArticulos;
            return r;
        }
    }
}
