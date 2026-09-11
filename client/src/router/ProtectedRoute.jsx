import { useSelector } from 'react-redux';
import { Navigate, Outlet } from 'react-router-dom';

/**
 * Guards a route subtree: requires a valid session, and optionally restricts to a set of roles.
 * Unauthenticated users are sent to /login; authenticated users hitting a route outside their
 * role are sent to /403.
 *
 * Deliberately does NOT remember the attempted path via `state.from` for a post-login redirect:
 * this component can re-render (with the auth state already cleared) for a route the user is
 * *leaving* — e.g. while logging out from a role-restricted page — racing with the logout
 * button's own navigate('/login'). If that race is lost, the remembered path points at a page
 * the *next* login (often a different demo role, in this app) has no access to, sending a
 * freshly-authenticated user straight to /403. LoginPage always redirects to "/" instead.
 */
export default function ProtectedRoute({ allowedRoles }) {
  const { user, token } = useSelector((state) => state.auth);

  if (!token || !user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/403" replace />;
  }

  return <Outlet />;
}
