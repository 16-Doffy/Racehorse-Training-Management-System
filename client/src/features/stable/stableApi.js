import axiosClient from '../../lib/axiosClient';

export const dailyTaskApi = {
  list: (params) => axiosClient.get('/stable/tasks', { params }),
  getOne: (id) => axiosClient.get(`/stable/tasks/${id}`),
  create: (payload) => axiosClient.post('/stable/tasks', payload),
  update: (id, payload) => axiosClient.put(`/stable/tasks/${id}`, payload),
  remove: (id) => axiosClient.delete(`/stable/tasks/${id}`),
  complete: (id, payload) => axiosClient.patch(`/stable/tasks/${id}/complete`, payload),
  /** Trainer/Manager: a missed meal of today is to be given now (a new feeding task for the groom). */
  makeUpMeal: (id) => axiosClient.post(`/stable/tasks/${id}/make-up`),
  reportIncident: (id, formData) =>
    axiosClient.post(`/stable/tasks/${id}/incident`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
};

// Care handed out for a stretch of days: times a day, minutes each, how. Each day it becomes tasks.
export const careRoutineApi = {
  list: (params) => axiosClient.get('/stable/routines', { params }),
  create: (payload) => axiosClient.post('/stable/routines', payload),
  update: (id, payload) => axiosClient.put(`/stable/routines/${id}`, payload),
  stop: (id) => axiosClient.post(`/stable/routines/${id}/stop`),
};

// Incident reports as a list with a status. Handling one (PATCH) is the vet's action.
export const incidentApi = {
  list: (params) => axiosClient.get('/stable/incidents', { params }),
  handle: (taskId, payload) => axiosClient.patch(`/stable/incidents/${taskId}`, payload),
};

// The stall catalogue and stable map (docs/STALL_API.md). Everyone reads; the Manager keeps the layout.
export const stallApi = {
  /** { stalls, unplaced }: every stall in zone order with who stands in it, plus horses on a free-text stall. */
  map: (params) => axiosClient.get('/stable/stalls', { params }),
  forHorse: (horseId) => axiosClient.get(`/stable/stalls/by-horse/${horseId}`),
  create: (payload) => axiosClient.post('/stable/stalls', payload),
  /** { zone, count, zoneName?, zonePurpose?, type? } → <zone>-01 … <zone>-<count>. */
  generateZone: (payload) => axiosClient.post('/stable/stalls/generate', payload),
  update: (id, payload) => axiosClient.patch(`/stable/stalls/${id}`, payload),
  retire: (id) => axiosClient.delete(`/stable/stalls/${id}`),
  /** The stall's groom (null: none); the horse in it and its open work go to them too. */
  setCaretaker: (id, caretaker) => axiosClient.put(`/stable/stalls/${id}/caretaker`, { caretaker: caretaker || null }),
  /** The zone dialog in one save: { zoneName?, zonePurpose?, remove?: [stall ids], add?: n, type? } → { removed, added, stalls }. */
  editZone: (zone, payload) => axiosClient.put(`/stable/zones/${encodeURIComponent(zone)}`, payload),
  /** Takes a whole zone out of use (409 while a horse is in it); laying it out again brings it back. */
  retireZone: (zone) => axiosClient.delete(`/stable/zones/${encodeURIComponent(zone)}`),
};

export const stableAssignmentApi = {
  list: () => axiosClient.get('/stable/assignments'),
  upsert: (payload) => axiosClient.post('/stable/assignments', payload),
  remove: (id) => axiosClient.delete(`/stable/assignments/${id}`),
};
