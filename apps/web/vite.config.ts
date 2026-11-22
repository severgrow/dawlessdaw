import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@dawlessdaw/core': path.resolve(__dirname, '../../packages/core/src'),
      '@dawlessdaw/events': path.resolve(__dirname, '../../packages/events/src'),
      '@dawlessdaw/midi': path.resolve(__dirname, '../../packages/midi/src'),
      '@dawlessdaw/routing': path.resolve(__dirname, '../../packages/routing/src'),
      '@dawlessdaw/focus': path.resolve(__dirname, '../../packages/focus/src'),
      '@dawlessdaw/devices': path.resolve(__dirname, '../../packages/devices/src'),
      '@dawlessdaw/scenes': path.resolve(__dirname, '../../packages/scenes/src'),
      '@dawlessdaw/sessions': path.resolve(__dirname, '../../packages/sessions/src'),
      '@dawlessdaw/storage': path.resolve(__dirname, '../../packages/storage/src'),
    },
  },
  server: {
    port: 5173,
    host: true,
  },
});
