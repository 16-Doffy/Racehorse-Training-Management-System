import axiosClient from './axiosClient';
import { API_BASE_URL } from './serverWake';

/** Origin of the API host: stored file paths ("/api/v1/files/…", old "/uploads/…") hang off it. */
export const API_ORIGIN = API_BASE_URL.replace(/\/api\/v\d+\/?$/, '').replace(/\/$/, '');

/** A stored file path as a URL the browser can open (the path is signed, no token needed). */
export const fileHref = (url) => {
  if (!url) return undefined;
  return /^https?:\/\//.test(url) ? url : `${API_ORIGIN}${url}`;
};

/** Uploads files (images or PDF) and returns [{ id, url, name, contentType, size }]. */
export async function uploadFiles(files, purpose) {
  const form = new FormData();
  files.forEach((file) => form.append('files', file));
  if (purpose) form.append('purpose', purpose);
  const res = await axiosClient.post('/uploads', form, { headers: { 'Content-Type': 'multipart/form-data' } });
  return res.data;
}

/** Downloads an authenticated endpoint (e.g. a CSV export) as a file. */
export async function downloadFile(path, filename, params) {
  const blob = await axiosClient.get(path, { params, responseType: 'blob' });
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
