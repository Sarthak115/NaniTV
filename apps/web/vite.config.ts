import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import legacy from '@vitejs/plugin-legacy';

// Fire TV sticks can ship older Android System WebViews; the legacy plugin
// adds a transpiled fallback bundle for production builds.
export default defineConfig({
  plugins: [react(), legacy({ targets: ['chrome >= 61'] })],
  server: { host: true, port: 5173 },
});
