import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { initRum } from './lib/telemetry/rum';

// Browser telemetry starts before React so document-load timings and any
// fetch issued during the first render are captured. It is a no-op when
// VITE_OTLP_ENDPOINT is unset.
initRum();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
