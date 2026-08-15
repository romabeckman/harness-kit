import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    exclude: ['tests/e2e/**', '.vscode/**', 'node_modules/**', 'dist/**'],
    globals: true,
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
