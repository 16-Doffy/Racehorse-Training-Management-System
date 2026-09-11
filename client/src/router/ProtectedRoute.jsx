import { useSelector } from 'react-redux';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

/**
 * Guards a route subtree: requires a valid session, and optionally restricts to a set of roles.
 * Unauthenticated users are sent to /login (remembering where they wanted to go); authenticated
 * users hitting a route outside their role are sent to /403.
 */
export default function ProtectedRoute({ allowedRoles }) {
  const { user, token } = useSelector((state) => state.auth);
  const location = useLocation();

  if (!token || !user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/403" replace />;
  }

  return <Outlet />;
}
