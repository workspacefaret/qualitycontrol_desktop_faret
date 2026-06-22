using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using MySqlConnector;
using QualityControlCenter.Models;
using QualityControlCenter.Services;

namespace QualityControlCenter.Repositories.Usuarios
{
    public class UsuariosRepository
    {
        private readonly DbService _db;

        public UsuariosRepository(DbService db)
        {
            _db = db;
        }

        public async Task<List<User>> GetAllAsync()
        {
            var result = new List<User>();

            using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            using var cmd = new MySqlCommand(
                @"
                SELECT
                    id,
                    codigo_usuario,
                    nombre_completo,
                    password_hash,
                    rol,
                    activo,
                    creado_en
                FROM usuarios
                ORDER BY nombre_completo ASC;
                ",
                conn
            );

            using var reader = await cmd.ExecuteReaderAsync();

            while (await reader.ReadAsync())
            {
                result.Add(
                    new User
                    {
                        Id = reader.GetInt32("id"),
                        CodigoUsuario = reader.GetString("codigo_usuario"),
                        NombreCompleto = reader.GetString("nombre_completo"),
                        PasswordHash = reader["password_hash"]?.ToString() ?? "",
                        Rol = reader.GetString("rol"),
                        Activo = Convert.ToBoolean(reader["activo"]),
                        CreadoEn = reader["creado_en"] == DBNull.Value
                            ? null
                            : Convert.ToDateTime(reader["creado_en"]),
                    }
                );
            }

            return result;
        }

        public async Task<User?> GetByIdAsync(int id)
        {
            using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            using var cmd = new MySqlCommand(
                @"
                SELECT
                    id,
                    codigo_usuario,
                    nombre_completo,
                    password_hash,
                    rol,
                    activo,
                    creado_en
                FROM usuarios
                WHERE id = @id
                LIMIT 1;
                ",
                conn
            );

            cmd.Parameters.AddWithValue("@id", id);

            using var reader = await cmd.ExecuteReaderAsync();

            if (!await reader.ReadAsync())
                return null;

            return new User
            {
                Id = reader.GetInt32("id"),
                CodigoUsuario = reader.GetString("codigo_usuario"),
                NombreCompleto = reader.GetString("nombre_completo"),
                PasswordHash = reader["password_hash"]?.ToString() ?? "",
                Rol = reader.GetString("rol"),
                Activo = Convert.ToBoolean(reader["activo"]),
                CreadoEn = reader["creado_en"] == DBNull.Value
                    ? null
                    : Convert.ToDateTime(reader["creado_en"]),
            };
        }

        public async Task<bool> ExistsByCodigoUsuarioAsync(string codigoUsuario)
        {
            using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            using var cmd = new MySqlCommand(
                @"
                SELECT COUNT(*)
                FROM usuarios
                WHERE codigo_usuario = @codigoUsuario;
                ",
                conn
            );

            cmd.Parameters.AddWithValue("@codigoUsuario", codigoUsuario.Trim());

            var count = Convert.ToInt32(await cmd.ExecuteScalarAsync());

            return count > 0;
        }

        public async Task<int> CreateAsync(User user)
        {
            using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            using var cmd = new MySqlCommand(
                @"
                INSERT INTO usuarios
                (
                    codigo_usuario,
                    nombre_completo,
                    password_hash,
                    rol,
                    activo
                )
                VALUES
                (
                    @codigoUsuario,
                    @nombreCompleto,
                    @passwordHash,
                    @rol,
                    @activo
                );

                SELECT LAST_INSERT_ID();
                ",
                conn
            );

            cmd.Parameters.AddWithValue("@codigoUsuario", user.CodigoUsuario);
            cmd.Parameters.AddWithValue("@nombreCompleto", user.NombreCompleto);
            cmd.Parameters.AddWithValue("@passwordHash", user.PasswordHash);
            cmd.Parameters.AddWithValue("@rol", user.Rol);
            cmd.Parameters.AddWithValue("@activo", user.Activo ? 1 : 0);

            return Convert.ToInt32(await cmd.ExecuteScalarAsync());
        }

        public async Task<bool> DeleteAsync(int id)
        {
            using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            using var cmd = new MySqlCommand(
                @"
                DELETE FROM usuarios
                WHERE id = @id;
                ",
                conn
            );

            cmd.Parameters.AddWithValue("@id", id);

            return await cmd.ExecuteNonQueryAsync() > 0;
        }

        public async Task<bool> UpdatePasswordAsync(int id, string passwordHash)
        {
            using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            using var cmd = new MySqlCommand(
                @"
                UPDATE usuarios
                SET password_hash = @passwordHash
                WHERE id = @id;
                ",
                conn
            );

            cmd.Parameters.AddWithValue("@id", id);
            cmd.Parameters.AddWithValue("@passwordHash", passwordHash);

            return await cmd.ExecuteNonQueryAsync() > 0;
        }
    }
}
