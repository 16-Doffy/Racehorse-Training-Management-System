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
  // Pre-check: the trainer looks at the horse and the gates re-run for now; scheduled/blocked -> ready.
  // Payload: { confirmed: true, overrideReason?, bodyTempC?, trackCondition?, weather? }.
  preCheck: (id, payload) => axiosClient.post(`/training/sessions/${id}/pre-check`, payload),
  // Start: only from ready; the server stamps the start time. Payload: { overrideReason? }.
  start: (id, payload) => axiosClient.post(`/training/sessions/${id}/start`, payload),
  // Keeps the missed booking as history and creates a new scheduled session.
  reschedule: (id, payload) => axiosClient.post(`/training/sessions/${id}/reschedule`, payload),
};
