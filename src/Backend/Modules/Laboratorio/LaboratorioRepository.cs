using System;
using System.Threading.Tasks;
using MySqlConnector;
using QualityControlCenter.Services;

namespace QualityControlCenter.Modules.Laboratorio
{
    public class LaboratorioRepository
    {
        private readonly DbService _db;

        public LaboratorioRepository(DbService db)
        {
            _db = db;
        }

        public async Task<LaboratorioResumenDto> ObtenerResumen(
            string fechaDesde = "",
            string fechaHasta = "",
            string ensayo = "",
            string material = ""
        )
        {
            var result = new LaboratorioResumenDto();

            using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            var filtros = BuildFiltros(fechaDesde, fechaHasta, ensayo, material);

            result.EnsayosHoy = await Count(
                conn,
                @"
                SELECT COUNT(*)
                FROM registro_ensayos re
                INNER JOIN registros_control rc ON rc.id = re.registro_id
                WHERE rc.fecha_registro = CURDATE();
                "
            );

            result.EnsayosPeriodo = await Count(
                conn,
                $@"
                SELECT COUNT(*)
                FROM registro_ensayos re
                INNER JOIN registros_control rc ON rc.id = re.registro_id
                WHERE 1 = 1
                {filtros};
                "
            );

            result.TiposEnsayo = await Count(
                conn,
                $@"
                SELECT COUNT(DISTINCT re.ensayo_id)
                FROM registro_ensayos re
                INNER JOIN registros_control rc ON rc.id = re.registro_id
                WHERE 1 = 1
                {filtros};
                "
            );

            result.MaterialesAnalizados = await Count(
                conn,
                $@"
                SELECT COUNT(DISTINCT re.material_id)
                FROM registro_ensayos re
                INNER JOIN registros_control rc ON rc.id = re.registro_id
                WHERE re.material_id IS NOT NULL
                {filtros};
                "
            );

            await CargarEnsayos(conn, result);
            await CargarMateriales(conn, result);
            await CargarRegistros(conn, result, filtros);

            return result;
        }

        private async Task CargarEnsayos(MySqlConnection conn, LaboratorioResumenDto result)
        {
            using var cmd = new MySqlCommand(
                @"
                SELECT id, nombre
                FROM ensayos_laboratorio
                WHERE activo = 1
                ORDER BY nombre;
                ",
                conn
            );

            using var reader = await cmd.ExecuteReaderAsync();

            while (await reader.ReadAsync())
            {
                result.Ensayos.Add(
                    new LaboratorioCatalogoDto
                    {
                        Id = Int(reader, "id"),
                        Nombre = Text(reader, "nombre"),
                    }
                );
            }
        }

        private async Task CargarMateriales(MySqlConnection conn, LaboratorioResumenDto result)
        {
            using var cmd = new MySqlCommand(
                @"
                SELECT id, nombre
                FROM materiales
                WHERE activo = 1
                ORDER BY nombre;
                ",
                conn
            );

            using var reader = await cmd.ExecuteReaderAsync();

            while (await reader.ReadAsync())
            {
                result.Materiales.Add(
                    new LaboratorioCatalogoDto
                    {
                        Id = Int(reader, "id"),
                        Nombre = Text(reader, "nombre"),
                    }
                );
            }
        }

        private async Task CargarRegistros(
            MySqlConnection conn,
            LaboratorioResumenDto result,
            string filtros
        )
        {
            using var cmd = new MySqlCommand(
                $@"
                SELECT
                    re.id,
                    re.registro_id,
                    DATE_FORMAT(rc.fecha_registro, '%d-%m-%Y') AS fecha,
                    TIME_FORMAT(rc.hora_registro, '%H:%i') AS hora,
                    IFNULL(u.nombre_completo, '-') AS usuario,
                    IFNULL(p.nombre, '-') AS proceso,
                    IFNULL(rc.np, '-') AS np,
                    IFNULL(rc.turno, '-') AS turno,
                    IFNULL(el.nombre, '-') AS ensayo,
                    IFNULL(m.nombre, '-') AS material,
                    IFNULL(re.valor, '') AS valor,
                    IFNULL(re.observacion, '') AS observacion,
                    IFNULL(ra.ruta_archivo, '') AS imagen_url
                FROM registro_ensayos re
                INNER JOIN registros_control rc ON rc.id = re.registro_id
                LEFT JOIN usuarios u ON u.id = rc.usuario_id
                LEFT JOIN procesos p ON p.id = rc.proceso_id
                LEFT JOIN ensayos_laboratorio el ON el.id = re.ensayo_id
                LEFT JOIN materiales m ON m.id = re.material_id
                LEFT JOIN registro_adjuntos ra ON ra.registro_id = rc.id
                WHERE 1 = 1
                {filtros}
                ORDER BY rc.fecha_registro DESC, rc.hora_registro DESC, re.id DESC
                LIMIT 300;
                ",
                conn
            );

            using var reader = await cmd.ExecuteReaderAsync();

            while (await reader.ReadAsync())
            {
                result.Registros.Add(
                    new LaboratorioRegistroDto
                    {
                        Id = Int(reader, "id"),
                        RegistroId = Int(reader, "registro_id"),
                        FechaRegistro = Text(reader, "fecha"),
                        HoraRegistro = Text(reader, "hora"),
                        Usuario = Text(reader, "usuario"),
                        Proceso = Text(reader, "proceso"),
                        Np = Text(reader, "np"),
                        Turno = Text(reader, "turno"),
                        Ensayo = Text(reader, "ensayo"),
                        Material = Text(reader, "material"),
                        Valor = Text(reader, "valor"),
                        Observacion = Text(reader, "observacion"),
                        ImagenUrl = Text(reader, "imagen_url"),
                    }
                );
            }
        }

        private static string BuildFiltros(
            string fechaDesde,
            string fechaHasta,
            string ensayo,
            string material
        )
        {
            var filtros = "";

            if (!string.IsNullOrWhiteSpace(fechaDesde))
                filtros += $" AND rc.fecha_registro >= '{fechaDesde}'";

            if (!string.IsNullOrWhiteSpace(fechaHasta))
                filtros += $" AND rc.fecha_registro <= '{fechaHasta}'";

            if (string.IsNullOrWhiteSpace(fechaDesde) && string.IsNullOrWhiteSpace(fechaHasta))
                filtros += " AND rc.fecha_registro >= CURDATE() - INTERVAL 30 DAY";

            if (!string.IsNullOrWhiteSpace(ensayo))
                filtros += $" AND re.ensayo_id = {ensayo}";

            if (!string.IsNullOrWhiteSpace(material))
                filtros += $" AND re.material_id = {material}";

            return filtros;
        }

        private async Task<int> Count(MySqlConnection conn, string sql)
        {
            using var cmd = new MySqlCommand(sql, conn);
            return Convert.ToInt32(await cmd.ExecuteScalarAsync() ?? 0);
        }

        private static int Int(MySqlDataReader reader, string column)
        {
            return reader[column] == DBNull.Value ? 0 : Convert.ToInt32(reader[column]);
        }

        private static string Text(MySqlDataReader reader, string column)
        {
            return reader[column] == DBNull.Value ? "" : reader[column]?.ToString() ?? "";
        }
    }
}
