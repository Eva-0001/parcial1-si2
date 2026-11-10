import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

// Configuración propia de las pruebas: no carga el plugin de la PWA de vite.config.js.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'happy-dom',
    // IndexedDB en memoria para probar las colas offline.
    setupFiles: ['fake-indexeddb/auto'],
    include: ['src/**/*.test.{js,jsx}'],
  },
})
