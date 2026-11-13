using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using QualityControlCenter.Backend.Services.FpsApi;

namespace QualityControlCenter.Modules.MuestraLaboratorio
{
    // Ítem / artículo (número de artículo de la NV INNPACK en SAP) de una muestra de Laboratorio.
    // Solo se muestra el ítem que el usuario eligió al crear la muestra: el proceso FPS guardado
    // (idProcesoFps) indica su orden (→ NV INNPACK) y su número de ítem, y de los artículos de esa NV
    // se deja únicamente la línea de ese ítem. Sin proceso FPS guardado no hay ítem elegido y no se
    // muestra nada. Nunca se usan NV FARET ni se deduce una relación que FPS no tenga.
    public static class ArticulosNpResolver
    {
        public const string Ok = "OK";
        public const string SinNvInnpack = "SIN_NV_INNPACK";
        public const string SinArticulos = "SIN_ARTICULOS";
        public const string Ambiguo = "AMBIGUO";
        public const string SapNoDisponible = "SAP_NO_DISPONIBLE";
        public const string FpsNoDisponible = "FPS_NO_DISPONIBLE";
        public const string NpNoEncontrada = "NP_NO_ENCONTRADA";
        public const string NoDisponible = "NO_DISPONIBLE";
        public const string SinItemElegido = "SIN_ITEM_ELEGIDO";
        public const string ProcesoNoEncontrado = "PROCESO_NO_ENCONTRADO";
        public const string ItemNoEnNv = "ITEM_NO_EN_NV";

        private const int MaxConcurrencia = 4;

        public sealed class Resultado
        {
            public long Np { get; set; }
            public long IdProcesoFps { get; set; }
            public List<string> Articulos { get; set; } = new();

            // Ítem elegido → artículo(s) de la NV INNPACK (normalmente uno).
            public List<ItemArticulo> Items { get; set; } = new();
            public string Estado { get; set; } = "";
        }

        public sealed class ItemArticulo
        {
            public string Item { get; set; } = "";
            public string Articulo { get; set; } = "";
        }

        public delegate Task<(bool ok, RegistrosLaboratorioFpsDto? datos, string? error)> Consulta(long np, bool completo);

        public static async Task<List<Resultado>> ResolverAsync(IReadOnlyList<(long np, long idProceso)> pedidos, Consulta consultar)
        {
            // Una sola consulta por NP aunque varias muestras compartan NP.
            var cache = new Dictionary<long, Task<(bool ok, RegistrosLaboratorioFpsDto? datos, string? error)>>();
            using var limite = new SemaphoreSlim(MaxConcurrencia);

            Task<(bool ok, RegistrosLaboratorioFpsDto? datos, string? error)> Obtener(long np)
            {
                lock (cache)
                {
                    if (!cache.TryGetValue(np, out var t))
                    {
                        t = ConLimite(limite, () => consultar(np, true));
                        cache[np] = t;
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

        // "1" y "01" son el mismo ítem; si alguno no es numérico se compara el texto.
        public static bool MismoItem(string? a, string? b)
        {
            a = (a ?? "").Trim();
            b = (b ?? "").Trim();
            if (int.TryParse(a, out var na) && int.TryParse(b, out var nb))
                return na == nb;
            return a.Length > 0 && string.Equals(a, b, StringComparison.OrdinalIgnoreCase);
        }

        private static async Task<Resultado> ResolverUno(
            long np,
            long idProceso,
            Func<long, Task<(bool ok, RegistrosLaboratorioFpsDto? datos, string? error)>> obtener)
        {
            var r = new Resultado { Np = np, IdProcesoFps = idProceso };
            if (idProceso <= 0)
            {
                r.Estado = SinItemElegido;
                return r;
            }

            (bool ok, RegistrosLaboratorioFpsDto? datos, string? error) consulta;
            try { consulta = await obtener(np); }
            catch { r.Estado = FpsNoDisponible; return r; }

            if (!consulta.ok || consulta.datos == null)
            {
                r.Estado = (consulta.error ?? "").Contains("No se encontró", StringComparison.OrdinalIgnoreCase) ? NpNoEncontrada : FpsNoDisponible;
                return r;
            }
            var datos = consulta.datos;
            if (!datos.ArticulosInnpackDisponible)
            {
                r.Estado = NoDisponible;
                return r;
            }
            if (!string.IsNullOrEmpty(datos.ArticulosInnpackError))
            {
                r.Estado = SapNoDisponible;
                return r;
            }

            var proceso = datos.Procesos.FirstOrDefault(p => p.IdProceso == idProceso);
            var orden = proceso == null ? null : datos.Ordenes.FirstOrDefault(o => o.OrdenTrabajo == proceso.OrdenTrabajo);
            if (proceso == null || orden == null)
            {
                r.Estado = ProcesoNoEncontrado;
                return r;
            }
            var nv = (orden.NpInnpack ?? "").Trim();
            if (nv.Length == 0 || nv == "0")
            {
                r.Estado = SinNvInnpack;
                return r;
            }

            var hayArticulos = false;
            foreach (var o in datos.Ordenes.Where(o => (o.NpInnpack ?? "").Trim() == nv))
                foreach (var a in o.ArticulosInnpack)
                {
                    hayArticulos = true;
                    foreach (var item in a.Items.Where(i => MismoItem(i, proceso.Item)))
                    {
                        if (!r.Articulos.Contains(a.ItemCode))
                            r.Articulos.Add(a.ItemCode);
                        if (!r.Items.Exists(x => x.Item == item && x.Articulo == a.ItemCode))
                            r.Items.Add(new ItemArticulo { Item = item, Articulo = a.ItemCode });
                    }
                }

            r.Estado = r.Articulos.Count > 0 ? Ok : hayArticulos ? ItemNoEnNv : SinArticulos;
            return r;
        }
    }
}
