import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// En desarrollo (npm run dev) la API y los archivos los sirve el backend en el puerto 4000.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    proxy: {
      '/api': 'http://localhost:4000',
      '/archivos': 'http://localhost:4000',
    },
  },
})
