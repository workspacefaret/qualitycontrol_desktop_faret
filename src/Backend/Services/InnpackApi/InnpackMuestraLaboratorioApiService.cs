using System;
using System.Threading.Tasks;

namespace QualityControlCenter.Backend.Services.InnpackApi
{
    // Wrapper delgado sobre InnpackApiClient para Laboratorio - Muestras INNPACK ("muestraLab.*").
    // Ver contex.md sobre la migración de INNPACK a arquitectura API.
    public class InnpackMuestraLaboratorioApiService
    {
        private readonly InnpackApiClient _client;

        public InnpackMuestraLaboratorioApiService(InnpackApiClient client)
        {
            _client = client;
        }

        public Task<(bool ok, string body)> CrearMuestraAsync(object request) => _client.PostJsonAsync("api/muestra-laboratorio", request);

        public Task<(bool ok, string body)> ListAsync(
            string? estado,
            string? tipoMuestra,
            string? np,
            string? fechaDesde = null,
            string? fechaHasta = null,
            string? cliente = null,
            string? codigoProducto = null,
            string? descripcion = null,
            string? origen = null,
            int? maquinaId = null,
            string? analistaNombre = null,
            string? bobina = null
        )
        {
            var query = "api/muestra-laboratorio?";
            void Add(string clave, string? valor)
            {
                if (!string.IsNullOrWhiteSpace(valor))
                    query += $"{clave}={System.Uri.EscapeDataString(valor)}&";
            }
            Add("estado", estado);
            Add("tipoMuestra", tipoMuestra);
            Add("np", np);
            Add("fechaDesde", fechaDesde);
            Add("fechaHasta", fechaHasta);
            Add("cliente", cliente);
            Add("codigoProducto", codigoProducto);
            Add("descripcion", descripcion);
            Add("origen", origen);
            Add("analistaNombre", analistaNombre);
            Add("bobina", bobina);
            if (maquinaId.HasValue)
                query += $"maquinaId={maquinaId.Value}&";
            return _client.GetAsync(query.TrimEnd('&', '?'));
        }

        public Task<(bool ok, string body)> DetalleAsync(int id) => _client.GetAsync($"api/muestra-laboratorio/{id}");

        public Task<(bool ok, string body)> CatalogosAsync() => _client.GetAsync("api/muestra-laboratorio/catalogos");

        public Task<(bool ok, string body)> ActualizarFechaEnsayoAsync(int id, object request) =>
            _client.PutJsonAsync($"api/muestra-laboratorio/{id}/fecha-ensayo", request);

        public Task<(bool ok, string body)> GuardarHumedadAsync(object request) => _client.PostJsonAsync("api/muestra-laboratorio/humedad", request);

        public Task<(bool ok, string body)> GuardarGramajeAsync(object request) => _client.PostJsonAsync("api/muestra-laboratorio/gramaje", request);

        public Task<(bool ok, string body)> GuardarCobbAsync(object request) => _client.PostJsonAsync("api/muestra-laboratorio/cobb", request);

        public Task<(bool ok, string body)> GuardarEspesorAsync(object request) => _client.PostJsonAsync("api/muestra-laboratorio/espesor", request);

        public Task<(bool ok, string body)> GuardarRctAsync(object request) => _client.PostJsonAsync("api/muestra-laboratorio/rct", request);

        public Task<(bool ok, string body)> GuardarFctAsync(object request) => _client.PostJsonAsync("api/muestra-laboratorio/fct", request);

        public Task<(bool ok, string body)> GuardarEctAsync(object request) => _client.PostJsonAsync("api/muestra-laboratorio/ect", request);

        public Task<(bool ok, string body)> GuardarBctMedidoAsync(object request) =>
            _client.PostJsonAsync("api/muestra-laboratorio/bct-medido", request);

        public Task<(bool ok, string body)> GuardarBctTeoricoAsync(object request) =>
            _client.PostJsonAsync("api/muestra-laboratorio/bct-teorico", request);

        public Task<(bool ok, string body)> GuardarViscosidadAsync(object request) =>
            _client.PostJsonAsync("api/muestra-laboratorio/viscosidad", request);

        public Task<(bool ok, string body)> GuardarPhAsync(object request) => _client.PostJsonAsync("api/muestra-laboratorio/ph", request);

        public Task<(bool ok, string body)> GuardarSolidosAsync(object request) => _client.PostJsonAsync("api/muestra-laboratorio/solidos", request);

        public Task<(bool ok, string body)> GuardarLugolAsync(object request) => _client.PostJsonAsync("api/muestra-laboratorio/lugol", request);

        public Task<(bool ok, string body)> ListarEspecificacionesAsync() => _client.GetAsync("api/muestra-laboratorio/especificaciones");

        public Task<(bool ok, string body)> GuardarEspecificacionAsync(object request) =>
            _client.PostJsonAsync("api/muestra-laboratorio/especificaciones", request);

        public Task<(bool ok, string body)> CambiarActivoEspecificacionAsync(int id, bool activo) =>
            _client.PatchJsonAsync($"api/muestra-laboratorio/especificaciones/{id}/activo", new { activo });

        public Task<(bool ok, string body)> AnularEnsayoAsync(int ensayoId, string motivo) =>
            _client.PostJsonAsync($"api/muestra-laboratorio/ensayos/{ensayoId}/anular", new { motivo });

        public Task<(bool ok, string body)> CrearNoConformidadAsync(int muestraId, string? usuarioNombre) =>
            _client.PostJsonAsync($"api/muestra-laboratorio/{muestraId}/nc", new { usuarioNombre });

        public Task<(bool ok, string body)> IndicadoresAsync() => _client.GetAsync("api/muestra-laboratorio/indicadores");

        // Punto 3 del REG-LAB-04: adjuntar archivo(s)/fotografía(s) al registro completo de la
        // muestra. Mismo patrón que InnpackControlDocumentalApiService (JSON+base64).
        public Task<(bool ok, string body)> SubirAdjuntoAsync(int muestraId, object request) =>
            _client.PostJsonAsync($"api/muestra-laboratorio/{muestraId}/adjunto", request);

        public Task<(bool ok, string body)> ObtenerAdjuntoAsync(int adjuntoId) =>
            _client.GetAsync($"api/muestra-laboratorio/adjunto/{adjuntoId}");

        public Task<(bool ok, string body)> EliminarAdjuntoAsync(int adjuntoId) =>
            _client.DeleteAsync($"api/muestra-laboratorio/adjunto/{adjuntoId}");

        // Punto 2/34 del REG-LAB-04: anular el registro (muestra) completo.
        public Task<(bool ok, string body)> AnularMuestraAsync(int muestraId, object request) =>
            _client.PostJsonAsync($"api/muestra-laboratorio/{muestraId}/anular", request);

        // Botón "Eliminar" del listado: borrado lógico, distinto de Anular.
        public Task<(bool ok, string body)> EliminarMuestraAsync(int muestraId) =>
            _client.DeleteAsync($"api/muestra-laboratorio/{muestraId}");

        // Punto 12 del REG-LAB-04: antecedente histórico de una bobina muestreada (Punto 11).
        public Task<(bool ok, string body)> BuscarHistorialBobinaAsync(string numeroBobina, int excluirMuestraId) =>
            _client.GetAsync($"api/muestra-laboratorio/bobina-historial?numeroBobina={Uri.EscapeDataString(numeroBobina)}&excluirMuestraId={excluirMuestraId}");

        // Punto 32 del REG-LAB-04: administración del maestro de métodos.
        public Task<(bool ok, string body)> ListarMetodosAsync() => _client.GetAsync("api/muestra-laboratorio/metodos");

        public Task<(bool ok, string body)> GuardarMetodoAsync(object request) =>
            _client.PostJsonAsync("api/muestra-laboratorio/metodos", request);

        public Task<(bool ok, string body)> CambiarActivoMetodoAsync(int id, bool activo) =>
            _client.PatchJsonAsync($"api/muestra-laboratorio/metodos/{id}/activo", new { activo });

        // Puntos 1/8/9/10/38 del REG-LAB-04: vista agrupada por NP + N.º de registro de producción.
        public Task<(bool ok, string body)> ObtenerControlesPorRegistroProduccionAsync(string np, string? lote)
        {
            var query = $"api/muestra-laboratorio/registro-produccion?np={Uri.EscapeDataString(np)}";
            if (!string.IsNullOrWhiteSpace(lote))
                query += $"&lote={Uri.EscapeDataString(lote)}";
            return _client.GetAsync(query);
        }
    }
}
