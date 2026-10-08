import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Defaults to the team's shared backend; override with EXPO_PUBLIC_API_BASE_URL in mobile/.env
// (e.g. http://192.168.1.5:5000/api/v1 when running the server on your own machine — "localhost"
// on a phone means the phone itself, so a LAN IP is required there).
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL || 'https://racehorse-tms-server.onrender.com/api/v1';

/** Origin of the API host, used to turn "/uploads/x.jpg" into a full image URL. */
export const API_ORIGIN = API_BASE_URL.replace(/\/api\/v\d+\/?$/, '').replace(/\/$/, '');

export const TOKEN_KEY = 'rtms.token';
export const USER_KEY = 'rtms.user';

const api = axios.create({ baseURL: API_BASE_URL, timeout: 60000 });

let onUnauthorized = null;
/** Lets the auth provider react to an expired token without importing React state here. */
export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Unwrap the { success, data, message } envelope the API always returns.
api.interceptors.response.use(
  (response) => response.data,
  async (error) => {
    if (error.response?.status === 401) {
      await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
      onUnauthorized?.();
    }
    // `isNetworkError`: the request got no answer (no signal, dropped link, timeout) as opposed to
    // an answer saying no. The outbox keeps a write for the first and tells the groom about the second.
    const answered = !!error.response;
    const body = answered && error.response.data && typeof error.response.data === 'object' ? error.response.data : null;
    return Promise.reject({
      ...(body || {
        success: false,
        message: answered
          ? error.message
          : 'Không kết nối được máy chủ. Kiểm tra mạng.',
      }),
      status: error.response?.status,
      isNetworkError: !answered,
    });
  }
);

export default api;
