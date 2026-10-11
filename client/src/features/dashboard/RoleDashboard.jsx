import { useSelector } from 'react-redux';
import { ROLES } from '../../constants/roles';
import DashboardPage from './DashboardPage';
import GroomMobileNotice from './GroomMobileNotice';
import VeterinarianDashboard from '../../pages/veterinarian/VeterinarianDashboard';
import OwnerDashboard from '../horses/OwnerDashboard';
import { GROOM_WEB_ENABLED } from '../groomWeb/config';
import GroomWebPage from '../groomWeb/GroomWebPage';

// "/" picks a dashboard per role; roles without a dedicated one keep the shared DashboardPage
// (currently Head Trainer and Club Manager).
export default function RoleDashboard() {
  const role = useSelector((state) => state.auth.user?.role);
  if (role === ROLES.GROOM) return GROOM_WEB_ENABLED ? <GroomWebPage /> : <GroomMobileNotice />;
  if (role === ROLES.VETERINARIAN) return <VeterinarianDashboard />;
  if (role === ROLES.OWNER) return <OwnerDashboard />;
  return <DashboardPage />;
}

