import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite' // YENİ EKLENDİ

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(), // YENİ EKLENDİ
  ],
  server: {
    port: 3000,
    strictPort: true,
  }
})