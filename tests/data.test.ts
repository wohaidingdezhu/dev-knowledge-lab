import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConflictError, KnowledgeDB } from '../src/lib/db'
import { makeSeedCards } from '../src/lib/seeds'
import { parseBackup, serializeBackup } from '../src/lib/backup'

let database: KnowledgeDB

beforeEach(() => {
  database = new KnowledgeDB(`knowledge-test-${crypto.randomUUID()}`)
})

afterEach(async () => {
  vi.restoreAllMocks()
  await database.delete()
})

describe('local persistence', () => {
  it('seeds once, including when every example has been deleted', async () => {
    expect(await database.loadCards()).toHaveLength(3)
    expect(await database.loadCards()).toHaveLength(3)
    await database.cards.clear()
    expect(await database.loadCards()).toEqual([])
  })

  it('seeds atomically across two simultaneous tabs', async () => {
    const secondTab = new KnowledgeDB(database.name)
    try {
      const [first, second] = await Promise.all([
        database.loadCards(),
        secondTab.loadCards(),
      ])
      expect(first).toHaveLength(3)
      expect(second).toHaveLength(3)
      expect(await database.cards.count()).toBe(3)
    } finally {
      secondTab.close()
    }
  })

  it('does not seed over an existing unmarked database', async () => {
    const card = await database.createCard()
    expect(await database.loadCards()).toEqual([card])
  })

  it('saves all fields and recovers the same record after reopening', async () => {
    const card = await database.createCard(true)
    expect(card.body).toContain('## 现象')
    const saved = await database.saveCard({
      ...card,
      title: '持久化验证',
      tags: ['测试'],
      source: 'https://example.com',
      html: '<p>hello</p>',
      css: 'p{color:red}',
      js: 'console.log(42)',
    })
    expect(saved.revision).toBe(2)
    database.close()
    await database.open()
    expect(await database.cards.get(card.id)).toEqual(saved)
  })

  it('rejects stale saves from another tab without overwriting the latest data', async () => {
    const original = await database.createCard()
    const secondTab = new KnowledgeDB(database.name)
    try {
      const latest = await secondTab.saveCard({
        ...original,
        title: '另一个页面的新内容',
      })
      await expect(
        database.saveCard({ ...original, title: '过期内容' }),
      ).rejects.toMatchObject({ name: 'ConflictError', latest })
      expect(await database.cards.get(original.id)).toEqual(latest)
      await expect(database.deleteCard(original)).rejects.toBeInstanceOf(
        ConflictError,
      )
      expect(await database.cards.count()).toBe(1)
    } finally {
      secondTab.close()
    }
  })

  it('allows exactly one of two simultaneous saves with the same revision', async () => {
    const original = await database.createCard()
    const secondTab = new KnowledgeDB(database.name)
    try {
      const results = await Promise.allSettled([
        database.saveCard({ ...original, title: '页面一' }),
        secondTab.saveCard({ ...original, title: '页面二' }),
      ])
      expect(
        results.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1)
      expect(
        results.filter((result) => result.status === 'rejected'),
      ).toHaveLength(1)
      expect((await database.cards.get(original.id))?.revision).toBe(2)
    } finally {
      secondTab.close()
    }
  })

  it('does not resurrect a deleted card from a stale save, and supports safe undo', async () => {
    const original = await database.createCard()
    await database.deleteCard(original)
    await expect(database.saveCard(original)).rejects.toMatchObject({
      name: 'ConflictError',
      latest: null,
    })
    const restored = await database.restoreCard(original)
    expect(restored).toEqual({ ...original, revision: original.revision + 1 })
    await expect(database.saveCard(original)).rejects.toBeInstanceOf(
      ConflictError,
    )
    await expect(database.restoreCard(original)).rejects.toBeInstanceOf(
      ConflictError,
    )
    expect(await database.cards.count()).toBe(1)
  })

  it('surfaces storage errors and keeps the previously persisted record', async () => {
    const original = await database.createCard()
    const failure = new DOMException(
      'Storage quota exceeded',
      'QuotaExceededError',
    )
    const failingHook = () => {
      throw failure
    }
    database.cards.hook('updating', failingHook)
    await expect(
      database.saveCard({ ...original, body: '尚未保存的内容' }),
    ).rejects.toThrow('Storage quota exceeded')
    database.cards.hook('updating').unsubscribe(failingHook)
    expect(await database.cards.get(original.id)).toEqual(original)
    expect(
      (await database.saveCard({ ...original, body: '重试成功' })).revision,
    ).toBe(2)
  })

  it('never reports a new card saved if its initial storage write fails', async () => {
    const failingHook = () => {
      throw new DOMException('Storage unavailable', 'UnknownError')
    }
    database.cards.hook('creating', failingHook)
    await expect(database.createCard()).rejects.toThrow('Storage unavailable')
    database.cards.hook('creating').unsubscribe(failingHook)
    expect(await database.cards.count()).toBe(0)
  })
})

describe('atomic backup import', () => {
  it('imports complete records with their original timestamps and content', async () => {
    const incoming = makeSeedCards('2025-01-01T00:00:00.000Z')
    const result = await database.importCards(
      parseBackup(serializeBackup(incoming)),
      'skip',
    )
    expect(result).toEqual({ added: 3, skipped: 0 })
    expect(await database.cards.toArray()).toEqual(
      [...incoming].sort((a, b) => a.id.localeCompare(b.id)),
    )
    expect(await database.loadCards()).toHaveLength(3)
  })

  it('skips or copies conflicting IDs without replacing existing content', async () => {
    const incoming = makeSeedCards('2025-01-01T00:00:00.000Z')
    await database.importCards(incoming, 'skip')
    const changed = [{ ...incoming[0], title: '导入版本' }]
    expect(await database.importCards(changed, 'skip')).toEqual({
      added: 0,
      skipped: 1,
    })
    expect(await database.cards.get(incoming[0].id)).toEqual(incoming[0])
    expect(await database.importCards(changed, 'copy')).toEqual({
      added: 1,
      skipped: 0,
    })
    const copy = (await database.cards.toArray()).find(
      (card) => card.title === '导入版本',
    )!
    expect(copy.id).not.toBe(incoming[0].id)
    expect({ ...copy, id: changed[0].id }).toEqual(changed[0])
  })

  it('rolls back the complete import if a later write fails', async () => {
    const incoming = makeSeedCards('2025-01-01T00:00:00.000Z')
    let calls = 0
    const failSecond = () => {
      if (++calls === 2)
        throw new DOMException(
          'No room for the next record',
          'QuotaExceededError',
        )
    }
    database.cards.hook('creating', failSecond)
    await expect(database.importCards(incoming, 'skip')).rejects.toThrow(
      'No room',
    )
    database.cards.hook('creating').unsubscribe(failSecond)
    expect(await database.cards.count()).toBe(0)
    expect(await database.metadata.get('initialized')).toBeUndefined()
  })

  it('marks an empty import initialized and never repopulates examples', async () => {
    await database.importCards([], 'skip')
    expect(await database.loadCards()).toEqual([])
  })

  it('validates the entire batch before making any changes', async () => {
    const incoming = makeSeedCards()
    incoming[2].source = 'javascript:alert(1)'
    await expect(database.importCards(incoming, 'skip')).rejects.toThrow(
      /来源链接/,
    )
    expect(await database.cards.count()).toBe(0)
  })
})
