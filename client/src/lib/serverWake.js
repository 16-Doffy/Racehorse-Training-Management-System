import { useSyncExternalStore } from 'react';
import axios from 'axios';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api/v1';

/**
 * The backend runs on a free host that puts it to sleep after ~15 idle minutes; the next request
 * takes half a minute or more to get an answer, and the browser reports the dropped first attempt
 * as a bare "Network Error". Nothing is actually broken — the server just needs a knock.
 *
 * This module does the knocking: it pings the health endpoint as soon as the app opens (so the
 * server is waking while the user is still typing their password), keeps trying until it answers,
 * and exposes where things stand so screens can say "starting up" instead of showing an error.
 *
 * status: 'unknown' → 'checking' → 'ready' | 'waking' → 'ready' | 'down'
 */
const PING_TIMEOUT_MS = 8000;
const RETRY_EVERY_MS = 3000;
const GIVE_UP_AFTER_MS = 120000;
// A server that was already awake answers well inside this; only past it do we tell the user.
const SHOW_WAKING_AFTER_MS = 2500;

let status = 'unknown';
let inFlight = null;
const listeners = new Set();

function setStatus(next) {
  if (next === status) return;
  status = next;
  listeners.forEach((l) => l());
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function ping() {
  await axios.get(`${API_BASE_URL}/health-check`, { timeout: PING_TIMEOUT_MS });
}

/**
 * Resolves true once the server answers, false if it never did. Concurrent callers share one
 * attempt, so ten failed requests at once don't start ten wake-up loops.
 */
export function wakeServer() {
  if (status === 'ready') return Promise.resolve(true);
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const startedAt = Date.now();
    if (status !== 'waking') setStatus('checking');
    const slowTimer = setTimeout(() => setStatus('waking'), SHOW_WAKING_AFTER_MS);

    try {
      while (Date.now() - startedAt < GIVE_UP_AFTER_MS) {
        try {
          // eslint-disable-next-line no-await-in-loop
          await ping();
          setStatus('ready');
          return true;
        } catch {
          setStatus('waking');
          // eslint-disable-next-line no-await-in-loop
          await sleep(RETRY_EVERY_MS);
        }
      }
      setStatus('down');
      return false;
    } finally {
      clearTimeout(slowTimer);
      inFlight = null;
    }
  })();

  return inFlight;
}

/** Called when a real request got no response at all: the server has gone back to sleep. */
export function markServerUnreachable() {
  if (status === 'ready' || status === 'unknown') setStatus('waking');
}

const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Current server status, re-rendering the caller when it changes. */
export function useServerStatus() {
  return useSyncExternalStore(subscribe, () => status);
}
