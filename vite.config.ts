import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 18790,
    strictPort: true,
  },
  preview: {
    port: 18790,
    host: '0.0.0.0',
    allowedHosts: ['hubclaw.greench-ai.net', 'localhost', '127.0.0.1'],
  },
  build: {
    outDir: 'dist',
    target: 'es2022',
  },
});
