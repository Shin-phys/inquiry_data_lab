import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// GitHub Pages: https://shin-phys.github.io/inquiry_data_lab/
export default defineConfig({
  base: '/inquiry_data_lab/',
  plugins: [react(), tailwindcss()],
})
