import axiosClient from '../../lib/axiosClient';
import { createCrudApi } from '../../lib/createCrudApi';

export const raceApi = {
  ...createCrudApi('/races'),
  /** After the race: { position, finishTime, prizeMoney, result } — prize goes to the owner's revenue. */
  results: (id, payload) => axiosClient.patch(`/races/${id}/results`, payload),
  /** The trainer's decision: { decision: 'confirmed'|'withdrawn', trialSession?, reason? }. */
  decision: (id, payload) => axiosClient.post(`/races/${id}/decision`, payload),
  /** The trial runs linked to this entry (the decision's evidence). */
  trials: (id) => axiosClient.get(`/races/${id}/trials`),
};
