using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using QualityControlCenter.Backend.Services.FpsApi;
using QualityControlCenter.Services;

namespace QualityControlCenter.Modules.TalleresExternos
{
    public class TalleresExternosService
    {
        private static readonly string[] PrioridadesValidas = ["BAJA", "MEDIA", "ALTA"];
        private static readonly string[] EstadosValidos =
        [
            "PENDIENTE_ASIGNACION",
            "ASIGNADO",
            "EN_PROCESO",
            "ENTREGADO",
            "ANULADO",
        ];

        // Este módulo es exclusivo de INNPACK (ver TalleresExternosRepository) — el filtro de
        // empresa contra fps-api queda fijo, no viaja desde el frontend.
        private const string EmpresaFps = "INNPACK SPA";

        private const int MaxLargoObservaciones = 2000;
        private const int MaxLargoJustificacion = 500;

        private readonly TalleresExternosRepository _repo;
        private readonly FpsLiberacionesApiService? _fps;

        public TalleresExternosService(DbService db, FpsLiberacionesApiService? fps = null)
        {
            _repo = new TalleresExternosRepository(db);
            _fps = fps;
        }

        public Task<TrabajoListResponse> GetListAsync(int page, int pageSize)
        {
            var paginaSegura = page < 1 ? 1 : page;
            var tamanoSeguro = pageSize < 1 ? 50 : System.Math.Min(pageSize, 500);
            return _repo.GetListAsync(paginaSegura, tamanoSeguro);
        }

        public Task<CatalogosTalleresExternosDto> GetCatalogosAsync() => _repo.GetCatalogosAsync();

        public async Task EliminarTallerAsync(int id)
        {
            if (!await _repo.DesactivarTallerAsync(id))
                throw new KeyNotFoundException($"No existe un taller externo activo con id {id}.");
        }

        public async Task EliminarProcesoAsync(int id)
        {
            if (!await _repo.DesactivarProcesoAsync(id))
                throw new KeyNotFoundException($"No existe un proceso externo activo con id {id}.");
        }

        public async Task<TrabajoItem> CrearAsync(CrearTrabajoRequest request, int? usuarioId)
        {
            var errores = ValidarCampos(request);
            if (errores.Count > 0)
                throw new System.InvalidOperationException(string.Join(" ", errores));

            return await _repo.CrearAsync(request, usuarioId);
        }

        public async Task<TrabajoActualizarResultado> ActualizarAsync(
            long id,
            ActualizarTrabajoRequest request,
            int? usuarioId
        )
        {
            var errores = ValidarCampos(request);
            if (errores.Count > 0)
                throw new System.InvalidOperationException(string.Join(" ", errores));

            return await _repo.ActualizarAsync(id, request, usuarioId);
        }

        public Task<TrabajoEliminarResultado> EliminarAsync(long id, int version, int? usuarioId) =>
            _repo.EliminarAsync(id, version, usuarioId);

        public Task<List<LiberacionHistorialItem>> ObtenerHistorialLiberacionesAsync(
            long trabajoId
        ) => _repo.GetHistorialLiberacionesAsync(trabajoId);

        // Recorre los trabajos activos con código de producto, consulta fps-api por cada uno
        // (NV+Ítem+Código, empresa fija INNPACK) y aplica las liberaciones nuevas. Un error en un
        // trabajo puntual (FPS caído, sin match, etc.) no interrumpe el resto — queda registrado
        // en Errores y se sigue con el siguiente.
        public async Task<SincronizarFpsResultado> SincronizarFpsAsync(int? usuarioId)
        {
            if (_fps is null || !_fps.IsConfigured)
                throw new System.InvalidOperationException(
                    "La integración con FPS no está configurada (revisa la sección \"FpsApi\" en config.json)."
                );

            var trabajos = await _repo.GetTrabajosSincronizablesAsync();
            var resultado = new SincronizarFpsResultado { TrabajosRevisados = trabajos.Count };

            foreach (var trabajo in trabajos)
            {
                var (ok, liberaciones, error) = await _fps.ObtenerLiberacionesAsync(
                    trabajo.Nv,
                    trabajo.Item,
                    trabajo.CodigoProducto!,
                    EmpresaFps
                );

                if (!ok)
                {
                    resultado.Errores.Add($"NV {trabajo.Nv} ítem {trabajo.Item}: {error}");
                    continue;
                }

                if (liberaciones.Count == 0)
                    continue;

                var syncResultado = await _repo.SincronizarTrabajoAsync(
                    trabajo.Id,
                    liberaciones,
                    usuarioId
                );

                if (syncResultado.Error != null)
                {
                    resultado.Errores.Add(
                        $"NV {trabajo.Nv} ítem {trabajo.Item}: {syncResultado.Error}"
                    );
                    continue;
                }

                resultado.LiberacionesNuevas += syncResultado.LiberacionesNuevas;
                if (syncResultado.LiberacionesNuevas > 0)
                    resultado.TrabajosActualizados++;
            }

            return resultado;
        }

        private static List<string> ValidarCampos(CrearTrabajoRequest r)
        {
            var errores = new List<string>();

            // NV/Ítem son identificadores operativos alfanuméricos (ej. "NP-22421", "OT/22421",
            // "00125") — no siempre puramente numéricos, solo se exige que no estén vacíos.
            if (string.IsNullOrWhiteSpace(r.Nv))
                errores.Add("NV es obligatorio.");

            if (string.IsNullOrWhiteSpace(r.Item))
                errores.Add("Ítem es obligatorio.");

            if (string.IsNullOrWhiteSpace(r.Producto))
                errores.Add("Producto no puede estar vacío.");

            if (r.CantidadARevisar < 0)
                errores.Add("Cantidad a revisar no puede ser negativa.");
            if (r.CantidadRevisadaEntregada < 0)
                errores.Add("Cantidad revisada y entregada no puede ser negativa.");

            if (!PrioridadesValidas.Contains(r.Prioridad))
                errores.Add(
                    $"Prioridad inválida: '{r.Prioridad}'. Valores permitidos: {string.Join(", ", PrioridadesValidas)}."
                );

            if (!EstadosValidos.Contains(r.Estado))
                errores.Add(
                    $"Estado inválido: '{r.Estado}'. Valores permitidos: {string.Join(", ", EstadosValidos)}."
                );

            if (r.CantidadFaltanteAjusteManual)
            {
                if (r.CantidadFaltanteManual is null)
                    errores.Add("El ajuste manual de cantidad faltante requiere un valor.");
                else if (r.CantidadFaltanteManual < 0)
                    errores.Add("La cantidad faltante ajustada no puede ser negativa.");

                if (string.IsNullOrWhiteSpace(r.CantidadFaltanteJustificacion))
                    errores.Add(
                        "El ajuste manual de cantidad faltante requiere una justificación."
                    );
            }

            if (r.CantidadFaltanteJustificacion?.Length > MaxLargoJustificacion)
                errores.Add(
                    $"La justificación de cantidad faltante no puede superar {MaxLargoJustificacion} caracteres."
                );

            if (r.Observaciones?.Length > MaxLargoObservaciones)
                errores.Add(
                    $"Las observaciones no pueden superar {MaxLargoObservaciones} caracteres."
                );

            return errores;
        }
    }
}
