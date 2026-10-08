import axiosClient from '../../lib/axiosClient';
import { createCrudApi } from '../../lib/createCrudApi';

const plansBase = createCrudApi('/training/plans');
const sessionsBase = createCrudApi('/training/sessions');

export const trainingPlanApi = {
  ...plansBase,
  /** Phases to propose for a new cycle: { horse, targetRace?, startDate? }. */
  suggest: (params) => axiosClient.get('/training/plans/suggest', { params }),
  /** Book a week of the plan as sessions: { weekStart? } (next week by default). */
  generateWeek: (id, payload) => axiosClient.post(`/training/plans/${id}/generate-week`, payload || {}),
};

export const trainingSessionApi = {
  ...sessionsBase,
  recordEvaluation: (id, payload) => axiosClient.patch(`/training/sessions/${id}/evaluation`, payload),
  // The four readiness gates for a proposed session (medical, vet clearance, nutrition, care
  // assignment). Open to every role, so other screens can show the same board.
  readiness: (params) => axiosClient.get('/training/sessions/readiness', { params }),
  // Start now; rechecks readiness for the current moment. Payload: { overrideReason? }.
  start: (id, payload) => axiosClient.post(`/training/sessions/${id}/start`, payload),
};
