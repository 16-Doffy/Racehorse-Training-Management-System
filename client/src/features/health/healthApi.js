import axiosClient from '../../lib/axiosClient';
import { createCrudApi } from '../../lib/createCrudApi';

export const healthRecordApi = {
  list: (params) => axiosClient.get('/health/records', { params }),
  getOne: (id) => axiosClient.get(`/health/records/${id}`),
  create: (payload) => axiosClient.post('/health/records', payload),
  update: (id, payload) => axiosClient.put(`/health/records/${id}`, payload),
  requestExam: (payload) => axiosClient.post('/health/exam-requests', payload),
};

export const treatmentApi = {
  list: (params) => axiosClient.get('/health/treatments', { params }),
  getOne: (id) => axiosClient.get(`/health/treatments/${id}`),
  create: (payload) => axiosClient.post('/health/treatments', payload),
  update: (id, payload) => axiosClient.put(`/health/treatments/${id}`, payload),
  setTrainingLock: (id, payload) => axiosClient.post(`/health/treatments/${id}/lock-training`, payload),
};

export const injuryMarkerApi = {
  list: (params) => axiosClient.get('/health/injury-markers', { params }),
  create: (payload) => axiosClient.post('/health/injury-markers', payload),
  update: (id, payload) => axiosClient.put(`/health/injury-markers/${id}`, payload),
};
