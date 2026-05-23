import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * CONFIG OPTIMIZADA - sin romper funcionalidad
 *
 * Cambios respecto a la version original:
 *   1. manualChunks: separa vendors pesados (react, recharts, xlsx) en chunks propios
 *      -> el navegador los cachea entre paginas y la primera carga baja de tamano.
 *   2. esbuild drop console/debugger en produccion -> bundle mas pequeno + sin logs en prod.
 *   3. chunkSizeWarningLimit subido para evitar warnings ruidosos.
 *   4. sourcemap desactivado en prod -> menos peso publicado.
 */
export default defineConfig(({ mode }) => ({
  plugins: [react()],

  esbuild: {
    drop: mode === 'production' ? ['console', 'debugger'] : [],
    legalComments: 'none',
  },

  build: {
    target: 'es2020',
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
    cssCodeSplit: true,
    reportCompressedSize: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('recharts') || id.includes('d3-')) return 'vendor-charts';
          if (id.includes('xlsx') || id.includes('jszip')) return 'vendor-xlsx';
          if (id.includes('socket.io-client') || id.includes('engine.io-client')) return 'vendor-socket';
          if (id.includes('react-router')) return 'vendor-router';
          if (id.includes('axios')) return 'vendor-axios';
          if (
            id.includes('node_modules/react/') ||
            id.includes('node_modules/react-dom/') ||
            id.includes('scheduler')
          ) return 'vendor-react';
          return 'vendor-misc';
        },
      },
    },
  },

  server: {
    host: true,
    port: 5173,
    strictPort: false,
  },

  preview: {
    host: true,
    port: 4173,
  },
}))
