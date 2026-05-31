import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 18790,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    target: 'es2022',
  },
});
