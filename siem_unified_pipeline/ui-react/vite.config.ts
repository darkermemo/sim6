import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: '/ui/app/',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:9999', changeOrigin: true },
      '/metrics': { target: 'http://127.0.0.1:9999', changeOrigin: true },
    },
  },
})
