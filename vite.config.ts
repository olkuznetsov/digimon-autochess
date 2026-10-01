import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { mkdirSync } from 'node:fs'

/** Dev-only sinks for the render studios (never part of a build):
 *  POST /__portrait?id=<formId> (PNG) → public/portraits/<formId>.webp (?studio)
 *  POST /__asset?name=<file>.<jpg|png> (PNG) → public/<file> (?studio=og) */
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
      server.middlewares.use('/__asset', (req, res) => {
        const name = new URL(req.url ?? '', 'http://dev').searchParams.get('name') ?? ''
        const m = /^([a-z0-9-]+)\.(jpg|png)$/.exec(name)
        if (req.method !== 'POST' || !m) {
          res.statusCode = 400
          res.end('bad request')
          return
        }
        const chunks: Buffer[] = []
        req.on('data', (c: Buffer) => chunks.push(c))
        req.on('end', async () => {
          try {
            const sharp = (await import('sharp')).default
            const img = sharp(Buffer.concat(chunks))
            await (m[2] === 'jpg' ? img.jpeg({ quality: 88, mozjpeg: true }) : img.png()).toFile(`public/${name}`)
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
