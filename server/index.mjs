/**
 * Production entry: serves /api/health and /api/nasa/* and, when a built `dist`
 * folder exists, the static app with an SPA fallback. Node built-ins only.
 */
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { handleNasa } from './nasa.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist')
const port = Number(process.env.PORT) || 3000

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
}

async function serveStatic(req, res) {
  const url = new URL(req.url ?? '/', 'http://localhost')
  let file = path.normalize(path.join(root, decodeURIComponent(url.pathname)))
  if (!file.startsWith(root)) {
    res.statusCode = 400
    return res.end('Bad path')
  }
  try {
    const s = await stat(file)
    if (s.isDirectory()) file = path.join(file, 'index.html')
  } catch {
    file = path.join(root, 'index.html')
  }
  try {
    const body = await readFile(file)
    res.statusCode = 200
    res.setHeader('Content-Type', TYPES[path.extname(file)] ?? 'application/octet-stream')
    res.setHeader('Cache-Control', file.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache')
    res.end(req.method === 'HEAD' ? undefined : body)
  } catch {
    res.statusCode = 404
    res.end('Not found')
  }
}

createServer((req, res) => {
  const p = (req.url ?? '').split('?')[0]
  if (p === '/api/health' || p.startsWith('/api/nasa/')) return void handleNasa(req, res)
  return void serveStatic(req, res)
}).listen(port, '0.0.0.0', () => {
  console.log(`AlgoRythm server listening on :${port}`)
})
