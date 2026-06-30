import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { avatarkitVitePlugin } from '@spatius/avatarkit/vite'
import { doubaoRealtimeProxy } from './doubaoProxy'

export default defineConfig(({ mode }) => {
  const env = {
    ...loadEnv(mode, process.cwd(), ''),
    ...process.env,
  }

  return {
    plugins: [vue(), avatarkitVitePlugin(), doubaoRealtimeProxy(env)],
    server: { port: 3000 },
  }
})
