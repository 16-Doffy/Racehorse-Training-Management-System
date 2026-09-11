import axiosClient from '../../lib/axiosClient';

export const dailyTaskApi = {
  list: (params) => axiosClient.get('/stable/tasks', { params }),
  getOne: (id) => axiosClient.get(`/stable/tasks/${id}`),
  create: (payload) => axiosClient.post('/stable/tasks', payload),
  complete: (id) => axiosClient.patch(`/stable/tasks/${id}/complete`),
  reportIncident: (id, formData) =>
    axiosClient.post(`/stable/tasks/${id}/incident`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
};

export const stableAssignmentApi = {
  list: () => axiosClient.get('/stable/assignments'),
  upsert: (payload) => axiosClient.post('/stable/assignments', payload),
  remove: (id) => axiosClient.delete(`/stable/assignments/${id}`),
};
