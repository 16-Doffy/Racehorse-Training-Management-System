import axiosClient from '../../lib/axiosClient';
import { createCrudApi } from '../../lib/createCrudApi';

export const horsesApi = {
  ...createCrudApi('/horses'),
  // Every role's records for one horse, merged into one list (sessions, exams, care, incidents…).
  timeline: (id, params) => axiosClient.get(`/horses/${id}/timeline`, { params }),
  lineage: (id) => axiosClient.get(`/horses/${id}/lineage`),
  /** Stop managing a horse whose records must be kept: { reason }. Manager only. */
  archive: (id, payload) => axiosClient.patch(`/horses/${id}/archive`, payload),
  unarchive: (id) => axiosClient.patch(`/horses/${id}/unarchive`),
  /** Every horse in scope: where it stands from arrival to training and its next step. */
  checklists: () => axiosClient.get('/horses/checklist'),
  /** Owner: each of their horses at a glance — health, next session, last result, races, money. */
  ownerSummary: () => axiosClient.get('/horses/owner-summary'),
  /** Owner: the dashboard numbers — valuation, race record, this month and last month's money and training. */
  ownerOverview: () => axiosClient.get('/horses/owner-overview'),
  checklist: (id) => axiosClient.get(`/horses/${id}/checklist`),
  /** Routine care history (vaccination, deworming, farrier), newest first; `kind` narrows it. */
  careEvents: (id, params) => axiosClient.get(`/horses/${id}/care-events`, { params }),
  /** Veterinarian: { kind, date, product?, batchNumber?, dose?, note?, nextDue? }. */
  addCareEvent: (id, payload) => axiosClient.post(`/horses/${id}/care-events`, payload),
  /** Undo an entry made by mistake: its author only, within 24 h. */
  removeCareEvent: (id, eventId) => axiosClient.delete(`/horses/${id}/care-events/${eventId}`),
};
