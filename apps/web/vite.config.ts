import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import legacy from '@vitejs/plugin-legacy';
import basicSsl from '@vitejs/plugin-basic-ssl';

// `--mode phone` serves the same app over self-signed HTTPS on :5174, because phone
// browsers only allow the microphone (voice notes) in a secure context. The TV keeps
// using plain HTTP on :5173.
export default defineConfig(({ mode }) => {
  const phone = mode === 'phone';
  return {
    plugins: [react(), legacy({ targets: ['chrome >= 61'] }), ...(phone ? [basicSsl()] : [])],
    server: {
      host: true,
      port: phone ? 5174 : 5173,
      strictPort: true,
      // `npm run mcp:local` serves the Vercel function at :3333 during development.
      proxy: { '/api': 'http://localhost:3333' },
    },
    // Pre-bundle everything up front: a mid-session re-optimisation on the TV
    // leaves two React copies loaded ("Invalid hook call").
    optimizeDeps: {
      include: ['react', 'react-dom', 'react-dom/client', 'react-router-dom', '@supabase/supabase-js', 'qrcode.react'],
    },
  };
});
