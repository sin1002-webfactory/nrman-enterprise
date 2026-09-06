import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      // The hosted preview does not expose Vite's websocket endpoint, so the
      // injected @vite/client would repeatedly report a closed websocket.
      hmr: false,
      watch: null,
    },
  };
});
