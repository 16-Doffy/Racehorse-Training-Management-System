import axiosClient from '../../lib/axiosClient';
import { createCrudApi } from '../../lib/createCrudApi';

export const inventoryApi = {
  ...createCrudApi('/inventory'),
  requestRestock: (id, payload) => axiosClient.post(`/inventory/${id}/restock-request`, payload),
  /** Ask for an item not in the list yet: { name, category, unit, quantity, note, stableBlock }. */
  propose: (payload) => axiosClient.post('/inventory/proposals', payload),
  /** Daily use from rations and ongoing treatments, and the days of stock left per item. */
  forecast: () => axiosClient.get('/inventory/forecast'),
  /** The standard stock list and unit suggestions per category. */
  catalog: () => axiosClient.get('/inventory/catalog'),
  /** Adds the catalog items not already in stock (quantity 0): { categories? }. */
  importCatalog: (payload) => axiosClient.post('/inventory/catalog/import', payload || {}),
  /** Record a delivery: { quantity } in the item's unit, or { packs }. */
  receive: (id, payload) => axiosClient.post(`/inventory/${id}/receive`, payload),
  /** Manager's decision on one restock request: { status: 'approved' | 'rejected', note }. */
  decideRestock: (itemId, requestId, payload) =>
    axiosClient.patch(`/inventory/${itemId}/restock-requests/${requestId}`, payload),
};
