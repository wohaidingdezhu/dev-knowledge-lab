import 'fake-indexeddb/auto'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { validateCards } from '../src/lib/backup'
import { KnowledgeDB } from '../src/lib/db'
import {
  KNOWLEDGE_PACK_SIZE,
  makeKnowledgePackCards,
} from '../src/lib/knowledgePack'

let database: KnowledgeDB

beforeEach(() => {
  database = new KnowledgeDB(`knowledge-pack-${crypto.randomUUID()}`)
})

afterEach(async () => {
  await database.delete()
})

it('provides twenty-two complete, valid lessons with stable unique IDs', () => {
  const cards = makeKnowledgePackCards('2026-09-25T00:00:00.000Z')
  expect(cards).toHaveLength(22)
  expect(KNOWLEDGE_PACK_SIZE).toBe(22)
  expect(new Set(cards.map((card) => card.id)).size).toBe(cards.length)
  expect(validateCards(cards)).toEqual(cards)
  for (const card of cards) {
    expect(card.body.length).toBeGreaterThan(150)
    expect(card.html).toContain('<')
    expect(card.css.length).toBeGreaterThan(30)
    expect(card.js.length).toBeGreaterThan(20)
    expect(card.source).toMatch(/^https:\/\/developer\.mozilla\.org\//)
    expect(() => new Function(card.js)).not.toThrow()
  }
})

it('adds missing lessons explicitly and preserves edited lessons on repeat import', async () => {
  expect(await database.loadCards()).toHaveLength(3)
  const pack = makeKnowledgePackCards('2026-09-25T00:00:00.000Z')
  expect(await database.importCards(pack, 'skip')).toEqual({
    added: 22,
    skipped: 0,
  })
  const changed = await database.saveCard({
    ...pack[0],
    title: '我的闭包笔记',
  })
  expect(await database.importCards(pack, 'skip')).toEqual({
    added: 0,
    skipped: 22,
  })
  expect(await database.cards.get(changed.id)).toEqual(changed)
  expect(await database.loadCards()).toHaveLength(25)
})

it('upgrades the original ten-lesson pack without overwriting personal changes', async () => {
  await database.loadCards()
  const pack = makeKnowledgePackCards('2026-10-07T00:00:00.000Z')
  await database.importCards(pack.slice(0, 10), 'skip')
  const edited = await database.saveCard({ ...pack[0], body: '我的学习记录' })
  expect(await database.importCards(pack, 'skip')).toEqual({
    added: 12,
    skipped: 10,
  })
  expect(await database.cards.get(edited.id)).toEqual(edited)
  expect(await database.loadCards()).toHaveLength(25)
})
