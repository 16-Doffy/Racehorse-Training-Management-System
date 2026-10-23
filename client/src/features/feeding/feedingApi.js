import { createCrudApi } from '../../lib/createCrudApi';
import axiosClient from '../../lib/axiosClient';

export const feedingApi = {
  ...createCrudApi('/feeding'),
  suggest: (horse, slot) => axiosClient.get('/feeding/suggest', { params: { horse, slot } }),
  timetable: (horse, week) => axiosClient.get('/feeding/timetable', { params: { horse, week } }),
  calendar: (planId) => axiosClient.get(`/feeding/calendar/${planId}`),
  confirmCalendar: (planId, expectedUpdatedAt, times) => axiosClient.post(`/feeding/calendar/${planId}/confirm`, { expectedUpdatedAt, times }),
  updateCalendarMeal: (planId, date, slot, payload) => axiosClient.patch(`/feeding/calendar/${planId}/day/${date}/${slot}`, payload),
};
