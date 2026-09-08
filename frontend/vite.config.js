import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  plugins: [
    react(),
    nodePolyfills({
      include: ['events', 'util', 'buffer', 'process'],
      globals: {
        process: true,
        Buffer: true,
        global: true,
      },
      protocolImports: true,
    })
  ],
  define: {
    global: 'globalThis',
    'process.env': {}
  },
  server: {
    port: 5173,
    proxy: {
      '/audio': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
    exclude: ['**/e2e/**', '**/node_modules/**', '**/dist/**', '**/test-results/**'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          stomp: ['@stomp/stompjs'],
          charts: ['recharts'],
        }
      }
    }
  }
})
