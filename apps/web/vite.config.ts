import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@nervos/core': path.resolve(__dirname, '../../packages/core/src'),
      '@nervos/events': path.resolve(__dirname, '../../packages/events/src'),
      '@nervos/midi': path.resolve(__dirname, '../../packages/midi/src'),
      '@nervos/routing': path.resolve(__dirname, '../../packages/routing/src'),
      '@nervos/focus': path.resolve(__dirname, '../../packages/focus/src'),
      '@nervos/devices': path.resolve(__dirname, '../../packages/devices/src'),
      '@nervos/scenes': path.resolve(__dirname, '../../packages/scenes/src'),
      '@nervos/sessions': path.resolve(__dirname, '../../packages/sessions/src'),
      '@nervos/storage': path.resolve(__dirname, '../../packages/storage/src'),
    },
  },
  server: {
    port: 5173,
    host: true,
  },
});
