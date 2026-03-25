import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineConfig({
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
    strictPort: true,
    hmr: {
      port: 5173
    },
    proxy: {
      '/audio': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
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
