import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { defineConfig } from 'vite'
import { avatarkitVitePlugin } from '@spatius/avatarkit/vite'

const __dirname = dirname(fileURLToPath(import.meta.url))

function ensureDistAssetsDir() {
  return {
    name: 'ensure-dist-assets-dir',
    closeBundle() {
      mkdirSync(join(__dirname, 'dist/assets'), { recursive: true })
    },
  }
}

export default defineConfig({
  plugins: [
    ensureDistAssetsDir(),
    avatarkitVitePlugin(),
  ],
  root: __dirname,
  server: {
    port: 5175,
    open: true,
  },
  resolve: {
    alias: {
      '@': __dirname + '/src',
    },
  },
})
