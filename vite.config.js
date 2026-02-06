import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const appConfigPlugin = () => {
  const getContent = () => {
    const key =
      process.env.FIREBASE_VAPID_KEY ||
      process.env.VITE_FIREBASE_VAPID_KEY ||
      ''
    const payload = { FIREBASE_VAPID_KEY: key }
    return `window.__APP_CONFIG__ = ${JSON.stringify(payload)};\n`
  }

  return {
    name: 'app-config',
    configureServer(server) {
      server.middlewares.use('/app-config.js', (req, res) => {
        res.setHeader('Content-Type', 'application/javascript')
        res.end(getContent())
      })
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'app-config.js',
        source: getContent(),
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), appConfigPlugin()],
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
})
