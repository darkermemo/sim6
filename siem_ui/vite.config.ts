import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import checker from 'vite-plugin-checker'

export default defineConfig({
  plugins: [
    react(),
    checker({
      typescript: true,
      eslint: {
        lintCommand: 'eslint "./src/**/*.{ts,tsx}" --quiet',
        dev: {
          logLevel: ['error']
        }
      },
      overlay: false
    })
  ],
  server: {
    port: parseInt(process.env.VITE_PORT || '3000'),
    host: true,
    proxy: {
      // Route dashboard and search APIs directly to Rust backend
      '/api/v1/dashboard': {
        target: 'http://localhost:8084',
        changeOrigin: true,
        secure: false,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      },
      '/api/v1/events/search': {
        target: 'http://localhost:8084',
        changeOrigin: true,
        secure: false,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      },
      '/api/v1/events': {
        target: 'http://localhost:8084',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api\/v1\/events/, '/events'),
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      },
      '/api/v1/search': {
        target: 'http://localhost:8084',
        changeOrigin: true,
        secure: false,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      },
      // Route other APIs to Node.js mock server for endpoints not yet implemented in Rust
      '/api': {
        target: process.env.VITE_API_BASE || 'http://localhost:8090',
        changeOrigin: true,
        secure: false
      }
    }
  },
  resolve: {
    alias: {
      '@': '/src'
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: undefined
      }
    }
  }
})