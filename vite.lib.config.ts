import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'FrontierAudio',
      fileName: 'index',
      formats: ['es']
    },
    outDir: 'dist',
    emptyOutDir: false,
    sourcemap: true
  }
})
