import { createCrudApi } from '../../lib/createCrudApi';
import axiosClient from '../../lib/axiosClient';

export const feedingApi = {
  ...createCrudApi('/feeding'),
  // Without a slot: the three meals the rules suggest today (`meals`).
  suggest: (horse, slot) => axiosClient.get('/feeding/suggest', { params: { horse, slot } }),
  timetable: (horse, week) => axiosClient.get('/feeding/timetable', { params: { horse, week } }),
  calendar: (planId) => axiosClient.get(`/feeding/calendar/${planId}`),
  // The horses whose meals follow a confirmed calendar of a plan in use (they have their rations).
  calendarHorses: () => axiosClient.get('/feeding/calendar-horses'),
  // { expectedUpdatedAt, times?, days?: [{ date, meals }], fresh? }: the planner's days, confirmed at once.
  confirmCalendar: (planId, payload) => axiosClient.post(`/feeding/calendar/${planId}/confirm`, payload),
  updateCalendarMeal: (planId, date, slot, payload) => axiosClient.patch(`/feeding/calendar/${planId}/day/${date}/${slot}`, payload),
  // The daily rations of a horse without a plan calendar, all meals at once: { horse, meals: [{ mealTime, timeOfDay, items }] }.
  confirmRations: (payload) => axiosClient.post('/feeding/plan', payload),
};
