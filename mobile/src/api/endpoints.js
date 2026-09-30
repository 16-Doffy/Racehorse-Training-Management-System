import api from './client';

export const authApi = {
  login: (payload) => api.post('/auth/login', payload),
  me: () => api.get('/auth/me'),
};

export const taskApi = {
  list: (params) => api.get('/stable/tasks', { params }),
  getOne: (id) => api.get(`/stable/tasks/${id}`),
  /** payload: { observation: { appetite, manure, waterIntake }, notes } — all optional. */
  complete: (id, payload) => api.patch(`/stable/tasks/${id}/complete`, payload),
  reportIncident: (id, formData) =>
    api.post(`/stable/tasks/${id}/incident`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
};

export const stableApi = {
  assignments: () => api.get('/stable/assignments'),
};

export const horseApi = {
  list: () => api.get('/horses'),
  getOne: (id) => api.get(`/horses/${id}`),
};

export const healthApi = {
  records: (params) => api.get('/health/records', { params }),
  treatments: () => api.get('/health/treatments'),
};

export const feedingApi = {
  list: () => api.get('/feeding'),
};

export const inventoryApi = {
  list: () => api.get('/inventory'),
  requestRestock: (id, quantity) => api.post(`/inventory/${id}/restock-request`, { quantity }),
};

export const notificationApi = {
  list: () => api.get('/notifications'),
  markRead: (id) => api.patch(`/notifications/${id}/read`),
};

export const trainingApi = {
  sessions: () => api.get('/training/sessions'),
};
