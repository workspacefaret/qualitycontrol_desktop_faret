using System;
using System.Threading.Tasks;
using MySqlConnector;
using QualityControlCenter.Services;

namespace QualityControlCenter.Modules.MaquinasSeguimiento
{
    public class MaquinasSeguimientoRepository
    {
        private readonly DbService _db;

        public MaquinasSeguimientoRepository(DbService db)
        {
            _db = db;
        }

        public async Task<MaquinasSeguimientoResumenDto> ObtenerResumen(int? maquinaId)
        {
            var result = new MaquinasSeguimientoResumenDto();

            using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            using (
                var cmd = new MySqlCommand(
                    @"
                SELECT COUNT(*)
                FROM maquinas
                WHERE activo = 1;
            ",
                    conn
                )
            )
            {
                result.TotalMaquinas = Convert.ToInt32(await cmd.ExecuteScalarAsync());
            }

            using (
                var cmd = new MySqlCommand(
                    @"
                SELECT COUNT(DISTINCT maquina_id)
                FROM registros_control
                WHERE maquina_id IS NOT NULL;
            ",
                    conn
                )
            )
            {
                result.MaquinasConRegistros = Convert.ToInt32(await cmd.ExecuteScalarAsync());
            }

            using (
                var cmd = new MySqlCommand(
                    @"
                SELECT
                    m.id,
                    m.nombre,
                    IFNULL(p.nombre, '-') AS proceso
                FROM maquinas m
                LEFT JOIN procesos p ON m.proceso_id = p.id
                WHERE m.activo = 1
                ORDER BY p.nombre, m.nombre;
            ",
                    conn
                )
            )
            {
                using var reader = await cmd.ExecuteReaderAsync();

                while (await reader.ReadAsync())
                {
                    result.Maquinas.Add(
                        new MaquinaSelectorDto
                        {
                            Id = reader.GetInt32("id"),
                            Nombre = reader.GetString("nombre"),
                            Proceso = reader.GetString("proceso"),
                        }
                    );
                }
            }

            if (maquinaId == null || maquinaId <= 0)
            {
                return result;
            }

            using (
                var cmd = new MySqlCommand(
                    @"
                SELECT COUNT(*)
                FROM registros_control
                WHERE maquina_id = @maquinaId;
            ",
                    conn
                )
            )
            {
                cmd.Parameters.AddWithValue("@maquinaId", maquinaId.Value);
                result.RegistrosMaquinaSeleccionada = Convert.ToInt32(
                    await cmd.ExecuteScalarAsync()
                );
            }

            using (
                var cmd = new MySqlCommand(
                    @"
                SELECT COUNT(*)
                FROM registros_control rc
                LEFT JOIN estados_catalogo ec ON rc.estado_id = ec.id
                WHERE rc.maquina_id = @maquinaId
                  AND LOWER(ec.nombre) = 'rechazado';
            ",
                    conn
                )
            )
            {
                cmd.Parameters.AddWithValue("@maquinaId", maquinaId.Value);
                result.RechazosMaquinaSeleccionada = Convert.ToInt32(
                    await cmd.ExecuteScalarAsync()
                );
            }

            using (
                var cmd = new MySqlCommand(
                    @"
                SELECT
                    rc.id,
                    DATE_FORMAT(rc.fecha_registro, '%d-%m-%Y') AS fecha,
                    TIME_FORMAT(rc.hora_registro, '%H:%i') AS hora,

                    IFNULL(u.nombre_completo, '-') AS usuario,
                    IFNULL(p.nombre, '-') AS proceso,
                    IFNULL(m.nombre, '-') AS maquina,
                    IFNULL(f.nombre, '-') AS formulario,

                    IFNULL(rc.codigo_producto, '-') AS np,
                    IFNULL(rc.descripcion_producto, '-') AS producto,

                    IFNULL(rc.turno, '-') AS turno,
                    IFNULL(ec.nombre, '-') AS estado,
                    IFNULL(rc.observacion, '-') AS observacion

                FROM registros_control rc
                LEFT JOIN usuarios u ON rc.usuario_id = u.id
                LEFT JOIN procesos p ON rc.proceso_id = p.id
                LEFT JOIN maquinas m ON rc.maquina_id = m.id
                LEFT JOIN formularios_control f ON rc.formulario_id = f.id
                LEFT JOIN estados_catalogo ec ON rc.estado_id = ec.id

                WHERE rc.maquina_id = @maquinaId
                ORDER BY rc.id DESC
                LIMIT 100;
            ",
                    conn
                )
            )
            {
                cmd.Parameters.AddWithValue("@maquinaId", maquinaId.Value);

                using var reader = await cmd.ExecuteReaderAsync();

                while (await reader.ReadAsync())
                {
                    result.Registros.Add(
                        new MaquinaRegistroDto
                        {
                            Id = reader.GetInt32("id"),
                            FechaRegistro = reader.GetString("fecha"),
                            HoraRegistro = reader.GetString("hora"),
                            Usuario = reader.GetString("usuario"),
                            Proceso = reader.GetString("proceso"),
                            Maquina = reader.GetString("maquina"),
                            Formulario = reader.GetString("formulario"),
                            Np = reader.GetString("np"),
                            Producto = reader.GetString("producto"),
                            Turno = reader.GetString("turno"),
                            Estado = reader.GetString("estado"),
                            Observacion = reader.GetString("observacion"),
                        }
                    );
                }
            }

            return result;
        }
    }
}
