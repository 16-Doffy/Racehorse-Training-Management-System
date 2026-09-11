import axiosClient from '../../lib/axiosClient';

export const notificationsApi = {
  list: () => axiosClient.get('/notifications'),
  markRead: (id) => axiosClient.patch(`/notifications/${id}/read`),
};
