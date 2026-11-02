import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { lsGet } from './lib/util';
import './styles.css';

const theme = lsGet<string | null>('pmd-theme', null);
if (theme) document.documentElement.dataset.theme = theme;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
