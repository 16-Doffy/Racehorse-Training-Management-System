import api from './client';

export const authApi = {
  login: (payload) => api.post('/auth/login', payload),
  me: () => api.get('/auth/me'),
};

export const taskApi = {
  list: (params) => api.get('/stable/tasks', { params }),
  getOne: (id) => api.get(`/stable/tasks/${id}`),
  /** payload: { observation: { appetite, manure, waterIntake }, notes } — all optional. */
  complete: (id, payload, config) => api.patch(`/stable/tasks/${id}/complete`, payload, config),
  /** "I've seen this and taken it on" — lets the trainer/vet tell picked-up from untouched. */
  acknowledge: (id, config) => api.patch(`/stable/tasks/${id}/acknowledge`, undefined, config),
  /** Could not do it (horse spat the medicine out, ...); the reason goes to the trainer/vet. */
  reportNotDone: (id, reason, config) => api.patch(`/stable/tasks/${id}/not-done`, { reason }, config),
  reportIncident: (id, formData, config) =>
    api.post(`/stable/tasks/${id}/incident`, formData, { ...config, headers: { 'Content-Type': 'multipart/form-data' } }),
};

export const stableApi = {
  assignments: () => api.get('/stable/assignments'),
  /** status: 'open' | 'unresolved' | 'acknowledged' | 'resolved' */
  incidents: (params) => api.get('/stable/incidents', { params }),
};

export const horseApi = {
  list: () => api.get('/horses'),
  getOne: (id) => api.get(`/horses/${id}`),
  /** Everything every role did to this horse, in order. */
  timeline: (id, params) => api.get(`/horses/${id}/timeline`, { params }),
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
  requestRestock: (id, quantity, note) => api.post(`/inventory/${id}/restock-request`, { quantity, note }),
  /** Ask for something that isn't in the catalogue yet; the Manager approves it into stock. */
  proposeItem: (payload) => api.post('/inventory/proposals', payload),
};

export const notificationApi = {
  list: () => api.get('/notifications'),
  markRead: (id) => api.patch(`/notifications/${id}/read`),
};

export const trainingApi = {
  sessions: () => api.get('/training/sessions'),
};
