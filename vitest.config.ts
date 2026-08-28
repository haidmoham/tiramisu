import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'server/**/*.{test,spec}.ts'],
    environment: 'jsdom',
    environmentMatchGlobs: [['server/**/*.test.ts', 'node']],
    setupFiles: ['./src/test/setup.ts'],
    css: true,
  },
})
