import { Routes, Route, Navigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import ProtectedRoute from './ProtectedRoute';
import MainLayout from '../layouts/MainLayout';
import LoginPage from '../features/auth/LoginPage';
import ProfilePage from '../features/auth/ProfilePage';
import RegisterPage from '../features/auth/RegisterPage';
import ForbiddenPage from '../pages/ForbiddenPage';
import NotFoundPage from '../pages/NotFoundPage';
import RoleDashboard from '../features/dashboard/RoleDashboard';
import HorseListPage from '../features/horses/HorseListPage';
import HorseDetailPage from '../features/horses/HorseDetailPage';
import TrainingPlanPage from '../features/training/TrainingPlanPage';
import TrainingSessionPage from '../features/training/TrainingSessionPage';
import HealthBoardPage from '../features/health/HealthBoardPage';
import TreatmentPage from '../features/health/TreatmentPage';
import VeterinarianDashboard from '../pages/veterinarian/VeterinarianDashboard';
import HorseHealthList from '../pages/veterinarian/HorseHealthList';
import HorseHealthDetail from '../pages/veterinarian/HorseHealthDetail';
import MedicalExaminationForm from '../pages/veterinarian/MedicalExaminationForm';
import ExamRecordPage from '../pages/veterinarian/ExamRecordPage';
import InjuryManagement from '../pages/veterinarian/InjuryManagement';
import InjuryForm from '../pages/veterinarian/InjuryForm';
import TreatmentsPage from '../pages/veterinarian/TreatmentsPage';
import TreatmentForm from '../pages/veterinarian/TreatmentForm';
import MedicalSchedule from '../pages/veterinarian/MedicalSchedule';
import MedicalInventoryPage from '../pages/veterinarian/MedicalInventoryPage';
import StableAssignPage from '../features/stable/StableAssignPage';
import StableAssignmentPage from '../features/stable/StableAssignmentPage';
import UserManagementPage from '../features/admin/UserManagementPage';
import AuditLogPage from '../features/admin/AuditLogPage';
import ReportsOverviewPage from '../features/reports/ReportsOverviewPage';
import InventoryPage from '../features/inventory/InventoryPage';
import RacePage from '../features/race/RacePage';
import FinancePage from '../features/finance/FinancePage';
import OwnerHorses from '../features/owner/OwnerHorses';
import OwnerHorse from '../features/owner/OwnerHorse';
import OwnerHealth from '../features/owner/OwnerHealth';
import OwnerTraining from '../features/owner/OwnerTraining';
import OwnerRaces from '../features/owner/OwnerRaces';
import OwnerStable from '../features/owner/OwnerStable';
import OwnerFinance from '../features/owner/OwnerFinance';
import { ROLES } from '../constants/roles';

const ALL_ROLES = Object.values(ROLES);

/** A path every role shares, where the Horse Owner gets their own page. */
function OwnerOr({ owner, other }) {
  const role = useSelector((state) => state.auth.user?.role);
  return role === ROLES.OWNER ? owner : other;
}

export default function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/403" element={<ForbiddenPage />} />

      {/* Every authenticated role shares the shell; individual pages are further role-gated below. */}
      <Route element={<ProtectedRoute allowedRoles={ALL_ROLES} />}>
        <Route element={<MainLayout />}>
          <Route path="/" element={<RoleDashboard />} />
          <Route path="/profile" element={<ProfilePage />} />

          {/* Shared: horse roster/profile (Owner's core flow; visible to every role). */}
          <Route path="/horses" element={<OwnerOr owner={<OwnerHorses />} other={<HorseListPage />} />} />
          <Route path="/horses/:id" element={<OwnerOr owner={<OwnerHorse />} other={<HorseDetailPage />} />} />

          {/* Head Trainer core flow. */}
          <Route element={<ProtectedRoute allowedRoles={[ROLES.HEAD_TRAINER]} />}>
            <Route path="/training/plans" element={<TrainingPlanPage />} />
            <Route path="/training/sessions" element={<TrainingSessionPage />} />
            <Route path="/stable/tasks" element={<StableAssignPage />} />
          </Route>

          {/* Veterinarian core flow & full module. */}
          <Route element={<ProtectedRoute allowedRoles={[ROLES.VETERINARIAN]} />}>
            <Route path="/veterinarian" element={<VeterinarianDashboard />} />
            <Route path="/veterinarian/horses" element={<HorseHealthList />} />
            <Route path="/veterinarian/horses/:id" element={<HorseHealthDetail />} />
            <Route path="/veterinarian/examinations/new/:horseId" element={<MedicalExaminationForm />} />
            {/* A filed exam is not edited: the old edit link opens the exam. */}
            <Route path="/veterinarian/examinations/:id/edit" element={<MedicalExaminationForm />} />
            <Route path="/veterinarian/examinations/:id" element={<ExamRecordPage />} />
            <Route path="/veterinarian/injuries" element={<InjuryManagement />} />
            <Route path="/veterinarian/injuries/new" element={<InjuryForm />} />
            <Route path="/veterinarian/injuries/:id/edit" element={<InjuryForm />} />
            {/* One place for treatments and prescriptions: the list, and one form to write or edit one. */}
            <Route path="/veterinarian/treatments" element={<TreatmentsPage />} />
            <Route path="/veterinarian/treatments/new" element={<TreatmentForm />} />
            <Route path="/veterinarian/treatments/:id/edit" element={<TreatmentForm />} />
            <Route path="/veterinarian/prescriptions" element={<Navigate to="/veterinarian/treatments" replace />} />
            <Route path="/veterinarian/inventory" element={<MedicalInventoryPage />} />
            <Route path="/veterinarian/schedules" element={<MedicalSchedule />} />

            {/* Legacy alias paths */}
            <Route path="/health/records" element={<HorseHealthList />} />
            <Route path="/health/treatments" element={<TreatmentsPage />} />
          </Route>

          {/* Groom / Stable Hand has no web screens: that role runs in the Expo app under /mobile. */}

          {/* Club Manager core flow. */}
          <Route element={<ProtectedRoute allowedRoles={[ROLES.MANAGER]} />}>
            <Route path="/admin/users" element={<UserManagementPage />} />
            <Route path="/admin/reports" element={<ReportsOverviewPage />} />
            <Route path="/admin/audit-logs" element={<AuditLogPage />} />
            <Route path="/admin/stables" element={<StableAssignmentPage />} />
          </Route>

          {/* Horse Owner core flow. */}
          <Route element={<ProtectedRoute allowedRoles={[ROLES.OWNER]} />}>
            <Route path="/owner/health" element={<OwnerHealth />} />
            <Route path="/owner/training" element={<OwnerTraining />} />
            <Route path="/owner/races" element={<OwnerRaces />} />
            <Route path="/owner/stable" element={<OwnerStable />} />
            {/* The trainer's reviews are a tab of the training page now. */}
            <Route path="/owner/evaluations" element={<Navigate to="/owner/training?view=reviews" replace />} />
          </Route>

          {/* Scaffold modules, shared by whichever roles the menu exposes them to. */}
          {/* Manager-only: this page is the approval side of the restock flow (its actions are
              Manager-authorized on the server). Grooms request restocks from the mobile app. */}
          <Route element={<ProtectedRoute allowedRoles={[ROLES.MANAGER]} />}>
            <Route path="/inventory" element={<InventoryPage />} />
          </Route>
          <Route element={<ProtectedRoute allowedRoles={[ROLES.HEAD_TRAINER]} />}>
            <Route path="/races" element={<RacePage />} />
          </Route>
          <Route element={<ProtectedRoute allowedRoles={[ROLES.OWNER, ROLES.MANAGER]} />}>
            <Route path="/finance" element={<OwnerOr owner={<OwnerFinance />} other={<FinancePage />} />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

