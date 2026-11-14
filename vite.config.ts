import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'

// base = Unterpfad auf GitHub Pages (https://vanhoek-daan.github.io/schulalltag/)
export default defineConfig({
  base: '/schulalltag/',
  plugins: [svelte()],
})
