import axiosClient from '../../lib/axiosClient';

export const healthRecordApi = {
  list: (params) => axiosClient.get('/health/records', { params }),
  getOne: (id) => axiosClient.get(`/health/records/${id}`),
  create: (payload) => axiosClient.post('/health/records', payload),
  update: (id, payload) => axiosClient.put(`/health/records/${id}`, payload),
  requestExam: (payload) => axiosClient.post('/health/exam-requests', payload),
  // Vet: their queue. Head Trainer: the requests they sent, with status.
  listExamRequests: (params) => axiosClient.get('/health/exam-requests', { params }),
  updateExamRequest: (id, payload) => axiosClient.patch(`/health/exam-requests/${id}`, payload),
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

export const EXAM_PRIORITY_OPTIONS = [
  { value: 'normal', label: 'Bình thường' },
  { value: 'high', label: 'Ưu tiên cao' },
  { value: 'urgent', label: 'Khẩn cấp' },
];
