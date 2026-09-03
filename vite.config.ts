import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { localSharePlugin } from './build/local-share-plugin.js'

/** @type {import('vite').UserConfig} */
export default defineConfig({
  envPrefix: ['VITE_', 'APP_'],
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
  },
  plugins: [
    localSharePlugin(),
    tailwindcss(),
    react(),
  ],
})
