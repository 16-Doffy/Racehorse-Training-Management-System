import axiosClient from '../../lib/axiosClient';
import { createCrudApi } from '../../lib/createCrudApi';

export const raceApi = {
  ...createCrudApi('/races'),
  /** After the race: { position, finishTime, prizeMoney, result } — prize goes to the owner's revenue. */
  results: (id, payload) => axiosClient.patch(`/races/${id}/results`, payload),
};
