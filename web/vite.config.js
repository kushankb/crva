import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/crva/' : '/',
  plugins: [react()],
  optimizeDeps: { exclude: ['pmtiles'] },
  server: { fs: { strict: false } },
}))
