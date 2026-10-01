import axiosClient from '../../lib/axiosClient';
import { createCrudApi } from '../../lib/createCrudApi';

export const horsesApi = {
  ...createCrudApi('/horses'),
  // Every role's records for one horse, merged into one list (sessions, exams, care, incidents…).
  timeline: (id, params) => axiosClient.get(`/horses/${id}/timeline`, { params }),
  /** Stop managing a horse whose records must be kept: { reason }. Manager only. */
  archive: (id, payload) => axiosClient.patch(`/horses/${id}/archive`, payload),
  unarchive: (id) => axiosClient.patch(`/horses/${id}/unarchive`),
};
