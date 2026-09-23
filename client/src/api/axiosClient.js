/**
 * Kept as a re-export so the Veterinarian modules that import from `api/axiosClient` keep working
 * unchanged. There used to be a second, independently-maintained axios instance here with its own
 * copy of the JWT/401/unwrap interceptors — two places to fix any auth bug, and the copies had
 * already drifted (only one of them attached the HTTP status to rejected errors). One instance now.
 */
export { default } from '../lib/axiosClient';
