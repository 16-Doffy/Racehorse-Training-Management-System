import axiosClient from '../../lib/axiosClient';

export const authApi = {
  login: (payload) => axiosClient.post('/auth/login', payload),
  registerOwner: (payload) => axiosClient.post('/auth/register', payload),
  me: () => axiosClient.get('/auth/me'),
};
