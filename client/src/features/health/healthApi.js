import axiosClient from '../../lib/axiosClient';
import { createCrudApi } from '../../lib/createCrudApi';

export const healthRecordApi = {
  ...createCrudApi('/health/records'),
  requestExam: (payload) => axiosClient.post('/health/exam-requests', payload),
};

export const treatmentApi = {
  ...createCrudApi('/health/treatments'),
  setTrainingLock: (id, payload) => axiosClient.post(`/health/treatments/${id}/lock-training`, payload),
};

export const injuryMarkerApi = {
  list: (params) => axiosClient.get('/health/injury-markers', { params }),
  create: (payload) => axiosClient.post('/health/injury-markers', payload),
  update: (id, payload) => axiosClient.put(`/health/injury-markers/${id}`, payload),
};
