import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
/* IBM Plex — OFL-1.1 via @fontsource (local, display:swap in CSS) */
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import { App } from './App';
import './styles/studio.css';
import './styles/console.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
