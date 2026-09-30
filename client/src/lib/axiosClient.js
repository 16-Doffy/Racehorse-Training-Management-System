import axios from 'axios';
import { API_BASE_URL, wakeServer, markServerUnreachable } from './serverWake';

const axiosClient = axios.create({ baseURL: API_BASE_URL });

const UNREACHABLE_MESSAGE =
  'Không kết nối được máy chủ. Máy chủ có thể đang khởi động lại (mất khoảng 30 giây) — vui lòng thử lại.';

// Requests that are safe to send a second time after the server wakes. Reads never change
// anything, and a login that never reached the server did nothing. Other writes are left to the
// user to retry, so an action can't be applied twice behind their back.
const isRetryable = (config) =>
  config && !config.__retriedAfterWake && (config.method === 'get' || config.url === '/auth/login');

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
  async (error) => {
    // No response at all: the free-tier backend is asleep (or the network is down), not an
    // application error. Wake it, then quietly repeat the request instead of surfacing the
    // browser's bare "Network Error".
    // While it spins up, the host's proxy may also answer 502/503/504 with an HTML page.
    const gatewayError = [502, 503, 504].includes(error.response?.status);
    if (!error.response || gatewayError) {
      markServerUnreachable();
      if (isRetryable(error.config) && (await wakeServer())) {
        return axiosClient.request({ ...error.config, __retriedAfterWake: true });
      }
      wakeServer();
      return Promise.reject({ success: false, message: UNREACHABLE_MESSAGE, status: undefined, unreachable: true });
    }

    if (error.response.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    // Callers get the server's { success, message } body plus the HTTP status, so a screen can
    // react to *which* failure it was (e.g. a 409 "already handled" is a stale list to refresh,
    // not an error to shout about) instead of only having a message string to pattern-match on.
    const status = error.response.status;
    const data = error.response.data;
    const body = data && typeof data === 'object' ? data : { success: false, message: error.message };
    return Promise.reject(Object.assign(body, { status }));
  }
);

export default axiosClient;
