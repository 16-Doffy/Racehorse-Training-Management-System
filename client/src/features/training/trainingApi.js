import axiosClient from '../../lib/axiosClient';
import { createCrudApi } from '../../lib/createCrudApi';

const plansBase = createCrudApi('/training/plans');
const sessionsBase = createCrudApi('/training/sessions');

export const trainingPlanApi = plansBase;

export const trainingSessionApi = {
  ...sessionsBase,
  recordEvaluation: (id, payload) => axiosClient.patch(`/training/sessions/${id}/evaluation`, payload),
};
