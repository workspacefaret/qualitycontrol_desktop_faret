using QualityControlCenter.Services;

namespace QualityControlCenter.Modules.Laboratorio
{
    public class LaboratorioService
    {
        private readonly LaboratorioRepository _repository;

        public LaboratorioService(DbService db)
        {
            _repository = new LaboratorioRepository(db);
        }

        public async Task<LaboratorioResumenDto> ObtenerResumen(
            string fechaDesde,
            string fechaHasta,
            string ensayo,
            string material
        )
        {
            return await _repository.ObtenerResumen(fechaDesde, fechaHasta, ensayo, material);
        }
    }
}
