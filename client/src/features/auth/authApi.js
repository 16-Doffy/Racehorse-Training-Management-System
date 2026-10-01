import axiosClient from '../../lib/axiosClient';

export const authApi = {
  login: (payload) => axiosClient.post('/auth/login', payload),
  register: (payload) => axiosClient.post('/auth/register', payload),
  me: () => axiosClient.get('/auth/me'),
  changePassword: (payload) => axiosClient.put('/auth/change-password', payload),
  /** { name, phone, avatarUrl } — email and role are the Club Manager's. */
  updateProfile: (payload) => axiosClient.put('/auth/profile', payload),
};
