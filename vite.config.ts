import { defineConfig } from 'vite'

export default defineConfig({
  root: 'demo',
  server: {
    host: '0.0.0.0',
    port: 5173
  },
  resolve: {
    alias: {
      '@': '/src'
    }
  }
})
