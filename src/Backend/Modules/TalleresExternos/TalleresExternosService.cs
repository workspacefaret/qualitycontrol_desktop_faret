using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using QualityControlCenter.Services;

namespace QualityControlCenter.Modules.TalleresExternos
{
    public class TalleresExternosService
    {
        private static readonly string[] PrioridadesValidas = ["BAJA", "MEDIA", "ALTA"];
        private static readonly string[] EstadosValidos =
            ["PENDIENTE_ASIGNACION", "ASIGNADO", "EN_PROCESO", "ENTREGADO", "ANULADO"];

        private const int MaxLargoObservaciones = 2000;
        private const int MaxLargoJustificacion = 500;

        private readonly TalleresExternosRepository _repo;

        public TalleresExternosService(DbService db)
        {
            _repo = new TalleresExternosRepository(db);
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

        public async Task<TrabajoActualizarResultado> ActualizarAsync(long id, ActualizarTrabajoRequest request, int? usuarioId)
        {
            var errores = ValidarCampos(request);
            if (errores.Count > 0)
                throw new System.InvalidOperationException(string.Join(" ", errores));

            return await _repo.ActualizarAsync(id, request, usuarioId);
        }

        public Task<TrabajoEliminarResultado> EliminarAsync(long id, int version, int? usuarioId) =>
            _repo.EliminarAsync(id, version, usuarioId);

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
                errores.Add($"Prioridad inválida: '{r.Prioridad}'. Valores permitidos: {string.Join(", ", PrioridadesValidas)}.");

            if (!EstadosValidos.Contains(r.Estado))
                errores.Add($"Estado inválido: '{r.Estado}'. Valores permitidos: {string.Join(", ", EstadosValidos)}.");

            if (r.CantidadFaltanteAjusteManual)
            {
                if (r.CantidadFaltanteManual is null)
                    errores.Add("El ajuste manual de cantidad faltante requiere un valor.");
                else if (r.CantidadFaltanteManual < 0)
                    errores.Add("La cantidad faltante ajustada no puede ser negativa.");

                if (string.IsNullOrWhiteSpace(r.CantidadFaltanteJustificacion))
                    errores.Add("El ajuste manual de cantidad faltante requiere una justificación.");
            }

            if (r.CantidadFaltanteJustificacion?.Length > MaxLargoJustificacion)
                errores.Add($"La justificación de cantidad faltante no puede superar {MaxLargoJustificacion} caracteres.");

            if (r.Observaciones?.Length > MaxLargoObservaciones)
                errores.Add($"Las observaciones no pueden superar {MaxLargoObservaciones} caracteres.");

            return errores;
        }
    }
}
