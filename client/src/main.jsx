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

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </Provider>
  </StrictMode>
);
