using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using MySqlConnector;
using QualityControlCenter.Services;

namespace QualityControlCenter.Modules.TalleresExternos
{
    // Módulo INNPACK "Talleres Externos" — tablas propias en la BD calidad (talleres_externos_trabajos,
    // cat_talleres_externos, cat_procesos_externos), sin relación con las tablas homónimas de Faret
    // (esas viven en la BD qualitycontrolfaret de un servidor de API distinto, accedidas solo por REST).
    public class TalleresExternosRepository
    {
        private const string SelectColumnas = @"
            t.id, t.nv, t.producto, t.codigo_producto, t.item, t.cliente, t.fecha_asignacion,
            t.taller_externo_id, t.taller_externo_texto, t.proceso_id, t.proceso_texto,
            t.responsable_interno_id, t.responsable_interno_texto,
            t.prioridad, t.fecha_compromiso, t.estado,
            t.cantidad_a_revisar, t.cantidad_revisada_entregada, t.cantidad_faltante,
            t.cantidad_faltante_ajuste_manual, t.cantidad_faltante_justificacion, t.observaciones,
            t.version, t.creado_por, uc.nombre_completo AS creado_por_nombre, t.fecha_creacion,
            t.actualizado_por, ua.nombre_completo AS actualizado_por_nombre, t.fecha_actualizacion,
            (t.fecha_compromiso IS NOT NULL AND t.fecha_compromiso < CURDATE()
                AND t.estado NOT IN ('ENTREGADO','ANULADO')) AS atrasado";

        private const string FromJoin = @"
            FROM talleres_externos_trabajos t
            LEFT JOIN usuarios uc ON uc.id = t.creado_por
            LEFT JOIN usuarios ua ON ua.id = t.actualizado_por";

        private readonly DbService _db;

        public TalleresExternosRepository(DbService db)
        {
            _db = db;
        }

        public async Task<TrabajoListResponse> GetListAsync(int page, int pageSize)
        {
            using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            const string where = "WHERE t.eliminado = 0";

            long totalCount;
            using (var countCmd = new MySqlCommand($"SELECT COUNT(*) {FromJoin} {where}", conn))
                totalCount = Convert.ToInt64(await countCmd.ExecuteScalarAsync());

            var sql = $@"
                SELECT {SelectColumnas}
                {FromJoin}
                {where}
                ORDER BY t.fecha_creacion DESC, t.id DESC
                LIMIT @limit OFFSET @offset";

            using var cmd = new MySqlCommand(sql, conn);
            cmd.Parameters.AddWithValue("@limit", pageSize);
            cmd.Parameters.AddWithValue("@offset", (page - 1) * pageSize);

            using var reader = await cmd.ExecuteReaderAsync();
            var items = new List<TrabajoItem>();
            while (await reader.ReadAsync())
                items.Add(MapTrabajo(reader));

            return new TrabajoListResponse { Items = items, TotalCount = totalCount, Page = page, PageSize = pageSize };
        }

        public async Task<CatalogosTalleresExternosDto> GetCatalogosAsync()
        {
            using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            var dto = new CatalogosTalleresExternosDto();

            using (var cmd = new MySqlCommand(
                "SELECT id, nombre, activo FROM cat_talleres_externos WHERE activo = 1 ORDER BY nombre", conn))
            using (var reader = await cmd.ExecuteReaderAsync())
            {
                while (await reader.ReadAsync())
                    dto.Talleres.Add(new CatalogoItemDto { Id = reader.GetInt32("id"), Nombre = reader.GetString("nombre"), Activo = reader.GetBoolean("activo") });
            }

            using (var cmd = new MySqlCommand(
                "SELECT id, nombre, activo FROM cat_procesos_externos WHERE activo = 1 ORDER BY nombre", conn))
            using (var reader = await cmd.ExecuteReaderAsync())
            {
                while (await reader.ReadAsync())
                    dto.Procesos.Add(new CatalogoItemDto { Id = reader.GetInt32("id"), Nombre = reader.GetString("nombre"), Activo = reader.GetBoolean("activo") });
            }

            return dto;
        }

        // Desactivación (activo=0), nunca DELETE físico: los trabajos ya guardados conservan su
        // propia copia de texto (taller_externo_texto/proceso_texto), así que desactivar el catálogo
        // no altera nada de lo ya guardado, solo lo saca de las sugerencias hacia adelante.
        public Task<bool> DesactivarTallerAsync(int id) => DesactivarCatalogoAsync("cat_talleres_externos", id);

        public Task<bool> DesactivarProcesoAsync(int id) => DesactivarCatalogoAsync("cat_procesos_externos", id);

        private async Task<bool> DesactivarCatalogoAsync(string tabla, int id)
        {
            using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            using var cmd = new MySqlCommand($"UPDATE {tabla} SET activo = 0 WHERE id = @id AND activo = 1", conn);
            cmd.Parameters.AddWithValue("@id", id);
            var filas = await cmd.ExecuteNonQueryAsync();
            return filas > 0;
        }

        public async Task<TrabajoItem> CrearAsync(CrearTrabajoRequest request, int? usuarioId)
        {
            using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();
            using var tx = await conn.BeginTransactionAsync();
            try
            {
                var id = await InsertarAsync(conn, tx, request, usuarioId);
                await tx.CommitAsync();
                return await GetByIdInternoAsync(conn, null, id)
                    ?? throw new InvalidOperationException("Error interno al leer el registro recién creado.");
            }
            catch
            {
                await tx.RollbackAsync();
                throw;
            }
        }

        public async Task<TrabajoActualizarResultado> ActualizarAsync(long id, ActualizarTrabajoRequest request, int? usuarioId)
        {
            using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();
            using var tx = await conn.BeginTransactionAsync();
            try
            {
                var (versionActual, eliminado, existe) = await LeerVersionParaUpdateAsync(conn, tx, id);
                if (!existe || eliminado)
                {
                    await tx.RollbackAsync();
                    return new TrabajoActualizarResultado { NoEncontrado = true, Error = $"No existe un trabajo con id {id}." };
                }

                if (request.Version != versionActual)
                {
                    await tx.RollbackAsync();
                    return new TrabajoActualizarResultado
                    {
                        Conflicto = true,
                        Error = "El registro fue modificado por otro usuario. Vuelve a cargarlo antes de guardar.",
                    };
                }

                var (tallerId, tallerTexto) = await ResolverCatalogoAsync(conn, tx, "cat_talleres_externos", request.TallerExternoId, request.TallerExternoNombre);
                var (procesoId, procesoTexto) = await ResolverCatalogoAsync(conn, tx, "cat_procesos_externos", request.ProcesoId, request.ProcesoNombre);
                var (respId, respTexto) = await ResolverResponsableAsync(conn, tx, request.ResponsableInternoId, request.ResponsableInternoNombre);
                var cantidadFaltante = CalcularCantidadFaltante(request);
                var nuevaVersion = versionActual + 1;

                const string sql = @"
                    UPDATE talleres_externos_trabajos SET
                        nv=@nv, producto=@producto, codigo_producto=@codigoProducto, item=@item, cliente=@cliente,
                        fecha_asignacion=@fechaAsignacion,
                        taller_externo_id=@tallerId, taller_externo_texto=@tallerTexto,
                        proceso_id=@procesoId, proceso_texto=@procesoTexto,
                        responsable_interno_id=@respId, responsable_interno_texto=@respTexto,
                        prioridad=@prioridad, fecha_compromiso=@fechaCompromiso, estado=@estado,
                        cantidad_a_revisar=@cantidadARevisar, cantidad_revisada_entregada=@cantidadRevisadaEntregada,
                        cantidad_faltante=@cantidadFaltante,
                        cantidad_faltante_ajuste_manual=@ajusteManual, cantidad_faltante_justificacion=@justificacion,
                        observaciones=@observaciones,
                        version=@nuevaVersion, actualizado_por=@actualizadoPor, fecha_actualizacion=UTC_TIMESTAMP()
                    WHERE id=@id AND version=@versionActual";

                using (var cmd = new MySqlCommand(sql, conn, tx))
                {
                    AgregarParametrosComunes(cmd, request, tallerId, tallerTexto, procesoId, procesoTexto, respId, respTexto, cantidadFaltante);
                    cmd.Parameters.AddWithValue("@nuevaVersion", nuevaVersion);
                    cmd.Parameters.AddWithValue("@actualizadoPor", (object?)usuarioId ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@id", id);
                    cmd.Parameters.AddWithValue("@versionActual", versionActual);
                    var filas = await cmd.ExecuteNonQueryAsync();
                    if (filas == 0)
                    {
                        await tx.RollbackAsync();
                        return new TrabajoActualizarResultado { Conflicto = true, Error = "El registro fue modificado por otro usuario." };
                    }
                }

                await tx.CommitAsync();
                var actualizado = await GetByIdInternoAsync(conn, null, id);
                return new TrabajoActualizarResultado { Ok = true, Trabajo = actualizado };
            }
            catch
            {
                await tx.RollbackAsync();
                throw;
            }
        }

        public async Task<TrabajoEliminarResultado> EliminarAsync(long id, int version, int? usuarioId)
        {
            using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();
            using var tx = await conn.BeginTransactionAsync();
            try
            {
                var (versionActual, eliminado, existe) = await LeerVersionParaUpdateAsync(conn, tx, id);
                if (!existe || eliminado)
                {
                    await tx.RollbackAsync();
                    return new TrabajoEliminarResultado { NoEncontrado = true };
                }

                if (version != versionActual)
                {
                    await tx.RollbackAsync();
                    return new TrabajoEliminarResultado { Conflicto = true, Error = "El registro fue modificado por otro usuario." };
                }

                const string sql = @"
                    UPDATE talleres_externos_trabajos
                    SET eliminado = 1, estado = 'ANULADO', fecha_anulacion = UTC_TIMESTAMP(), anulado_por = @usuarioId,
                        version = @nuevaVersion, actualizado_por = @usuarioId, fecha_actualizacion = UTC_TIMESTAMP()
                    WHERE id = @id AND version = @versionActual";

                using var cmd = new MySqlCommand(sql, conn, tx);
                cmd.Parameters.AddWithValue("@usuarioId", (object?)usuarioId ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@nuevaVersion", versionActual + 1);
                cmd.Parameters.AddWithValue("@id", id);
                cmd.Parameters.AddWithValue("@versionActual", versionActual);
                var filas = await cmd.ExecuteNonQueryAsync();
                if (filas == 0)
                {
                    await tx.RollbackAsync();
                    return new TrabajoEliminarResultado { Conflicto = true, Error = "El registro fue modificado por otro usuario." };
                }

                await tx.CommitAsync();
                return new TrabajoEliminarResultado { Ok = true };
            }
            catch
            {
                await tx.RollbackAsync();
                throw;
            }
        }

        private static decimal CalcularCantidadFaltante(CrearTrabajoRequest r) =>
            r.CantidadFaltanteAjusteManual && r.CantidadFaltanteManual.HasValue
                ? r.CantidadFaltanteManual.Value
                : r.CantidadARevisar - r.CantidadRevisadaEntregada;

        private static async Task<long> InsertarAsync(MySqlConnection conn, MySqlTransaction tx, CrearTrabajoRequest r, int? usuarioId)
        {
            var (tallerId, tallerTexto) = await ResolverCatalogoAsync(conn, tx, "cat_talleres_externos", r.TallerExternoId, r.TallerExternoNombre);
            var (procesoId, procesoTexto) = await ResolverCatalogoAsync(conn, tx, "cat_procesos_externos", r.ProcesoId, r.ProcesoNombre);
            var (respId, respTexto) = await ResolverResponsableAsync(conn, tx, r.ResponsableInternoId, r.ResponsableInternoNombre);
            var cantidadFaltante = CalcularCantidadFaltante(r);

            const string sql = @"
                INSERT INTO talleres_externos_trabajos
                    (nv, producto, codigo_producto, item, cliente, fecha_asignacion,
                     taller_externo_id, taller_externo_texto, proceso_id, proceso_texto,
                     responsable_interno_id, responsable_interno_texto,
                     prioridad, fecha_compromiso, estado,
                     cantidad_a_revisar, cantidad_revisada_entregada, cantidad_faltante,
                     cantidad_faltante_ajuste_manual, cantidad_faltante_justificacion, observaciones,
                     version, creado_por, fecha_creacion)
                VALUES
                    (@nv, @producto, @codigoProducto, @item, @cliente, @fechaAsignacion,
                     @tallerId, @tallerTexto, @procesoId, @procesoTexto,
                     @respId, @respTexto,
                     @prioridad, @fechaCompromiso, @estado,
                     @cantidadARevisar, @cantidadRevisadaEntregada, @cantidadFaltante,
                     @ajusteManual, @justificacion, @observaciones,
                     1, @creadoPor, UTC_TIMESTAMP())";

            using var cmd = new MySqlCommand(sql, conn, tx);
            AgregarParametrosComunes(cmd, r, tallerId, tallerTexto, procesoId, procesoTexto, respId, respTexto, cantidadFaltante);
            cmd.Parameters.AddWithValue("@creadoPor", (object?)usuarioId ?? DBNull.Value);
            await cmd.ExecuteNonQueryAsync();
            return cmd.LastInsertedId;
        }

        private static void AgregarParametrosComunes(
            MySqlCommand cmd, CrearTrabajoRequest r,
            int? tallerId, string? tallerTexto, int? procesoId, string? procesoTexto,
            int? respId, string? respTexto, decimal cantidadFaltante)
        {
            cmd.Parameters.AddWithValue("@nv", r.Nv);
            cmd.Parameters.AddWithValue("@producto", r.Producto);
            cmd.Parameters.AddWithValue("@codigoProducto", (object?)r.CodigoProducto ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@item", r.Item);
            cmd.Parameters.AddWithValue("@cliente", (object?)r.Cliente ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@fechaAsignacion", (object?)r.FechaAsignacion ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@tallerId", (object?)tallerId ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@tallerTexto", (object?)tallerTexto ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@procesoId", (object?)procesoId ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@procesoTexto", (object?)procesoTexto ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@respId", (object?)respId ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@respTexto", (object?)respTexto ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@prioridad", r.Prioridad);
            cmd.Parameters.AddWithValue("@fechaCompromiso", (object?)r.FechaCompromiso ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@estado", r.Estado);
            cmd.Parameters.AddWithValue("@cantidadARevisar", r.CantidadARevisar);
            cmd.Parameters.AddWithValue("@cantidadRevisadaEntregada", r.CantidadRevisadaEntregada);
            cmd.Parameters.AddWithValue("@cantidadFaltante", cantidadFaltante);
            cmd.Parameters.AddWithValue("@ajusteManual", r.CantidadFaltanteAjusteManual);
            cmd.Parameters.AddWithValue("@justificacion", (object?)r.CantidadFaltanteJustificacion ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@observaciones", (object?)r.Observaciones ?? DBNull.Value);
        }

        private static async Task<(int Version, bool Eliminado, bool Existe)> LeerVersionParaUpdateAsync(
            MySqlConnection conn, MySqlTransaction tx, long id)
        {
            const string sql = "SELECT version, eliminado FROM talleres_externos_trabajos WHERE id = @id FOR UPDATE";
            using var cmd = new MySqlCommand(sql, conn, tx);
            cmd.Parameters.AddWithValue("@id", id);
            using var reader = await cmd.ExecuteReaderAsync();
            if (!await reader.ReadAsync())
                return (0, false, false);
            return (reader.GetInt32("version"), reader.GetBoolean("eliminado"), true);
        }

        private static async Task<(int? Id, string? Texto)> ResolverCatalogoAsync(
            MySqlConnection conn, MySqlTransaction tx, string tabla, int? id, string? nombre)
        {
            if (id.HasValue)
            {
                using var cmd = new MySqlCommand($"SELECT nombre FROM {tabla} WHERE id = @id", conn, tx);
                cmd.Parameters.AddWithValue("@id", id.Value);
                var nombreActual = await cmd.ExecuteScalarAsync() as string;
                return nombreActual != null ? (id, nombreActual) : (null, nombre?.Trim());
            }

            if (string.IsNullOrWhiteSpace(nombre))
                return (null, null);

            var nombreLimpio = nombre.Trim();

            using (var selectCmd = new MySqlCommand($"SELECT id, nombre FROM {tabla} WHERE nombre = @nombre LIMIT 1", conn, tx))
            {
                selectCmd.Parameters.AddWithValue("@nombre", nombreLimpio);
                using var reader = await selectCmd.ExecuteReaderAsync();
                if (await reader.ReadAsync())
                    return (reader.GetInt32("id"), reader.GetString("nombre"));
            }

            using var insertCmd = new MySqlCommand($"INSERT INTO {tabla} (nombre) VALUES (@nombre)", conn, tx);
            insertCmd.Parameters.AddWithValue("@nombre", nombreLimpio);
            await insertCmd.ExecuteNonQueryAsync();
            return ((int)insertCmd.LastInsertedId, nombreLimpio);
        }

        private static async Task<(int? Id, string? Texto)> ResolverResponsableAsync(
            MySqlConnection conn, MySqlTransaction tx, int? responsableId, string? responsableNombre)
        {
            if (responsableId.HasValue)
            {
                using var cmd = new MySqlCommand("SELECT nombre_completo FROM usuarios WHERE id = @id", conn, tx);
                cmd.Parameters.AddWithValue("@id", responsableId.Value);
                var nombreActual = await cmd.ExecuteScalarAsync() as string;
                return nombreActual != null ? (responsableId, nombreActual) : (null, responsableNombre?.Trim());
            }

            return (null, string.IsNullOrWhiteSpace(responsableNombre) ? null : responsableNombre.Trim());
        }

        private static async Task<TrabajoItem?> GetByIdInternoAsync(MySqlConnection conn, MySqlTransaction? tx, long id)
        {
            var sql = $@"
                SELECT {SelectColumnas}
                {FromJoin}
                WHERE t.id = @id";

            using var cmd = tx == null ? new MySqlCommand(sql, conn) : new MySqlCommand(sql, conn, tx);
            cmd.Parameters.AddWithValue("@id", id);
            using var reader = await cmd.ExecuteReaderAsync();
            return await reader.ReadAsync() ? MapTrabajo(reader) : null;
        }

        private static TrabajoItem MapTrabajo(MySqlDataReader reader) => new()
        {
            Id = reader.GetInt64("id"),
            Nv = reader.GetString("nv"),
            Producto = reader.GetString("producto"),
            CodigoProducto = reader.IsDBNull(reader.GetOrdinal("codigo_producto")) ? null : reader.GetString("codigo_producto"),
            Item = reader.GetString("item"),
            Cliente = reader.IsDBNull(reader.GetOrdinal("cliente")) ? null : reader.GetString("cliente"),
            FechaAsignacion = reader.IsDBNull(reader.GetOrdinal("fecha_asignacion")) ? null : reader.GetDateTime("fecha_asignacion"),
            TallerExternoId = reader.IsDBNull(reader.GetOrdinal("taller_externo_id")) ? null : reader.GetInt32("taller_externo_id"),
            TallerExternoTexto = reader.IsDBNull(reader.GetOrdinal("taller_externo_texto")) ? null : reader.GetString("taller_externo_texto"),
            ProcesoId = reader.IsDBNull(reader.GetOrdinal("proceso_id")) ? null : reader.GetInt32("proceso_id"),
            ProcesoTexto = reader.IsDBNull(reader.GetOrdinal("proceso_texto")) ? null : reader.GetString("proceso_texto"),
            ResponsableInternoId = reader.IsDBNull(reader.GetOrdinal("responsable_interno_id")) ? null : reader.GetInt32("responsable_interno_id"),
            ResponsableInternoTexto = reader.IsDBNull(reader.GetOrdinal("responsable_interno_texto")) ? null : reader.GetString("responsable_interno_texto"),
            Prioridad = reader.GetString("prioridad"),
            FechaCompromiso = reader.IsDBNull(reader.GetOrdinal("fecha_compromiso")) ? null : reader.GetDateTime("fecha_compromiso"),
            Estado = reader.GetString("estado"),
            CantidadARevisar = reader.GetDecimal("cantidad_a_revisar"),
            CantidadRevisadaEntregada = reader.GetDecimal("cantidad_revisada_entregada"),
            CantidadFaltante = reader.GetDecimal("cantidad_faltante"),
            CantidadFaltanteAjusteManual = reader.GetBoolean("cantidad_faltante_ajuste_manual"),
            CantidadFaltanteJustificacion = reader.IsDBNull(reader.GetOrdinal("cantidad_faltante_justificacion")) ? null : reader.GetString("cantidad_faltante_justificacion"),
            Observaciones = reader.IsDBNull(reader.GetOrdinal("observaciones")) ? null : reader.GetString("observaciones"),
            Version = reader.GetInt32("version"),
            CreadoPorNombre = reader.IsDBNull(reader.GetOrdinal("creado_por_nombre")) ? null : reader.GetString("creado_por_nombre"),
            FechaCreacion = reader.GetDateTime("fecha_creacion"),
            ActualizadoPorNombre = reader.IsDBNull(reader.GetOrdinal("actualizado_por_nombre")) ? null : reader.GetString("actualizado_por_nombre"),
            FechaActualizacion = reader.IsDBNull(reader.GetOrdinal("fecha_actualizacion")) ? null : reader.GetDateTime("fecha_actualizacion"),
            Atrasado = Convert.ToBoolean(reader["atrasado"]),
        };
    }
}
