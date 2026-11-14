import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'
import { resolve } from 'node:path'

// base = Unterpfad auf GitHub Pages (https://vanhoek-daan.github.io/schulalltag/)
export default defineConfig({
  base: '/schulalltag/',
  plugins: [svelte()],
  build: {
    rollupOptions: {
      // zwei Seiten: Haupt-App (mit Login) und Schnellerfassung für Kolleg:innen (ohne Login)
      input: { main: resolve(__dirname, 'index.html'), erfassen: resolve(__dirname, 'erfassen.html') },
    },
  },
})
