#!/usr/bin/env node
/**
 * yoto-serve
 * Browse and download your audiobook library from a local web UI.
 *
 * Usage:
 *   npx yoto-myo-uploader serve /path/to/audiobooks
 *   npx yoto-myo-uploader serve /path/to/audiobooks --port 3000 --password secret
 */

import express from 'express'
import archiver from 'archiver'
import { readdir } from 'fs/promises'
import { createReadStream, existsSync } from 'fs'
import { join, extname, resolve, basename } from 'path'
import { stat } from 'fs/promises'

const args = process.argv.slice(2)

function getArg (flag, defaultVal) {
  const idx = args.indexOf(flag)
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : defaultVal
}

const booksDir = resolve(args.find(a => !a.startsWith('--')) || '')
const PORT = parseInt(getArg('--port', process.env.PORT || '3000'))
const PASSWORD = getArg('--password', process.env.PASSWORD || '')

async function main () {
  if (!args.find(a => !a.startsWith('--'))) {
    console.error('Usage: yoto-serve /path/to/audiobooks [--port 3000] [--password secret]')
    process.exit(1)
  }

  try {
    const s = await stat(booksDir)
    if (!s.isDirectory()) throw new Error()
  } catch {
    console.error(`Error: not a directory: ${booksDir}`)
    process.exit(1)
  }

  const app = express()

  // Optional basic auth
  if (PASSWORD) {
    app.use((req, res, next) => {
      const auth = req.headers['authorization']
      if (auth) {
        const [, b64] = auth.split(' ')
        const [, pass] = Buffer.from(b64, 'base64').toString().split(':')
        if (pass === PASSWORD) return next()
      }
      res.set('WWW-Authenticate', 'Basic realm="Yoto Library"')
      res.status(401).send('Login required')
    })
  }

  async function getBooks () {
    const entries = await readdir(booksDir, { withFileTypes: true })
    return entries.filter(e => e.isDirectory()).map(e => e.name).sort()
  }

  async function getMp3s (bookDir) {
    const files = await readdir(bookDir)
    return files.filter(f => extname(f).toLowerCase() === '.mp3').sort()
  }

  function findCover (bookDir) {
    for (const name of ['cover.jpg', 'cover.jpeg', 'cover.png', 'folder.jpg', 'folder.jpeg']) {
      const p = join(bookDir, name)
      if (existsSync(p)) return p
    }
    return null
  }

  // Main page
  app.get('/', async (req, res) => {
    const books = await getBooks()

    const cards = await Promise.all(books.map(async b => {
      const bookDir = join(booksDir, b)
      const cover = findCover(bookDir)
      const mp3s = await getMp3s(bookDir)
      const ext = cover ? cover.split('.').pop() : null
      return `
      <div class="card">
        ${cover
          ? `<img src="/cover/${encodeURIComponent(b)}" alt="${b.replace(/"/g, '')}">`
          : `<div class="no-cover">${b.charAt(0).toUpperCase()}</div>`
        }
        <div class="info">
          <span class="title">${b}</span>
          <span class="meta">${mp3s.length} track${mp3s.length !== 1 ? 's' : ''}</span>
        </div>
        <a class="dl-btn" href="/zip/${encodeURIComponent(b)}" download>⬇ Download ZIP</a>
      </div>`
    }))

    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Yoto Library — ${basename(booksDir)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0 }
  body { font-family: system-ui, sans-serif; background: #111827; color: #f9fafb; min-height: 100vh; }
  header { background: #1f2937; padding: 20px 24px; border-bottom: 2px solid #374151; display: flex; align-items: center; gap: 12px; }
  header h1 { font-size: 1.3rem; color: #f9fafb; }
  header .count { font-size: 0.85rem; color: #9ca3af; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 16px; padding: 24px; }
  .card { background: #1f2937; border-radius: 10px; overflow: hidden; display: flex; flex-direction: column; transition: transform 0.15s, box-shadow 0.15s; }
  .card:hover { transform: translateY(-3px); box-shadow: 0 8px 24px rgba(0,0,0,0.4); }
  .card img { width: 100%; aspect-ratio: 2/3; object-fit: cover; }
  .no-cover { width: 100%; aspect-ratio: 2/3; background: #374151; display: flex; align-items: center; justify-content: center; font-size: 3rem; color: #6b7280; font-weight: bold; }
  .info { padding: 8px 10px 4px; flex: 1; }
  .title { font-size: 0.78rem; color: #f3f4f6; display: block; line-height: 1.3; }
  .meta { font-size: 0.7rem; color: #6b7280; display: block; margin-top: 4px; }
  .dl-btn { display: block; text-align: center; background: #3b82f6; color: white; text-decoration: none; padding: 8px; font-size: 0.8rem; font-weight: 600; transition: background 0.15s; }
  .dl-btn:hover { background: #2563eb; }
</style>
</head>
<body>
<header>
  <h1>📚 Yoto Library</h1>
  <span class="count">${books.length} book${books.length !== 1 ? 's' : ''} &bull; ${basename(booksDir)}</span>
</header>
<div class="grid">${cards.join('\n')}</div>
</body>
</html>`)
  })

  // Serve cover image
  app.get('/cover/:book', async (req, res) => {
    const bookDir = join(booksDir, decodeURIComponent(req.params.book))
    const cover = findCover(bookDir)
    if (cover) {
      const ext = cover.split('.').pop().toLowerCase()
      res.setHeader('Content-Type', ext === 'png' ? 'image/png' : 'image/jpeg')
      createReadStream(cover).pipe(res)
    } else {
      res.status(404).end()
    }
  })

  // Download book as ZIP
  app.get('/zip/:book', async (req, res) => {
    const book = decodeURIComponent(req.params.book)
    const bookDir = join(booksDir, book)
    const tracks = await getMp3s(bookDir)

    const safeName = book.replace(/[^\w\s#()-]/g, '').trim()
    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.zip"`)

    const archive = archiver('zip', { zlib: { level: 0 } })
    archive.on('error', err => { console.error(err); res.status(500).end() })
    archive.pipe(res)

    for (const track of tracks) {
      archive.file(join(bookDir, track), { name: track })
    }
    archive.finalize()
  })

  app.listen(PORT, () => {
    console.log(`\nYoto library server running at http://localhost:${PORT}`)
    console.log(`Books folder: ${booksDir}`)
    if (PASSWORD) console.log(`Password protected (use any username)`)
    console.log('\nCtrl+C to stop\n')
  })
}

main().catch(err => {
  console.error('Error:', err.message)
  process.exit(1)
})
