import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const repo = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig({
  root,
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': `${repo}shared`,
      '@core': `${repo}core`,
      '@': `${root}src`,
    },
  },
  server: {
    port: 5173,
    host: true,
    proxy: { '/api': 'http://localhost:3000' },
  },
  build: {
    outDir: `${root}dist`,
    emptyOutDir: true,
  },
});
