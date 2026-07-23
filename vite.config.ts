import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { localSharePlugin } from './build/local-share-plugin.js'

export default defineConfig({
  envPrefix: ['VITE_', 'APP_'],
  server: {
    allowedHosts: [ "unadduceable-jeffry-squashy.ngrok-free.dev"],
  },
  plugins: [
    localSharePlugin(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'TOBFest Photobooth',
        short_name: 'TOB Booth',
        description: 'Photobooth on-site untuk iPad di TOBFest.',
        theme_color: '#fffaf0',
        background_color: '#fffaf0',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          {
            src: '/favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,jpg,jpeg,webp}'],
        cleanupOutdatedCaches: true,
        navigateFallbackDenylist: [
          /^\/templates\//,
          /^\/api\//,
          /^\/download\//,
        ],
      },
    }),
  ],
})
