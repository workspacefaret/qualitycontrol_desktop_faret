using System.Collections.Generic;
using System.Threading.Tasks;
using MySqlConnector;
using QualityControlCenter.Services;

namespace QualityControlCenter.Repositories.NoConformidades
{
    public class CatalogoNcItem
    {
        public int Id { get; set; }
        public string Nombre { get; set; } = string.Empty;
        public bool Activo { get; set; }
    }

    // Catálogos administrables del formulario de No Conformidades de INNPACK: Cliente, Categoría
    // defecto, Tipo de falla, Supervisor, Revisado por, Área, Familia de producto, Nivel,
    // Impacto. Conexión directa a MySQL `calidad` (mismo DbService que usa
    // NoConformidadesRepository) — INNPACK no pasa por ninguna API REST, a diferencia del
    // equivalente en Faret (PncCatalogosRepository, que sí es HTTP). Mismo patrón de 3 helpers
    // genéricos ya probado ahí: listar / crear (insertar y recuperar en caso de duplicado, sin
    // ventana de carrera) / desactivar.
    public class NoConformidadesCatalogosRepository
    {
        private readonly DbService _db;

        public NoConformidadesCatalogosRepository(DbService db)
        {
            _db = db;
        }

        public Task<List<CatalogoNcItem>> GetClientesAsync(bool soloActivos = true) =>
            GetCatalogoAsync("cat_nc_clientes", soloActivos);
        public Task<CatalogoNcItem> CrearClienteAsync(string nombre, string? creadoPor) =>
            CrearCatalogoAsync("cat_nc_clientes", nombre, creadoPor);
        public Task<bool> DesactivarClienteAsync(int id) => DesactivarCatalogoAsync("cat_nc_clientes", id);

        public Task<List<CatalogoNcItem>> GetCategoriasDefectoAsync(bool soloActivos = true) =>
            GetCatalogoAsync("cat_nc_categorias_defecto", soloActivos);
        public Task<CatalogoNcItem> CrearCategoriaDefectoAsync(string nombre, string? creadoPor) =>
            CrearCatalogoAsync("cat_nc_categorias_defecto", nombre, creadoPor);
        public Task<bool> DesactivarCategoriaDefectoAsync(int id) =>
            DesactivarCatalogoAsync("cat_nc_categorias_defecto", id);

        public Task<List<CatalogoNcItem>> GetTiposFallaAsync(bool soloActivos = true) =>
            GetCatalogoAsync("cat_nc_tipos_falla", soloActivos);
        public Task<CatalogoNcItem> CrearTipoFallaAsync(string nombre, string? creadoPor) =>
            CrearCatalogoAsync("cat_nc_tipos_falla", nombre, creadoPor);
        public Task<bool> DesactivarTipoFallaAsync(int id) => DesactivarCatalogoAsync("cat_nc_tipos_falla", id);

        public Task<List<CatalogoNcItem>> GetSupervisoresAsync(bool soloActivos = true) =>
            GetCatalogoAsync("cat_nc_supervisores", soloActivos);
        public Task<CatalogoNcItem> CrearSupervisorAsync(string nombre, string? creadoPor) =>
            CrearCatalogoAsync("cat_nc_supervisores", nombre, creadoPor);
        public Task<bool> DesactivarSupervisorAsync(int id) => DesactivarCatalogoAsync("cat_nc_supervisores", id);

        public Task<List<CatalogoNcItem>> GetRevisoresAsync(bool soloActivos = true) =>
            GetCatalogoAsync("cat_nc_revisores", soloActivos);
        public Task<CatalogoNcItem> CrearRevisorAsync(string nombre, string? creadoPor) =>
            CrearCatalogoAsync("cat_nc_revisores", nombre, creadoPor);
        public Task<bool> DesactivarRevisorAsync(int id) => DesactivarCatalogoAsync("cat_nc_revisores", id);

        public Task<List<CatalogoNcItem>> GetAreasAsync(bool soloActivos = true) =>
            GetCatalogoAsync("cat_nc_areas", soloActivos);
        public Task<CatalogoNcItem> CrearAreaAsync(string nombre, string? creadoPor) =>
            CrearCatalogoAsync("cat_nc_areas", nombre, creadoPor);
        public Task<bool> DesactivarAreaAsync(int id) => DesactivarCatalogoAsync("cat_nc_areas", id);

        public Task<List<CatalogoNcItem>> GetFamiliasProductoAsync(bool soloActivos = true) =>
            GetCatalogoAsync("cat_nc_familias_producto", soloActivos);
        public Task<CatalogoNcItem> CrearFamiliaProductoAsync(string nombre, string? creadoPor) =>
            CrearCatalogoAsync("cat_nc_familias_producto", nombre, creadoPor);
        public Task<bool> DesactivarFamiliaProductoAsync(int id) =>
            DesactivarCatalogoAsync("cat_nc_familias_producto", id);

        public Task<List<CatalogoNcItem>> GetNivelesAsync(bool soloActivos = true) =>
            GetCatalogoAsync("cat_nc_niveles", soloActivos);
        public Task<CatalogoNcItem> CrearNivelAsync(string nombre, string? creadoPor) =>
            CrearCatalogoAsync("cat_nc_niveles", nombre, creadoPor);
        public Task<bool> DesactivarNivelAsync(int id) => DesactivarCatalogoAsync("cat_nc_niveles", id);

        public Task<List<CatalogoNcItem>> GetImpactosAsync(bool soloActivos = true) =>
            GetCatalogoAsync("cat_nc_impactos", soloActivos);
        public Task<CatalogoNcItem> CrearImpactoAsync(string nombre, string? creadoPor) =>
            CrearCatalogoAsync("cat_nc_impactos", nombre, creadoPor);
        public Task<bool> DesactivarImpactoAsync(int id) => DesactivarCatalogoAsync("cat_nc_impactos", id);

        // ── Helpers genéricos (tabla siempre viene de una constante hardcodeada arriba) ────────

        private async Task<List<CatalogoNcItem>> GetCatalogoAsync(string tabla, bool soloActivos)
        {
            var where = soloActivos ? "WHERE activo = 1" : "";
            await using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            await using var cmd = new MySqlCommand($"SELECT id, nombre, activo FROM {tabla} {where} ORDER BY nombre", conn);
            await using var reader = await cmd.ExecuteReaderAsync();

            var lista = new List<CatalogoNcItem>();
            while (await reader.ReadAsync())
            {
                lista.Add(new CatalogoNcItem
                {
                    Id = reader.GetInt32("id"),
                    Nombre = reader.GetString("nombre"),
                    Activo = reader.GetBoolean("activo"),
                });
            }
            return lista;
        }

        // Inserta directo (sin SELECT previo) y confía en el UNIQUE(nombre) de la tabla: si otro
        // request insertó el mismo nombre entre que este proceso lo validó y lo guardó, MySQL
        // devuelve 1062 (duplicate entry) acá mismo — se captura y se recupera la fila ya
        // existente, sin ventana de carrera (mismo patrón ya usado en PncCatalogosRepository,
        // Faret). Si la fila estaba desactivada, se reactiva.
        private async Task<CatalogoNcItem> CrearCatalogoAsync(string tabla, string nombre, string? creadoPor)
        {
            await using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            try
            {
                await using var insertCmd = new MySqlCommand(
                    $"INSERT INTO {tabla} (nombre, creado_por) VALUES (@nombre, @creadoPor)", conn);
                insertCmd.Parameters.AddWithValue("@nombre", nombre);
                insertCmd.Parameters.AddWithValue("@creadoPor", (object?)creadoPor ?? System.DBNull.Value);
                await insertCmd.ExecuteNonQueryAsync();

                return new CatalogoNcItem { Id = (int)insertCmd.LastInsertedId, Nombre = nombre, Activo = true };
            }
            catch (MySqlException ex) when (ex.Number == 1062)
            {
                int existingId;
                string existingNombre;
                bool existingActivo;

                await using (var selectCmd = new MySqlCommand(
                    $"SELECT id, nombre, activo FROM {tabla} WHERE nombre = @nombre LIMIT 1", conn))
                {
                    selectCmd.Parameters.AddWithValue("@nombre", nombre);
                    await using var reader = await selectCmd.ExecuteReaderAsync();
                    if (!await reader.ReadAsync())
                        throw;

                    existingId = reader.GetInt32("id");
                    existingNombre = reader.GetString("nombre");
                    existingActivo = reader.GetBoolean("activo");
                }

                if (!existingActivo)
                {
                    await using var reactivarCmd = new MySqlCommand($"UPDATE {tabla} SET activo = 1 WHERE id = @id", conn);
                    reactivarCmd.Parameters.AddWithValue("@id", existingId);
                    await reactivarCmd.ExecuteNonQueryAsync();
                    existingActivo = true;
                }

                return new CatalogoNcItem { Id = existingId, Nombre = existingNombre, Activo = existingActivo };
            }
        }

        private async Task<bool> DesactivarCatalogoAsync(string tabla, int id)
        {
            await using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            await using var cmd = new MySqlCommand($"UPDATE {tabla} SET activo = 0 WHERE id = @id AND activo = 1", conn);
            cmd.Parameters.AddWithValue("@id", id);
            var filas = await cmd.ExecuteNonQueryAsync();
            return filas > 0;
        }
    }
}
