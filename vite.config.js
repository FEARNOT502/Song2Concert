import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Served from https://<user>.github.io/Song2Concert/ on GitHub Pages.
  base: '/Song2Concert/',
  plugins: [react()],
  server: { port: 5173, open: true },
});
