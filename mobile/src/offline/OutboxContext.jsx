import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthContext';
import { outbox } from './instance';

const RETRY_EVERY_MS = 30000;
const EMPTY = { items: [], failures: [], online: true, syncing: false, submit: async () => ({ queued: false }), flush: async () => {}, dismissFailure: () => {} };

const OutboxContext = createContext(EMPTY);

/**
 * Drives the outbox: loads what was saved, watches the connection, and sends the queue when it
 * comes back, when the app returns to the foreground, and every half minute while anything waits.
 */
export function OutboxProvider({ children }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [snapshot, setSnapshot] = useState(outbox.getState());
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const userId = user?._id;

  useEffect(() => {
    outbox.load();
    return outbox.subscribe(setSnapshot);
  }, []);

  const flush = useCallback(async () => {
    if (!userId) return;
    setSyncing(true);
    try {
      const outcome = await outbox.flush(userId);
      if (outcome.sent || outcome.failed) {
        // What the server now holds is the truth; the optimistic overlay goes away with the queue.
        queryClient.invalidateQueries({ queryKey: ['tasks'] });
        queryClient.invalidateQueries({ queryKey: ['incidents'] });
      }
    } finally {
      setSyncing(false);
    }
  }, [userId, queryClient]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const reachable = !!state.isConnected && state.isInternetReachable !== false;
      setOnline(reachable);
      if (reachable) flush();
    });
    return unsubscribe;
  }, [flush]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') flush();
    });
    return () => sub.remove();
  }, [flush]);

  const waiting = snapshot.items.some((i) => i.userId === userId);
  useEffect(() => {
    if (!waiting) return undefined;
    flush();
    const timer = setInterval(flush, RETRY_EVERY_MS);
    return () => clearInterval(timer);
  }, [waiting, flush]);

  const submit = useCallback((type, args, meta) => outbox.submit(type, args, { ...meta, userId }), [userId]);

  const value = useMemo(
    () => ({
      items: snapshot.items.filter((i) => i.userId === userId),
      failures: snapshot.failures,
      online,
      syncing,
      submit,
      flush,
      dismissFailure: outbox.dismissFailure,
    }),
    [snapshot, userId, online, syncing, submit, flush]
  );

  return <OutboxContext.Provider value={value}>{children}</OutboxContext.Provider>;
}

export const useOutbox = () => useContext(OutboxContext);
