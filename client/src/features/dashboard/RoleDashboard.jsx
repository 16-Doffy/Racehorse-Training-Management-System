import { useSelector } from 'react-redux';
import { ROLES } from '../../constants/roles';
import GroomMobileNotice from './GroomMobileNotice';
import TrainerHome from './TrainerHome';
import ManagerHome from './ManagerHome';
import VeterinarianDashboard from '../../pages/veterinarian/VeterinarianDashboard';
import OwnerHome from '../owner/OwnerHome';

// "/" picks a home per role.
export default function RoleDashboard() {
  const role = useSelector((state) => state.auth.user?.role);
  // The Groom role lives in the Expo app under /mobile; the web client only explains where it went.
  if (role === ROLES.GROOM) return <GroomMobileNotice />;
  if (role === ROLES.VETERINARIAN) return <VeterinarianDashboard />;
  if (role === ROLES.OWNER) return <OwnerHome />;
  if (role === ROLES.MANAGER) return <ManagerHome />;
  return <TrainerHome />;
}
