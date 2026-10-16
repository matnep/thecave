// Builds the admin (React + shadcn/ui) into public/admin: index.html is /admin, panel.html is the moderator panel at /panel.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: '/admin/',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  publicDir: false,
  build: {
    outDir: '../public/admin',
    emptyOutDir: true,
    rollupOptions: { input: { admin: fileURLToPath(new URL('./index.html', import.meta.url)), panel: fileURLToPath(new URL('./panel.html', import.meta.url)) } },
  },
});
