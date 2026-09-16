import { Routes, Route } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute';
import MainLayout from '../layouts/MainLayout';
import LoginPage from '../features/auth/LoginPage';
import ForbiddenPage from '../pages/ForbiddenPage';
import NotFoundPage from '../pages/NotFoundPage';
import DashboardPage from '../features/dashboard/DashboardPage';
import HorseListPage from '../features/horses/HorseListPage';
import HorseDetailPage from '../features/horses/HorseDetailPage';
import TrainingPlanPage from '../features/training/TrainingPlanPage';
import TrainingSessionPage from '../features/training/TrainingSessionPage';
import HealthBoardPage from '../features/health/HealthBoardPage';
import TreatmentPage from '../features/health/TreatmentPage';
import DailyTaskPage from '../features/stable/DailyTaskPage';
import StableAssignPage from '../features/stable/StableAssignPage';
import UserManagementPage from '../features/admin/UserManagementPage';
import AuditLogPage from '../features/admin/AuditLogPage';
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
      <Route path="/403" element={<ForbiddenPage />} />

      {/* Every authenticated role shares the shell; individual pages are further role-gated below. */}
      <Route element={<ProtectedRoute allowedRoles={ALL_ROLES} />}>
        <Route element={<MainLayout />}>
          <Route path="/" element={<DashboardPage />} />

          {/* Shared: horse roster/profile (Owner's core flow; visible to every role). */}
          <Route path="/horses" element={<HorseListPage />} />
          <Route path="/horses/:id" element={<HorseDetailPage />} />

          {/* Head Trainer core flow. */}
          <Route element={<ProtectedRoute allowedRoles={[ROLES.HEAD_TRAINER]} />}>
            <Route path="/training/plans" element={<TrainingPlanPage />} />
            <Route path="/training/sessions" element={<TrainingSessionPage />} />
            <Route path="/stable/tasks" element={<StableAssignPage />} />
          </Route>

          {/* Veterinarian core flow. */}
          <Route element={<ProtectedRoute allowedRoles={[ROLES.VETERINARIAN]} />}>
            <Route path="/health/records" element={<HealthBoardPage />} />
            <Route path="/health/treatments" element={<TreatmentPage />} />
          </Route>

          {/* Groom core flow. */}
          <Route element={<ProtectedRoute allowedRoles={[ROLES.GROOM]} />}>
            <Route path="/stable/my-tasks" element={<DailyTaskPage />} />
          </Route>

          {/* Club Manager core flow. */}
          <Route element={<ProtectedRoute allowedRoles={[ROLES.MANAGER]} />}>
            <Route path="/admin/users" element={<UserManagementPage />} />
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
          <Route element={<ProtectedRoute allowedRoles={[ROLES.GROOM, ROLES.MANAGER]} />}>
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

