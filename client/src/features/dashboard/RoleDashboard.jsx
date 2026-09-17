import { useSelector } from 'react-redux';
import { ROLES } from '../../constants/roles';
import DashboardPage from './DashboardPage';
import GroomDashboard from '../stable/GroomDashboard';

// "/" picks a dashboard per role; roles without a dedicated one keep the shared DashboardPage.
export default function RoleDashboard() {
  const role = useSelector((state) => state.auth.user?.role);
  if (role === ROLES.GROOM) return <GroomDashboard />;
  return <DashboardPage />;
}
