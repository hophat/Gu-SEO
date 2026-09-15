// Vite config for the admin React app (antd v6).
//
// Builds to public/admin-dist/ so Cloudflare Pages serves the bundle
// alongside the existing static files. The admin.html entry loads
// /admin-dist/main.js after the build.
//
// Usage:
//   npm run admin:build   # build for production
//   npm run admin:dev     # dev server with HMR
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'src/admin',
  base: '/admin-dist/',
  plugins: [react()],
  build: {
    outDir: '../../public/admin-dist',
    emptyOutDir: true,
    rollupOptions: {
      input: 'src/admin/index.html',
      output: {
        entryFileNames: 'main.js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
  server: {
    port: 5174,
    proxy: {
      '/api': 'http://localhost:8788',
      '/admin': 'http://localhost:8788',
    },
  },
});
