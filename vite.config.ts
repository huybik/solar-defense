import { defineConfig } from 'vite'
import path from 'path'
import fs from 'fs'

const sdkPath = path.resolve(__dirname, '../_sdk/src')
const sdkAlias = fs.existsSync(sdkPath)
  ? sdkPath
  : path.resolve(__dirname, 'src/sdk-shim.ts')

export default defineConfig({
  base: './',
  define: {
    __IS_STANDALONE__: JSON.stringify(!fs.existsSync(sdkPath)),
  },
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
      '@learnfun/game-sdk': sdkAlias,
    },
  },
})
