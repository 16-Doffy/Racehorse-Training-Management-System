import axiosClient from '../../lib/axiosClient';
import { createCrudApi } from '../../lib/createCrudApi';

export const financeApi = {
  ...createCrudApi('/finance'),
  listMine: () => axiosClient.get('/finance/mine'),
  getMineSummary: () => axiosClient.get('/finance/mine/summary'),
  // What the horses cost, worked out from rations, prescriptions and stalls (view only). params: { year, horse }
  costs: (params) => axiosClient.get('/finance/costs', { params }),
};
