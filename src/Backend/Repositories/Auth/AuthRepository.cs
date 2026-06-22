using System.Threading.Tasks;
using MySqlConnector;
using QualityControlCenter.Models;
using QualityControlCenter.Services;

namespace QualityControlCenter.Repositories.Auth
{
    public class AuthRepository
    {
        private readonly DbService _db;

        public AuthRepository(DbService db)
        {
            _db = db;
        }

        public async Task<User?> GetByCodigoUsuarioAsync(string codigoUsuario)
        {
            using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            const string sql =
    @"
    SELECT
        id,
        codigo_usuario,
        nombre_completo,
        password_hash,
        rol,
        activo,
        creado_en,
        creado_en AS actualizado_en
    FROM usuarios
    WHERE codigo_usuario = @codigoUsuario
      AND activo = 1
    LIMIT 1;
";

            using var cmd = new MySqlCommand(sql, conn);
            cmd.Parameters.AddWithValue("@codigoUsuario", codigoUsuario);

            using var reader = await cmd.ExecuteReaderAsync();

            if (!await reader.ReadAsync())
                return null;

            return new User
            {
                Id = reader.GetInt32("id"),
                CodigoUsuario = reader.GetString("codigo_usuario"),
                NombreCompleto = reader.GetString("nombre_completo"),
                PasswordHash = reader.GetString("password_hash"),
                Rol = reader.GetString("rol"),
                Activo = reader.GetBoolean("activo"),
                CreadoEn = reader.GetDateTime("creado_en"),
                ActualizadoEn = reader.GetDateTime("actualizado_en"),
            };
        }
    }
}
