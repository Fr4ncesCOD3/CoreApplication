import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Carica le variabili d'ambiente in base all'ambiente (development/production)
  const env = loadEnv(mode, process.cwd(), '')
  
  // Usa l'URL API dalle variabili d'ambiente o il valore di fallback
  const apiUrl = env.VITE_API_URL || 'http://localhost:8080'
  
  console.log(`Configurazione proxy con target: ${apiUrl}`)
  console.log(`Ambiente: ${mode}`)
  
  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src')
      }
    },
    server: {
      proxy: {
        '/auth': {
          target: apiUrl,
          changeOrigin: true,
          secure: false,
          configure: (proxy, _options) => {
            proxy.on('error', (err, _req, _res) => {
              console.log('Errore proxy:', err);
            });
          }
        },
        '/api': {
          target: apiUrl,
          changeOrigin: true,
          secure: false
        },
        '/csrf': {
          target: apiUrl,
          changeOrigin: true,
          secure: false
        },
        // Aggiungi un proxy generico per le richieste con token CSRF nell'URL
        '^/[a-zA-Z0-9-_]+/notes': {
          target: apiUrl,
          changeOrigin: true,
          secure: false,
          rewrite: (path) => {
            // Usa il formato esatto che il backend si aspetta
            return path;
          }
        }
      }
    },
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      sourcemap: true,
      rollupOptions: {
        output: {
          manualChunks: {
            'react-vendor': ['react', 'react-dom', 'react-router-dom'],
            'ui-vendor': ['react-toastify', 'axios']
          }
        }
      }
    }
  }
})
