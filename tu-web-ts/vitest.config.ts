import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // X6 ships a CJS `main` (lib/) which breaks under Vitest's ESM loader;
      // force the ESM build and transform it inline so directory imports resolve.
      '@antv/x6': fileURLToPath(new URL('./node_modules/@antv/x6/es/index.js', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    server: {
      deps: {
        inline: ['@antv/x6'],
      },
    },
  },
})
