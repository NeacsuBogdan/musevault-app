import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'server-only': fileURLToPath(new URL('./src/test/server-only.ts', import.meta.url)),
    },
  },
  test: {
    clearMocks: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    mockReset: true,
    restoreMocks: true,
  },
});
