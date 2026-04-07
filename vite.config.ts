import { defineConfig } from 'vite'
import path from 'path'

export default defineConfig({
  base: './',
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three'
        },
      },
    },
  },
  resolve: {
    alias: {
      '@learnfun/game-sdk': path.resolve(__dirname, '../_sdk/src'),
    },
  },
})
