import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'api/**/*.{test,spec}.ts'],
    environment: 'jsdom',
    environmentMatchGlobs: [['api/**/*.test.ts', 'node']],
    setupFiles: ['./src/test/setup.ts'],
    css: true,
  },
})
