import { createCrudApi } from '../../lib/createCrudApi';
import axiosClient from '../../lib/axiosClient';

export const horsesApi = {
  ...createCrudApi('/horses'),
  getTimeline: (id) => axiosClient.get(`/horses/${id}/timeline`),
};
