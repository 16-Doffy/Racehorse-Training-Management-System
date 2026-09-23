import axios from 'axios';

const axiosClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api/v1',
});

// Attach the JWT (set by the auth slice on login) to every outgoing request.
axiosClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Unwrap { success, data, message } and redirect to /login on 401 (expired/invalid token).
axiosClient.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    // Callers get the server's { success, message } body plus the HTTP status, so a screen can
    // react to *which* failure it was (e.g. a 409 "already handled" is a stale list to refresh,
    // not an error to shout about) instead of only having a message string to pattern-match on.
    const status = error.response?.status;
    const body = error.response?.data || { success: false, message: error.message };
    return Promise.reject(Object.assign(body, { status }));
  }
);

export default axiosClient;
