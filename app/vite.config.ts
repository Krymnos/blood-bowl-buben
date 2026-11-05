import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Sevens Dugout — Blood Bowl Sevens manager',
        short_name: 'Sevens Dugout',
        theme_color: '#14532d',
        background_color: '#0b1210',
        display: 'standalone',
        start_url: './',
        icons: [{ src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml' }],
      },
    }),
  ],
  server: { host: true },
})
