import axiosClient from '../../lib/axiosClient';
import { createCrudApi } from '../../lib/createCrudApi';

export const inventoryApi = {
  ...createCrudApi('/inventory'),
  requestRestock: (id, payload) => axiosClient.post(`/inventory/${id}/restock-request`, payload),
  /** Manager's decision on one restock request: { status: 'approved' | 'rejected' }. */
  decideRestock: (itemId, requestId, payload) =>
    axiosClient.patch(`/inventory/${itemId}/restock-requests/${requestId}`, payload),
};
