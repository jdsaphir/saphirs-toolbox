import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// The pages' CSP only allows scripts from files. In dev, the React Fast Refresh
// preamble is an inline <script>, so the dev server alone allows inline scripts.
// Built pages keep the strict policy.
const devInlineScripts: Plugin = {
  name: 'dev-inline-scripts',
  apply: 'serve',
  transformIndexHtml: html => html.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'"),
};

export default defineConfig({
  plugins: [react(), devInlineScripts],
  root: resolve(__dirname, 'src/renderer'),
  base: './',
  build: {
    outDir: resolve(__dirname, 'dist-renderer'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        dolphin: resolve(__dirname, 'src/renderer/dolphin.html'),
        overlay: resolve(__dirname, 'src/renderer/overlay.html'),
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
