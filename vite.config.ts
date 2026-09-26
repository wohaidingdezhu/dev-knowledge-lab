import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: null,
      manifest: {
        name: '片段 · 开发者知识库',
        short_name: '片段',
        description: '本地优先的开发者知识库与代码实验室',
        start_url: '/',
        display: 'standalone',
        theme_color: '#f6f7f9',
        background_color: '#f6f7f9',
        icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' }],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,webmanifest}'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  server: { port: 5173, strictPort: true },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (
            /\/(?:@codemirror|@lezer|@uiw|style-mod|crelt|w3c-keyname)\//.test(
              id,
            )
          )
            return 'editor'
          if (id.includes('/dexie/')) return 'storage'
          if (/\/(react|react-dom|scheduler)\//.test(id)) return 'react'
          return 'vendor'
        },
      },
    },
  },
})
