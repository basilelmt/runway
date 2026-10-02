import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('.', import.meta.url));
const alias = {
  '@shared': `${repo}shared`,
  '@core': `${repo}core`,
  '@': `${repo}client/src`,
};

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'node',
          environment: 'node',
          include: ['shared/**/*.test.ts', 'core/**/*.test.ts', 'server/**/*.test.ts'],
        },
      },
      {
        plugins: [react()],
        resolve: { alias },
        test: {
          name: 'client',
          environment: 'jsdom',
          include: ['client/src/**/*.test.{ts,tsx}'],
          setupFiles: ['client/src/test-setup.ts'],
        },
      },
    ],
  },
});
