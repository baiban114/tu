import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const devProxyTarget = env.VITE_DEV_PROXY_TARGET || 'http://localhost:18080'

  return {
    plugins: [
      vue(),
      mode === 'development' ? vueDevTools() : undefined,
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      },
      dedupe: ['pdfjs-dist'],
    },
    server: {
      proxy: {
        '/api': {
          target: devProxyTarget,
          changeOrigin: true,
          timeout: 0,
        },
      },
    },
    preview: {
      proxy: {
        '/api': {
          target: devProxyTarget,
          changeOrigin: true,
          timeout: 0,
        },
      },
    },
  }
})
