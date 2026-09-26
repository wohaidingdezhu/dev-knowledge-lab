import { performance } from 'node:perf_hooks'
import { searchCards } from '../src/lib/search.ts'

const repetitions = Number(process.env.REPETITIONS || 30)
const sizes = [100, 1000, 5000]
const word = 'browser-cache-needle'

function cardsOf(size) {
  const now = '2026-01-01T00:00:00.000Z'
  return Array.from({ length: size }, (_, index) => {
    const length = [300, 2000, 8000][index % 3]
    const body = `${'Markdown text and notes. '.repeat(Math.ceil(length / 25)).slice(0, length)}${index % 10 === 0 ? word : ''}`
    return {
      id: String(index),
      title: `Card ${index}`,
      body,
      tags: [index % 5 === 0 ? 'browser' : 'javascript'],
      source: '',
      html: '',
      css: '',
      js: index % 7 === 0 ? 'console.log("search")' : '',
      createdAt: now,
      updatedAt: now,
      revision: 1,
    }
  })
}

function measure(cards, query) {
  for (let index = 0; index < 5; index++) searchCards(cards, query, null)
  const durations = []
  let matches = 0
  for (let index = 0; index < repetitions; index++) {
    const start = performance.now()
    matches = searchCards(cards, query, null).length
    durations.push(performance.now() - start)
  }
  durations.sort((left, right) => left - right)
  return {
    matches,
    medianMs: Number(durations[Math.floor(durations.length / 2)].toFixed(2)),
    p95Ms: Number(durations[Math.ceil(durations.length * 0.95) - 1].toFixed(2)),
  }
}

console.log(
  JSON.stringify(
    {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      repetitions,
      sizes,
    },
    null,
    2,
  ),
)
for (const size of sizes) {
  const cards = cardsOf(size)
  global.gc?.()
  const memoryMiB = Number(
    (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1),
  )
  console.log(
    JSON.stringify({
      cards: size,
      memoryMiB,
      query: word,
      ...measure(cards, word),
    }),
  )
  console.log(
    JSON.stringify({
      cards: size,
      memoryMiB,
      query: '',
      ...measure(cards, ''),
    }),
  )
}
