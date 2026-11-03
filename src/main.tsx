import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { joinFromLink } from './game/firebase';
import { lsGet } from './lib/util';
import './styles.css';

const theme = lsGet<string | null>('pmd-theme', null);
if (theme) document.documentElement.dataset.theme = theme;
joinFromLink();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
