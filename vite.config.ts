import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The app is served under /landlordgame/ both in dev and in production.
const BASE = '/landlordgame/';
const SERVER = `http://localhost:${process.env.PORT ?? 3100}`;

export default defineConfig({
  base: BASE,
  plugins: [react()],
  build: { outDir: 'dist/client', emptyOutDir: true },
  server: {
    port: 5173,
    proxy: {
      [`${BASE}socket.io`]: { target: SERVER, ws: true },
    },
  },
});
