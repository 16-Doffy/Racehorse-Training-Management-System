import axiosClient from '../../lib/axiosClient';

export const reportsApi = {
  /** Club-wide overview; optional { from, to } ISO dates scope it to a period. */
  overview: (params) => axiosClient.get('/reports/overview', { params }),
  /** Club-wide cost / revenue per period: { period: 'month' | 'quarter', year }. */
  financeChart: (params) => axiosClient.get('/reports/finance-chart', { params }),
  /** Per-month training progress (scoped by role): { months, horse }. */
  trainingChart: (params) => axiosClient.get('/reports/training-chart', { params }),
};
