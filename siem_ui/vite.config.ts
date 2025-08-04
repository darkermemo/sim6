import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import checker from 'vite-plugin-checker'

export default defineConfig({
  plugins: [
    react(),
    // Temporarily disabled checker to allow dev server to start
    // checker({
    //   typescript: true,
    //   eslint: {
    //     lintCommand: 'eslint "./src/**/*.{ts,tsx}" --quiet',
    //     dev: {
    //       logLevel: ['error']
    //     }
    //   },
    //   overlay: false
    // })
  ],
  server: {
    port: parseInt(process.env.VITE_PORT || '3000'),
    host: true,
    proxy: {
      // Route dashboard, events, and cases to main SIEM API on 8082
      '/api/v1/dashboard': {
        target: 'http://127.0.0.1:8082',
        changeOrigin: true,
        secure: false,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      },
      '/api/v1/events': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        secure: false,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      },
      '/api/v1/cases': {
        target: 'http://127.0.0.1:8082',
        changeOrigin: true,
        secure: false,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      },
      // Route routing-rules to the routing microservice on 8084
      '/api/v1/routing-rules': {
        target: 'http://127.0.0.1:8084',
        changeOrigin: true,
        secure: false,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      },
      '/api/v1/auth': {
        target: 'http://127.0.0.1:8084',
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