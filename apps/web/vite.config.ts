import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { readdirSync } from 'node:fs';
export default defineConfig({
  plugins: [react(), tailwindcss()], base: process.env.PAGES_BASE || '/',
  define: { __ART_FILES__: JSON.stringify(readdirSync(new URL('./public/assets/generated/',import.meta.url)).filter(f=>f.endsWith('.png'))) },
  server: { port:5174,strictPort:true,proxy: { '/api': 'http://127.0.0.1:8793' } },
  build: { rollupOptions: { output: { manualChunks: { phaser: ['phaser'] } } } },
});
