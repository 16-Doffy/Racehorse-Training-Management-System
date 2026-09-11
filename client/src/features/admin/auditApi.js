import axiosClient from '../../lib/axiosClient';

export const auditApi = {
  list: (params) => axiosClient.get('/audit-logs', { params }),
};
