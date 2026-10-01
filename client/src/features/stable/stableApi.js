import axiosClient from '../../lib/axiosClient';

export const dailyTaskApi = {
  list: (params) => axiosClient.get('/stable/tasks', { params }),
  getOne: (id) => axiosClient.get(`/stable/tasks/${id}`),
  create: (payload) => axiosClient.post('/stable/tasks', payload),
  update: (id, payload) => axiosClient.put(`/stable/tasks/${id}`, payload),
  remove: (id) => axiosClient.delete(`/stable/tasks/${id}`),
  complete: (id, payload) => axiosClient.patch(`/stable/tasks/${id}/complete`, payload),
  reportIncident: (id, formData) =>
    axiosClient.post(`/stable/tasks/${id}/incident`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
};

// Incident reports as a list with a status. Handling one (PATCH) is the vet's action.
export const incidentApi = {
  list: (params) => axiosClient.get('/stable/incidents', { params }),
  handle: (taskId, payload) => axiosClient.patch(`/stable/incidents/${taskId}`, payload),
};

export const stableAssignmentApi = {
  list: () => axiosClient.get('/stable/assignments'),
  upsert: (payload) => axiosClient.post('/stable/assignments', payload),
  remove: (id) => axiosClient.delete(`/stable/assignments/${id}`),
};

export const incidentApi = {
  list: (params) => axiosClient.get('/stable/incidents', { params }),
  update: (id, payload) => axiosClient.patch(`/stable/incidents/${id}`, payload),
};
