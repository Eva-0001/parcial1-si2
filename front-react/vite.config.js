import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// Archivos de public/ que tambien forman parte del app shell offline.
const PUBLICOS_PRECACHE = [
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.ico',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png',
  '/qr-pago.png',
]

/**
 * Genera dist/sw.js a partir de pwa/sw.js con la lista de archivos del build (para
 * precachearlos, incluidas las paginas lazy) y una version que cambia en cada build.
 */
function pwa() {
  return {
    name: 'fashionstore-pwa',
    apply: 'build',
    generateBundle(_opciones, bundle) {
      const archivos = Object.keys(bundle)
        .filter((nombre) => !nombre.endsWith('.map') && nombre !== 'index.html')
        .map((nombre) => `/${nombre}`)
      const precache = [...new Set([...PUBLICOS_PRECACHE, ...archivos])].sort()
      const plantilla = readFileSync(new URL('./pwa/sw.js', import.meta.url), 'utf8')
      const version = createHash('sha256')
        .update(precache.join('|') + plantilla)
        .digest('hex')
        .slice(0, 12)

      const source = plantilla
        .replaceAll('__VERSION__', version)
        .replaceAll('__PRECACHE__', JSON.stringify(precache, null, 2))
      if (source.includes('__VERSION__') || source.includes('__PRECACHE__')) {
        this.error('pwa/sw.js: quedaron marcadores sin reemplazar')
      }
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), pwa()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
