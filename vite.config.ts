import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the same build works on GitHub Pages (/repo-name/) and as a Claude artifact.
export default defineConfig({
  base: './',
  plugins: [react()],
});
