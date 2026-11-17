import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseChapters, safeFileTitle, splitRange, partitionCards, chapterItems, encodeArgs
} from '../bin/yoto-convert.js'

const opts = { bitrate: 48, channels: 1, maxMinutes: 55 }
const sum = (xs, f) => xs.reduce((n, x) => n + f(x), 0)

test('parseChapters reads, sorts and drops empty chapters', () => {
  const ch = parseChapters({
    chapters: [
      { start_time: '60.5', end_time: '120.0', tags: { title: ' Chapter Two ' } },
      { start_time: '0.000', end_time: '60.5', tags: { title: 'Chapter One' } },
      { start_time: '120.0', end_time: '120.0', tags: { title: 'empty' } }
    ]
  })
  assert.deepEqual(ch, [
    { start: 0, end: 60.5, title: 'Chapter One' },
    { start: 60.5, end: 120, title: 'Chapter Two' }
  ])
  assert.deepEqual(parseChapters({}), [])
})

test('safeFileTitle removes characters that are not safe in file names', () => {
  assert.equal(safeFileTitle('Chapter One: Dudley Demented'), 'Chapter One - Dudley Demented')
  assert.equal(safeFileTitle('AC/DC "Live"?'), 'AC-DC Live')
  assert.equal(safeFileTitle("Chapter Two - Dobby's Warning"), "Chapter Two - Dobby's Warning")
})

test('splitRange covers the range exactly', () => {
  const r = splitRange(100, 400, 3)
  assert.deepEqual(r, [[100, 200], [200, 300], [300, 400]])
})

test('chapterItems returns null for fewer than two chapters', () => {
  assert.equal(chapterItems({}, [{ start: 0, end: 10, title: 'x' }], opts), null)
})

test('chapterItems makes one track per chapter and splits long chapters', () => {
  const items = chapterItems({ path: '/b.m4b' }, [
    { start: 0, end: 600, title: 'Short' },
    { start: 600, end: 600 + 70 * 60, title: 'Long' }
  ], opts)
  assert.equal(items.length, 2)
  assert.equal(items[0].action, 'encode')
  assert.equal(items[0].parts, 1)
  assert.equal(items[1].action, 'split')
  assert.equal(items[1].parts, 2)
  assert.equal(items[1].start, 600)
  assert.ok(Math.abs(items[0].projMB - 3.6) < 1e-9)
})

test('partitionCards keeps a book that fits on one card', () => {
  const items = Array.from({ length: 20 }, () => ({ projMB: 10, parts: 1 }))
  assert.equal(partitionCards(items).length, 1)
})

test('partitionCards splits a 576 MB book into two balanced cards under the limit', () => {
  const items = Array.from({ length: 40 }, (_, i) => ({ projMB: 10 + (i % 5) * 1.6, parts: 1, i }))
  const cards = partitionCards(items)
  assert.equal(cards.length, 2)
  assert.deepEqual(cards.flat().map(it => it.i), items.map(it => it.i))
  for (const c of cards) assert.ok(sum(c, it => it.projMB) <= 500 * 0.97)
})

test('partitionCards respects the 100-track limit', () => {
  const items = Array.from({ length: 150 }, () => ({ projMB: 1, parts: 1 }))
  const cards = partitionCards(items)
  assert.equal(cards.length, 2)
  for (const c of cards) assert.ok(c.length <= 100)
})

test('encodeArgs puts the seek range before the input', () => {
  const a = encodeArgs('/in.m4b', '/out.mp3.partial', opts, [1110.541, 2344.875])
  assert.ok(a.indexOf('-ss') < a.indexOf('-i'))
  assert.equal(a[a.indexOf('-ss') + 1], '1110.541')
  assert.equal(a[a.indexOf('-to') + 1], '2344.875')
  assert.ok(!encodeArgs('/in.mp3', '/o', opts).includes('-ss'))
})
