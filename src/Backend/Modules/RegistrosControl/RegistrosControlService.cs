using QualityControlCenter.Repositories.RegistrosControl;
using QualityControlCenter.Services;

namespace QualityControlCenter.Modules.RegistrosControl
{
    public class RegistrosControlService
    {
        private readonly RegistrosControlRepository _repo;

        public RegistrosControlService(DbService db)
        {
            _repo = new RegistrosControlRepository(db);
        }

        public async Task<object> ObtenerRegistros(
            int page,
            int limit,
            string? fechaDesde,
            string? fechaHasta,
            string? np,
            string? turno,
            string? estado,
            int? id = null
        )
        {
            page = page <= 0 ? 1 : page;
            limit = limit <= 0 ? 20 : limit;

            var result = await _repo.ObtenerRegistros(
                page,
                limit,
                fechaDesde,
                fechaHasta,
                np,
                turno,
                estado,
                id
            );

            // Cuando hay filtro de NP, el repositorio trae todo sin paginar (ver
            // RegistrosControlRepository) — la respuesta debe reflejar "todo en una sola página".
            var sinLimite = !string.IsNullOrWhiteSpace(np);
            var pages = sinLimite ? 1 : (int)Math.Ceiling(result.Total / (double)limit);

            return new
            {
                items = result.Items,
                total = result.Total,
                page = sinLimite ? 1 : page,
                limit,
                pages
            };
        }

        public async Task ValidarRegistro(int id)
        {
            await _repo.ValidarRegistro(id);
        }

        public async Task RechazarRegistro(int id)
        {
            await _repo.RechazarRegistro(id);
        }

        public async Task EliminarRegistro(int id)
        {
            await _repo.EliminarRegistro(id);
        }
    }
}
