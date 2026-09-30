import { useSelector } from 'react-redux';
import { ROLES } from '../../constants/roles';
import DashboardPage from './DashboardPage';
import GroomMobileNotice from './GroomMobileNotice';
import VeterinarianDashboard from '../../pages/veterinarian/VeterinarianDashboard';
import OwnerDashboard from '../horses/OwnerDashboard';

// "/" picks a dashboard per role; roles without a dedicated one keep the shared DashboardPage
// (currently Head Trainer and Club Manager).
export default function RoleDashboard() {
  const role = useSelector((state) => state.auth.user?.role);
  // The Groom role lives in the Expo app under /mobile; the web client only explains where it went.
  if (role === ROLES.GROOM) return <GroomMobileNotice />;
  if (role === ROLES.VETERINARIAN) return <VeterinarianDashboard />;
  if (role === ROLES.OWNER) return <OwnerDashboard />;
  return <DashboardPage />;
}

