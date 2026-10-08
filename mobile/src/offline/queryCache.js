import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { QueryClient, onlineManager } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';

// Read offline: the last data the server sent is kept on the phone for a day, so opening the app in
// a dead spot of the yard shows today's work instead of an empty screen.
export const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      // Must outlive the persisted copy, or the cache is thrown away before it can be restored.
      gcTime: CACHE_MAX_AGE_MS,
      refetchOnWindowFocus: false,
    },
  },
});

export const persister = createAsyncStoragePersister({ storage: AsyncStorage, key: 'rtms.query-cache', throttleTime: 1000 });

// React Native has no browser online/offline events; tell React Query about the connection so it
// pauses requests while offline and refreshes everything the moment the signal is back.
onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => setOnline(!!state.isConnected && state.isInternetReachable !== false))
);
