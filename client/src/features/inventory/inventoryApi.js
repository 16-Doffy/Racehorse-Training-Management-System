import axiosClient from '../../lib/axiosClient';
import { createCrudApi } from '../../lib/createCrudApi';

export const inventoryApi = {
  ...createCrudApi('/inventory'),
  requestRestock: (id, payload) => axiosClient.post(`/inventory/${id}/restock-request`, payload),
};
