import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { avatarkitVitePlugin } from '@spatius/avatarkit/vite'

export default defineConfig({
  plugins: [vue(), avatarkitVitePlugin()],
  server: { port: 3000 },
})
