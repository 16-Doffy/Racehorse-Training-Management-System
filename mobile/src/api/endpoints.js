import api from './client';

export const authApi = {
  login: (payload) => api.post('/auth/login', payload),
  me: () => api.get('/auth/me'),
  updateProfile: (payload) => api.put('/auth/profile', payload),
  changePassword: (payload) => api.put('/auth/change-password', payload),
};

export const filesApi = {
  /** Shared upload (field name `files`); returns [{ id, url, name }] for an avatar or a photo. */
  upload: (formData) => api.post('/uploads', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
};

export const taskApi = {
  list: (params) => api.get('/stable/tasks', { params }),
  getOne: (id) => api.get(`/stable/tasks/${id}`),
  /**
   * payload: { observation: { appetite, manure, waterIntake }, amountEatenPercent, notes } — all
   * optional — plus clientOpId, so a resend of the same tap is answered without being applied twice.
   */
  complete: (id, payload) => api.patch(`/stable/tasks/${id}/complete`, payload),
  /** "I've seen this and taken it on" — lets the trainer/vet tell picked-up from untouched. */
  acknowledge: (id, clientOpId) => api.patch(`/stable/tasks/${id}/acknowledge`, clientOpId ? { clientOpId } : undefined),
  /** Could not do it (horse spat the medicine out, ...); the reason goes to the trainer/vet. */
  reportNotDone: (id, reason, clientOpId) => api.patch(`/stable/tasks/${id}/not-done`, { reason, clientOpId }),
  reportIncident: (id, formData) =>
    api.post(`/stable/tasks/${id}/incident`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
};

export const stableApi = {
  assignments: () => api.get('/stable/assignments'),
  /**
   * The Manager's stable map: every stall in use, zone by zone, with the horse in it and its caretaker
   * ({ stalls, unplaced }). `unplaced` are horses still on a free-text stall from before the map.
   */
  stalls: () => api.get('/stable/stalls'),
  /** status: 'open' | 'unresolved' | 'acknowledged' | 'resolved' */
  incidents: (params) => api.get('/stable/incidents', { params }),
  /** Per horse: rations and prescriptions with the stock behind them, plus what is short. */
  carePlan: (params) => api.get('/stable/my-care-plan', { params }),
};

export const horseApi = {
  list: () => api.get('/horses'),
  getOne: (id) => api.get(`/horses/${id}`),
  /** Everything every role did to this horse, in order. */
  timeline: (id, params) => api.get(`/horses/${id}/timeline`, { params }),
  /** Vaccinations, deworming, farrier visits the vet recorded, newest first (read-only here). */
  careEvents: (id, params) => api.get(`/horses/${id}/care-events`, { params }),
};

export const healthApi = {
  records: (params) => api.get('/health/records', { params }),
  treatments: () => api.get('/health/treatments'),
  /** Where the vet marked an injury on the horse (side-view coordinates), with severity and recovery. */
  injuryMarkers: (params) => api.get('/health/injury-markers', { params }),
};

export const feedingApi = {
  list: () => api.get('/feeding'),
};

export const inventoryApi = {
  list: () => api.get('/inventory'),
  /** Per item: daily use from rations and ongoing prescriptions, and how many days the stock lasts. */
  forecast: () => api.get('/inventory/forecast'),
  /** payload: { quantity } or { packs }, plus an optional note and the task it is blocking. */
  requestRestock: (id, payload) => api.post(`/inventory/${id}/restock-request`, payload),
  /** Ask for something that isn't in the catalogue yet; the Manager approves it into stock. */
  proposeItem: (payload) => api.post('/inventory/proposals', payload),
};

export const notificationApi = {
  list: () => api.get('/notifications'),
  markRead: (id) => api.patch(`/notifications/${id}/read`),
  markAllRead: () => api.patch('/notifications/read-all'),
};

export const trainingApi = {
  sessions: () => api.get('/training/sessions'),
};
