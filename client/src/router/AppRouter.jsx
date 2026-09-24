import { Routes, Route } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute';
import MainLayout from '../layouts/MainLayout';
import LoginPage from '../features/auth/LoginPage';
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
import InjuryManagement from '../pages/veterinarian/InjuryManagement';
import InjuryForm from '../pages/veterinarian/InjuryForm';
import TreatmentPlanForm from '../pages/veterinarian/TreatmentPlanForm';
import PrescriptionForm from '../pages/veterinarian/PrescriptionForm';
import MedicalSchedule from '../pages/veterinarian/MedicalSchedule';
import MedicalInventoryPage from '../pages/veterinarian/MedicalInventoryPage';
import DailyTaskPage from '../features/stable/DailyTaskPage';
import StableAssignPage from '../features/stable/StableAssignPage';
import StableMapPage from '../features/stable/StableMapPage';
import IncidentReportsPage from '../features/stable/IncidentReportsPage';
import GroomSuppliesPage from '../features/inventory/GroomSuppliesPage';
import UserManagementPage from '../features/admin/UserManagementPage';
import AuditLogPage from '../features/admin/AuditLogPage';
import ReportsOverviewPage from '../features/reports/ReportsOverviewPage';
import FeedingPage from '../features/feeding/FeedingPage';
import InventoryPage from '../features/inventory/InventoryPage';
import RacePage from '../features/race/RacePage';
import FinancePage from '../features/finance/FinancePage';
import OwnerHealthPage from '../features/horses/OwnerHealthPage';
import OwnerTrainingPage from '../features/horses/OwnerTrainingPage';
import OwnerEvaluationsPage from '../features/horses/OwnerEvaluationsPage';
import { ROLES } from '../constants/roles';

const ALL_ROLES = Object.values(ROLES);

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

          {/* Shared: horse roster/profile (Owner's core flow; visible to every role). */}
          <Route path="/horses" element={<HorseListPage />} />
          <Route path="/horses/:id" element={<HorseDetailPage />} />

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
            <Route path="/veterinarian/examinations/:id/edit" element={<MedicalExaminationForm />} />
            <Route path="/veterinarian/injuries" element={<InjuryManagement />} />
            <Route path="/veterinarian/injuries/new" element={<InjuryForm />} />
            <Route path="/veterinarian/injuries/:id/edit" element={<InjuryForm />} />
            <Route path="/veterinarian/treatments" element={<TreatmentPlanForm />} />
            <Route path="/veterinarian/treatments/:id/edit" element={<TreatmentPlanForm />} />
            <Route path="/veterinarian/prescriptions" element={<PrescriptionForm />} />
            <Route path="/veterinarian/inventory" element={<MedicalInventoryPage />} />
            <Route path="/veterinarian/schedules" element={<MedicalSchedule />} />

            {/* Legacy alias paths */}
            <Route path="/health/records" element={<HorseHealthList />} />
            <Route path="/health/treatments" element={<TreatmentPlanForm />} />
          </Route>

          {/* Groom core flow. */}
          <Route element={<ProtectedRoute allowedRoles={[ROLES.GROOM]} />}>
            <Route path="/stable/my-tasks" element={<DailyTaskPage />} />
            <Route path="/stable/map" element={<StableMapPage />} />
            <Route path="/stable/incidents" element={<IncidentReportsPage />} />
            <Route path="/stable/supplies" element={<GroomSuppliesPage />} />
          </Route>

          {/* Club Manager core flow. */}
          <Route element={<ProtectedRoute allowedRoles={[ROLES.MANAGER]} />}>
            <Route path="/admin/users" element={<UserManagementPage />} />
            <Route path="/admin/reports" element={<ReportsOverviewPage />} />
            <Route path="/admin/audit-logs" element={<AuditLogPage />} />
          </Route>

          {/* Horse Owner core flow. */}
          <Route element={<ProtectedRoute allowedRoles={[ROLES.OWNER]} />}>
            <Route path="/owner/health" element={<OwnerHealthPage />} />
            <Route path="/owner/training" element={<OwnerTrainingPage />} />
            <Route path="/owner/evaluations" element={<OwnerEvaluationsPage />} />
          </Route>

          {/* Scaffold modules, shared by whichever roles the menu exposes them to. */}
          <Route element={<ProtectedRoute allowedRoles={[ROLES.GROOM]} />}>
            <Route path="/feeding" element={<FeedingPage />} />
          </Route>
          {/* Manager-only: this page is the approval side of the restock flow (its actions are
              Manager-authorized on the server). Groom has their own supplies screen at
              /stable/supplies for requesting, which is what their menu points to. */}
          <Route element={<ProtectedRoute allowedRoles={[ROLES.MANAGER]} />}>
            <Route path="/inventory" element={<InventoryPage />} />
          </Route>
          <Route element={<ProtectedRoute allowedRoles={[ROLES.HEAD_TRAINER]} />}>
            <Route path="/races" element={<RacePage />} />
          </Route>
          <Route element={<ProtectedRoute allowedRoles={[ROLES.OWNER, ROLES.MANAGER]} />}>
            <Route path="/finance" element={<FinancePage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

