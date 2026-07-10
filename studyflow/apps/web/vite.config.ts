import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
    proxy: {
      '/api/learning': {
        target: 'http://localhost:18082',
        changeOrigin: true,
      },
    },
  },
})
