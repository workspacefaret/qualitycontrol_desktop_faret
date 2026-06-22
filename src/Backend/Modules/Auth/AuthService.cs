using System.Threading.Tasks;
using BCrypt.Net;
using QualityControlCenter.Models;
using QualityControlCenter.Repositories.Auth;
using QualityControlCenter.Services;

namespace QualityControlCenter.Modules.Auth
{
    public class AuthService
    {
        private readonly AuthRepository _authRepository;
        private readonly CurrentUserSessionService _session;

        public AuthService(AuthRepository authRepository, CurrentUserSessionService session)
        {
            _authRepository = authRepository;
            _session = session;
        }

        public async Task<LoginResponse> LoginAsync(LoginRequest request)
        {
            var user = await _authRepository.GetByCodigoUsuarioAsync(request.CodigoUsuario);

            if (user == null)
            {
                return new LoginResponse { Success = false, Message = "Usuario no existe" };
            }

            if (!user.Activo)
            {
                return new LoginResponse { Success = false, Message = "Usuario desactivado" };
            }

            var passwordOk = BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash);

            if (!passwordOk)
            {
                return new LoginResponse { Success = false, Message = "Contraseña incorrecta" };
            }

            // Guardar sesión
            _session.SetCurrentUser(user);

            return new LoginResponse
            {
                Success = true,
                Message = "Login correcto",
                UserId = user.Id,
                CodigoUsuario = user.CodigoUsuario,
                NombreCompleto = user.NombreCompleto,
                Rol = user.Rol,
            };
        }

        public void Logout()
        {
            _session.Clear();
        }

        public User? GetCurrentUser()
        {
            return _session.GetCurrentUser();
        }

        public bool IsAuthenticated()
        {
            return _session.IsAuthenticated;
        }
    }
}
