import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.svg',
        'favicon.ico',
        'robots.txt',
        'apple-touch-icon.png',
      ],
      manifest: {
        name: 'FoodTruck App',
        short_name: 'FoodTruck',
        description: 'App de ventas para FoodTruck',
        theme_color: '#ffffff',
        icons: [
          {
            src: 'icon-72.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icon-120.png',
            type: 'image/png',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,json,woff,woff2}'],
      },
    }),
  ],
});
