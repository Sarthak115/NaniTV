import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import legacy from '@vitejs/plugin-legacy';

// Fire TV sticks can ship older Android System WebViews; the legacy plugin
// adds a transpiled fallback bundle for production builds.
export default defineConfig({
  plugins: [react(), legacy({ targets: ['chrome >= 61'] })],
  server: { host: true, port: 5173 },
  // Pre-bundle everything up front: a mid-session re-optimisation on the TV
  // leaves two React copies loaded ("Invalid hook call").
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-dom/client', 'react-router-dom', '@supabase/supabase-js', 'qrcode.react'],
  },
});
