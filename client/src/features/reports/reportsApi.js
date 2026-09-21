import axiosClient from '../../lib/axiosClient';

export const reportsApi = {
  /** Club-wide overview; optional { from, to } ISO dates scope it to a period. */
  overview: (params) => axiosClient.get('/reports/overview', { params }),
};
