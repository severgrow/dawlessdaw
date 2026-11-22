import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@nervos/core': path.resolve(__dirname, 'packages/core/src'),
      '@nervos/events': path.resolve(__dirname, 'packages/events/src'),
      '@nervos/midi': path.resolve(__dirname, 'packages/midi/src'),
      '@nervos/routing': path.resolve(__dirname, 'packages/routing/src'),
      '@nervos/focus': path.resolve(__dirname, 'packages/focus/src'),
      '@nervos/devices': path.resolve(__dirname, 'packages/devices/src'),
      '@nervos/scenes': path.resolve(__dirname, 'packages/scenes/src'),
      '@nervos/sessions': path.resolve(__dirname, 'packages/sessions/src'),
      '@nervos/storage': path.resolve(__dirname, 'packages/storage/src'),
    },
  },
});
