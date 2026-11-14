import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
// The same handler runs in production (server/index.mjs), so Preview and
// production share one implementation of /api/nasa.
import { nasaMiddleware } from './server/nasa.mjs'

function nasaProxy(): Plugin {
  return {
    name: 'algorhythm-nasa-proxy',
    configureServer(server) {
      server.middlewares.use(nasaMiddleware())
    },
    configurePreviewServer(server) {
      server.middlewares.use(nasaMiddleware())
    },
  }
}

export default defineConfig({
  plugins: [nasaProxy(), react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: ['.manus.computer', 'localhost'],
    watch: { ignored: ['**/.cache/**'] },
  },
  worker: { format: 'es' },
  build: { target: 'es2022' },
})
