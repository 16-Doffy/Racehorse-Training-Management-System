import axiosClient from '../../lib/axiosClient';
import { createCrudApi } from '../../lib/createCrudApi';

export const usersApi = {
  ...createCrudApi('/users'),
  /** Club Manager's decision on a self-registered account: { approve, role? }. */
  decideRegistration: (id, payload) => axiosClient.patch(`/users/${id}/approval`, payload),
};
