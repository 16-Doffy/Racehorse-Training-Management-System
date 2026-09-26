import axiosClient from '../../lib/axiosClient';
import { createCrudApi } from '../../lib/createCrudApi';

const plansBase = createCrudApi('/training/plans');
const sessionsBase = createCrudApi('/training/sessions');

export const trainingPlanApi = plansBase;

export const trainingSessionApi = {
  ...sessionsBase,
  recordEvaluation: (id, payload) => axiosClient.patch(`/training/sessions/${id}/evaluation`, payload),
  // The four readiness gates for a proposed session (medical, vet clearance, nutrition, care
  // assignment). Open to every role, so other screens can show the same board.
  readiness: (params) => axiosClient.get('/training/sessions/readiness', { params }),
};
