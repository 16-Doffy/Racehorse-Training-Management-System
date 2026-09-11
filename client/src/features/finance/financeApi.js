import axiosClient from '../../lib/axiosClient';
import { createCrudApi } from '../../lib/createCrudApi';

export const financeApi = {
  ...createCrudApi('/finance'),
  listMine: () => axiosClient.get('/finance/mine'),
};
