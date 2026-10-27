import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { QueryClientProvider } from '@tanstack/react-query';
import App from './App.jsx';
import { store } from './store';
import { queryClient } from './lib/queryClient';
import { wakeServer } from './lib/serverWake';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';
import './index.css';

// Knock on the backend the moment the app loads: on the free host it may be asleep, and waking it
// now means it is usually ready by the time the user has typed their password.
wakeServer();

// After a deploy the files of the old build are gone, so a page opened before it cannot load a part
// it loads on demand (the 3D stage, a page): reload once to pick up the new build. Once per page per
// tab, so a part that is really missing shows its own message instead of reloading in a loop.
window.addEventListener('vite:preloadError', (event) => {
  const key = 'reloaded-for-new-build';
  try {
    if (sessionStorage.getItem(key) === window.location.pathname) return;
    sessionStorage.setItem(key, window.location.pathname);
  } catch {
    return;
  }
  event.preventDefault();
  window.location.reload();
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </Provider>
  </StrictMode>
);
