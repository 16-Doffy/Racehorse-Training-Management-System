import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      // Coming back to the tab (after recording a meal in the groom's app, say) shows what changed
      // meanwhile instead of waiting for a reload; data younger than 10 s is not fetched again.
      refetchOnWindowFocus: true,
      staleTime: 10_000,
    },
  },
});
