using QualityControlCenter.Models;

namespace QualityControlCenter.Services
{
    public class CurrentUserSessionService
    {
        private User? _currentUser;

        public bool IsAuthenticated => _currentUser != null;

        public User? GetCurrentUser()
        {
            return _currentUser;
        }

        public void SetCurrentUser(User user)
        {
            _currentUser = user;
        }

        public void Clear()
        {
            _currentUser = null;
        }

        public bool IsAdminTi()
        {
            return _currentUser != null && _currentUser.Rol == "admin_ti";
        }
    }
}
