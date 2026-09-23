import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        app: fileURLToPath(new URL('./index.html', import.meta.url)),
        palettes: fileURLToPath(new URL('./palette-lab.html', import.meta.url)),
      },
    },
  },
  server: {
    host: '127.0.0.1',
  },
})
