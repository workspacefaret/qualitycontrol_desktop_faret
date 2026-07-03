using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using MySqlConnector;
using QualityControlCenter.Services;

namespace QualityControlCenter.Modules.Mermas
{
    public class MermasRepository
    {
        private readonly DbService _db;

        public MermasRepository(DbService db)
        {
            _db = db;
        }

        public async Task<MermaFiltrosDto> ObtenerFiltros()
        {
            var result = new MermaFiltrosDto();

            using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            using (
                var cmd = new MySqlCommand(
                    "SELECT id, nombre FROM materiales WHERE activo = 1 ORDER BY nombre;",
                    conn
                )
            )
            {
                using var reader = await cmd.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    result.Materiales.Add(
                        new MermaOpcionDto
                        {
                            Id = reader.GetInt32("id"),
                            Nombre = reader.GetString("nombre"),
                        }
                    );
                }
            }

            using (
                var cmd = new MySqlCommand(
                    "SELECT id, nombre FROM procesos WHERE activo = 1 ORDER BY nombre;",
                    conn
                )
            )
            {
                using var reader = await cmd.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    result.Procesos.Add(
                        new MermaOpcionDto
                        {
                            Id = reader.GetInt32("id"),
                            Nombre = reader.GetString("nombre"),
                        }
                    );
                }
            }

            using (
                var cmd = new MySqlCommand(
                    "SELECT id, nombre FROM maquinas WHERE activo = 1 ORDER BY nombre;",
                    conn
                )
            )
            {
                using var reader = await cmd.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    result.Maquinas.Add(
                        new MermaOpcionDto
                        {
                            Id = reader.GetInt32("id"),
                            Nombre = reader.GetString("nombre"),
                        }
                    );
                }
            }

            return result;
        }

        public async Task<MermasResumenDto> ObtenerResumen(
            string fechaDesde,
            string fechaHasta,
            int? materialId,
            int? procesoId,
            int? maquinaId,
            string turno,
            string busqueda,
            bool sinLimite = false
        )
        {
            var result = new MermasResumenDto();

            using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            var where = BuildWhere(
                fechaDesde,
                fechaHasta,
                materialId,
                procesoId,
                maquinaId,
                turno,
                busqueda
            );

            using (
                var cmd = new MySqlCommand(
                    $@"
                SELECT
                    IFNULL(SUM(CASE WHEN rm.unidad = 'kg' THEN rm.cantidad ELSE 0 END), 0) AS total_kg,
                    IFNULL(SUM(CASE WHEN rm.unidad = 'unidad' THEN rm.cantidad ELSE 0 END), 0) AS total_unidades,
                    COUNT(*) AS cantidad_registros
                FROM registro_mermas rm
                INNER JOIN registros_control rc ON rc.id = rm.registro_id
                INNER JOIN materiales mat ON mat.id = rm.material_id
                {where.Clausula};
            ",
                    conn
                )
            )
            {
                where.AplicarParametros(cmd);

                using var reader = await cmd.ExecuteReaderAsync();
                if (await reader.ReadAsync())
                {
                    result.TotalKg = reader.GetDecimal("total_kg");
                    result.TotalUnidades = reader.GetDecimal("total_unidades");
                    result.CantidadRegistros = reader.GetInt32("cantidad_registros");
                }
            }

            using (
                var cmd = new MySqlCommand(
                    $@"
                SELECT mat.nombre AS nombre
                FROM registro_mermas rm
                INNER JOIN registros_control rc ON rc.id = rm.registro_id
                INNER JOIN materiales mat ON mat.id = rm.material_id
                {where.Clausula}
                GROUP BY mat.id, mat.nombre
                ORDER BY SUM(CASE WHEN rm.unidad = 'kg' THEN rm.cantidad ELSE 0 END) DESC
                LIMIT 1;
            ",
                    conn
                )
            )
            {
                where.AplicarParametros(cmd);

                var nombre = await cmd.ExecuteScalarAsync();
                if (nombre != null)
                {
                    result.MaterialMayorMerma = nombre.ToString() ?? "-";
                }
            }

            result.PorMaterial = await ObtenerAgrupado(conn, where, "mat.id", "mat.nombre");
            result.PorProceso = await ObtenerAgrupado(conn, where, "p.id", "p.nombre");
            result.PorMaquina = await ObtenerAgrupado(conn, where, "m.id", "m.nombre");

            var limite = sinLimite ? "" : "LIMIT 300";

            using (
                var cmd = new MySqlCommand(
                    $@"
                SELECT
                    rm.id,
                    DATE_FORMAT(rc.fecha_registro, '%d-%m-%Y') AS fecha,
                    IFNULL(rc.area, '-') AS area,
                    IFNULL(p.nombre, '-') AS proceso,
                    IFNULL(m.nombre, '-') AS maquina,
                    IFNULL(u.nombre_completo, '-') AS usuario,
                    IFNULL(rc.np, '-') AS np,
                    IFNULL(rc.codigo_producto, '-') AS codigo_producto,
                    IFNULL(rc.descripcion_producto, '-') AS descripcion_producto,
                    mat.nombre AS material,
                    rm.cantidad,
                    rm.unidad,
                    IFNULL(rm.observacion, '-') AS observacion,
                    IFNULL(rc.turno, '-') AS turno,
                    IFNULL(rc.estado_validacion, '-') AS estado_validacion
                FROM registro_mermas rm
                INNER JOIN registros_control rc ON rc.id = rm.registro_id
                INNER JOIN materiales mat ON mat.id = rm.material_id
                LEFT JOIN procesos p ON p.id = rc.proceso_id
                LEFT JOIN maquinas m ON m.id = rc.maquina_id
                LEFT JOIN usuarios u ON u.id = rc.usuario_id
                {where.Clausula}
                ORDER BY rc.fecha_registro DESC, rm.id DESC
                {limite};
            ",
                    conn
                )
            )
            {
                where.AplicarParametros(cmd);

                using var reader = await cmd.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    result.Registros.Add(
                        new MermaRegistroDto
                        {
                            Id = reader.GetInt32("id"),
                            Fecha = reader.GetString("fecha"),
                            Area = reader.GetString("area"),
                            Proceso = reader.GetString("proceso"),
                            Maquina = reader.GetString("maquina"),
                            Usuario = reader.GetString("usuario"),
                            Np = reader.GetString("np"),
                            CodigoProducto = reader.GetString("codigo_producto"),
                            DescripcionProducto = reader.GetString("descripcion_producto"),
                            Material = reader.GetString("material"),
                            Cantidad = reader.GetDecimal("cantidad"),
                            Unidad = reader.GetString("unidad"),
                            Observacion = reader.GetString("observacion"),
                            Turno = reader.GetString("turno"),
                            EstadoValidacion = reader.GetString("estado_validacion"),
                        }
                    );
                }
            }

            return result;
        }

        private async Task<List<MermaAgrupadaDto>> ObtenerAgrupado(
            MySqlConnection conn,
            FiltrosMermas where,
            string columnaId,
            string columnaNombre
        )
        {
            var lista = new List<MermaAgrupadaDto>();

            using var cmd = new MySqlCommand(
                $@"
                SELECT
                    {columnaNombre} AS nombre,
                    IFNULL(SUM(CASE WHEN rm.unidad = 'kg' THEN rm.cantidad ELSE 0 END), 0) AS total_kg,
                    IFNULL(SUM(CASE WHEN rm.unidad = 'unidad' THEN rm.cantidad ELSE 0 END), 0) AS total_unidades,
                    COUNT(*) AS registros
                FROM registro_mermas rm
                INNER JOIN registros_control rc ON rc.id = rm.registro_id
                INNER JOIN materiales mat ON mat.id = rm.material_id
                LEFT JOIN procesos p ON p.id = rc.proceso_id
                LEFT JOIN maquinas m ON m.id = rc.maquina_id
                {where.Clausula}
                GROUP BY {columnaId}, {columnaNombre}
                ORDER BY total_kg DESC, total_unidades DESC;
            ",
                conn
            );

            where.AplicarParametros(cmd);

            using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                lista.Add(
                    new MermaAgrupadaDto
                    {
                        Nombre = reader.IsDBNull(reader.GetOrdinal("nombre"))
                            ? "-"
                            : reader.GetString("nombre"),
                        TotalKg = reader.GetDecimal("total_kg"),
                        TotalUnidades = reader.GetDecimal("total_unidades"),
                        Registros = reader.GetInt32("registros"),
                    }
                );
            }

            return lista;
        }

        private static FiltrosMermas BuildWhere(
            string fechaDesde,
            string fechaHasta,
            int? materialId,
            int? procesoId,
            int? maquinaId,
            string turno,
            string busqueda
        )
        {
            var condiciones = new List<string> { "1 = 1" };
            var parametros = new List<(string Nombre, object Valor)>();

            if (!string.IsNullOrWhiteSpace(fechaDesde))
            {
                condiciones.Add("rc.fecha_registro >= @fechaDesde");
                parametros.Add(("@fechaDesde", fechaDesde));
            }

            if (!string.IsNullOrWhiteSpace(fechaHasta))
            {
                condiciones.Add("rc.fecha_registro <= @fechaHasta");
                parametros.Add(("@fechaHasta", fechaHasta));
            }

            if (materialId.HasValue && materialId > 0)
            {
                condiciones.Add("rm.material_id = @materialId");
                parametros.Add(("@materialId", materialId.Value));
            }

            if (procesoId.HasValue && procesoId > 0)
            {
                condiciones.Add("rc.proceso_id = @procesoId");
                parametros.Add(("@procesoId", procesoId.Value));
            }

            if (maquinaId.HasValue && maquinaId > 0)
            {
                condiciones.Add("rc.maquina_id = @maquinaId");
                parametros.Add(("@maquinaId", maquinaId.Value));
            }

            if (!string.IsNullOrWhiteSpace(turno))
            {
                condiciones.Add("rc.turno = @turno");
                parametros.Add(("@turno", turno));
            }

            if (!string.IsNullOrWhiteSpace(busqueda))
            {
                condiciones.Add(
                    "(rc.np LIKE @busqueda OR rc.descripcion_producto LIKE @busqueda OR rm.observacion LIKE @busqueda)"
                );
                parametros.Add(("@busqueda", $"%{busqueda}%"));
            }

            var clausula = "WHERE " + string.Join(" AND ", condiciones);

            return new FiltrosMermas(clausula, parametros);
        }

        private class FiltrosMermas
        {
            public string Clausula { get; }
            private readonly List<(string Nombre, object Valor)> _parametros;

            public FiltrosMermas(string clausula, List<(string Nombre, object Valor)> parametros)
            {
                Clausula = clausula;
                _parametros = parametros;
            }

            public void AplicarParametros(MySqlCommand cmd)
            {
                foreach (var (nombre, valor) in _parametros)
                {
                    cmd.Parameters.AddWithValue(nombre, valor);
                }
            }
        }
    }
}
