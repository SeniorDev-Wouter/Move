import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages project site is served from /<repo>/. Change this to match
  // your repo name (or '/' for a user site / custom domain at the root).
  base: '/Move/',
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
  },
})
