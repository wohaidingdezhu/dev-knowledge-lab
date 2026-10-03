import { performance } from 'node:perf_hooks'
import assert from 'node:assert/strict'
import { summarizeCards } from '../src/lib/cardSummary.ts'

const repetitions = Number(process.env.REPETITIONS || 30)
const size = 5000
const tagCount = 500
const now = '2026-01-01T00:00:00.000Z'
const cards = Array.from({ length: size }, (_, index) => ({
  id: String(index),
  title: `Card ${index}`,
  body: 'A short knowledge card.',
  tags: Array.from(
    { length: 4 },
    (_, offset) => `tag-${(index + offset * 31) % tagCount}`,
  ),
  source: '',
  html: '',
  css: '',
  js: index % 7 === 0 ? 'console.log("example")' : '',
  createdAt: now,
  updatedAt: now,
  revision: 1,
}))

function previousSummary(records) {
  const tags = [...new Set(records.flatMap((card) => card.tags))].sort((a, b) =>
    a.localeCompare(b),
  )
  const tagCounts = new Map(
    tags.map((tag) => [
      tag,
      records.filter((card) => card.tags.includes(tag)).length,
    ]),
  )
  const codeCards = records.filter((card) =>
    Boolean(card.html.trim() || card.css.trim() || card.js.trim()),
  )
  return { tags, tagCounts, codeCards }
}

function measure(summarize) {
  for (let index = 0; index < 5; index++) summarize(cards)
  const durations = []
  let result
  for (let index = 0; index < repetitions; index++) {
    const start = performance.now()
    result = summarize(cards)
    durations.push(performance.now() - start)
  }
  durations.sort((left, right) => left - right)
  return {
    codeCards: result.codeCards.length,
    tagAssignments: [...result.tagCounts.values()].reduce(
      (total, count) => total + count,
      0,
    ),
    medianMs: Number(durations[Math.floor(durations.length / 2)].toFixed(2)),
    p95Ms: Number(durations[Math.ceil(durations.length * 0.95) - 1].toFixed(2)),
  }
}

console.log(
  JSON.stringify({
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    repetitions,
    cards: size,
    tags: tagCount,
  }),
)
const previous = previousSummary(cards)
const current = summarizeCards(cards)
assert.deepEqual(current.tags, previous.tags)
assert.deepEqual(current.tagCounts, previous.tagCounts)
assert.deepEqual(current.codeCards, previous.codeCards)
console.log(
  JSON.stringify({ implementation: 'previous', ...measure(previousSummary) }),
)
console.log(
  JSON.stringify({ implementation: 'single-pass', ...measure(summarizeCards) }),
)
