#!/usr/bin/env node
/**
 * yoto-convert
 * Converts a folder of audiobooks (mp3/m4a) into organized, Yoto-ready MP3s.
 * Copies cover art. Skips books already converted.
 *
 * Requires: ffmpeg installed and on PATH
 *
 * Usage:
 *   node bin/yoto-convert.js /path/to/source /path/to/output
 *
 * Source structure (one subfolder per book, any mix of mp3/m4a):
 *   /source/
 *     The Hobbit/
 *       01-01 The Hobbit.mp3
 *       cover.jpg
 *     Charlotte's Web/
 *       01 Charlotte's Web.m4a
 *       folder.jpeg
 *
 * Output structure (organized, renamed, all mp3):
 *   /output/
 *     The Hobbit/
 *       01 - The Hobbit.mp3
 *       cover.jpg
 *     Charlotte's Web/
 *       01 - Charlotte's Web.mp3
 *       cover.jpg
 */

import { readdir, mkdir, copyFile, stat, access } from 'fs/promises'
import { join, extname, basename, resolve } from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

const AUDIO_EXTS = new Set(['.mp3', '.m4a', '.m4b', '.aac', '.ogg', '.flac', '.wav'])
const COVER_NAMES = ['cover.jpg', 'cover.jpeg', 'cover.png', 'folder.jpg', 'folder.jpeg', 'folder.png']

const sourceDir = resolve(process.argv[2] || '')
const outputDir = resolve(process.argv[3] || '')

async function checkFfmpeg () {
  try {
    await execFileAsync('ffmpeg', ['-version'])
    return true
  } catch {
    return false
  }
}

async function exists (p) {
  try { await access(p); return true } catch { return false }
}

function cleanTrackTitle (filename, ext) {
  return filename
    .slice(0, -ext.length)             // remove extension
    .replace(/^\d+[\s\-_.]+\d*[\s\-_.]*/, '') // strip leading track numbers (01, 01-01, 01. etc)
    .replace(/^\d+[\s\-_.]+/, '')       // strip any remaining leading number
    .trim()
    || basename(filename, ext)          // fallback to original name
}

async function convertTrack (inputPath, outputPath) {
  const ext = extname(inputPath).toLowerCase()

  if (ext === '.mp3') {
    // Already MP3 — copy directly (fast, no re-encode)
    await copyFile(inputPath, outputPath)
  } else {
    // Convert to MP3 via ffmpeg
    await execFileAsync('ffmpeg', [
      '-i', inputPath,
      '-vn',           // no video
      '-ar', '44100',  // sample rate
      '-ac', '2',      // stereo
      '-b:a', '128k',  // bitrate
      '-y',            // overwrite
      outputPath
    ])
  }
}

async function main () {
  if (!process.argv[2] || !process.argv[3]) {
    console.error('Usage: node bin/yoto-convert.js /path/to/source /path/to/output')
    console.error('')
    console.error('Source should contain one subfolder per book.')
    console.error('Output will be created if it does not exist.')
    process.exit(1)
  }

  // Validate source
  try {
    const s = await stat(sourceDir)
    if (!s.isDirectory()) throw new Error()
  } catch {
    console.error(`Error: source folder not found: ${sourceDir}`)
    process.exit(1)
  }

  // Check ffmpeg
  if (!(await checkFfmpeg())) {
    console.error('Error: ffmpeg not found. Install it first:')
    console.error('  Mac:    brew install ffmpeg')
    console.error('  Ubuntu: sudo apt install ffmpeg')
    console.error('  Windows: https://ffmpeg.org/download.html')
    process.exit(1)
  }

  await mkdir(outputDir, { recursive: true })

  console.log(`\nyoto-convert`)
  console.log(`Source: ${sourceDir}`)
  console.log(`Output: ${outputDir}\n`)

  const books = (await readdir(sourceDir, { withFileTypes: true }))
    .filter(e => e.isDirectory())
    .map(e => e.name)
    .sort()

  if (books.length === 0) {
    console.error('No subfolders found in source directory.')
    process.exit(1)
  }

  console.log(`Found ${books.length} book(s).\n`)

  let converted = 0
  let skipped = 0

  for (let i = 0; i < books.length; i++) {
    const bookName = books[i]
    const bookSrc = join(sourceDir, bookName)
    const bookOut = join(outputDir, bookName)

    // Skip if output folder already has MP3s
    if (await exists(bookOut)) {
      const existing = (await readdir(bookOut)).filter(f => extname(f).toLowerCase() === '.mp3')
      if (existing.length > 0) {
        console.log(`[${i + 1}/${books.length}] Skip (already converted): ${bookName}`)
        skipped++
        continue
      }
    }

    console.log(`[${i + 1}/${books.length}] ${bookName}`)
    await mkdir(bookOut, { recursive: true })

    // Get audio files sorted
    const allFiles = await readdir(bookSrc)
    const audioFiles = allFiles
      .filter(f => AUDIO_EXTS.has(extname(f).toLowerCase()))
      .sort()

    if (audioFiles.length === 0) {
      console.log('  No audio files found, skipping.\n')
      continue
    }

    // Convert tracks
    for (let t = 0; t < audioFiles.length; t++) {
      const file = audioFiles[t]
      const ext = extname(file).toLowerCase()
      const title = cleanTrackTitle(file, ext) || `Track ${t + 1}`
      const outName = `${String(t + 1).padStart(2, '0')} - ${title}.mp3`
      const outPath = join(bookOut, outName)

      process.stdout.write(`  [${t + 1}/${audioFiles.length}] ${title}`)

      if (await exists(outPath)) {
        console.log(' (exists)')
        continue
      }

      try {
        await convertTrack(join(bookSrc, file), outPath)
        console.log(' ✓')
      } catch (err) {
        console.log(` FAILED: ${err.message.split('\n').pop()}`)
      }
    }

    // Copy cover art
    const cover = allFiles.find(f => COVER_NAMES.includes(f.toLowerCase()))
    if (cover) {
      const ext = extname(cover).toLowerCase()
      const destName = `cover${ext}`
      await copyFile(join(bookSrc, cover), join(bookOut, destName))
      console.log(`  Cover copied (${cover})`)
    }

    console.log()
    converted++
  }

  console.log(`Done! ${converted} book(s) converted, ${skipped} skipped.`)
  console.log(`Output ready at: ${outputDir}`)
  console.log(`\nNext step: node bin/yoto-upload.js ${outputDir}`)
}

main().catch(err => {
  console.error('\nError:', err.message)
  process.exit(1)
})
