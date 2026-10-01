import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { mkdirSync } from 'node:fs'

/** Dev-only sink for the portrait studio (?studio): POST /__portrait?id=<formId> with a
 *  PNG body → public/portraits/<formId>.webp. Never part of a build. */
function portraitSink(): Plugin {
  return {
    name: 'portrait-sink',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__portrait', (req, res) => {
        const id = new URL(req.url ?? '', 'http://dev').searchParams.get('id') ?? ''
        if (req.method !== 'POST' || !/^[a-z0-9]+$/.test(id)) {
          res.statusCode = 400
          res.end('bad request')
          return
        }
        const chunks: Buffer[] = []
        req.on('data', (c: Buffer) => chunks.push(c))
        req.on('end', async () => {
          try {
            const sharp = (await import('sharp')).default
            mkdirSync('public/portraits', { recursive: true })
            await sharp(Buffer.concat(chunks))
              .resize(256, 256)
              .webp({ quality: 88, alphaQuality: 90 })
              .toFile(`public/portraits/${id}.webp`)
            res.end('ok')
          } catch (e) {
            res.statusCode = 500
            res.end(String(e))
          }
        })
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), portraitSink()],
})
