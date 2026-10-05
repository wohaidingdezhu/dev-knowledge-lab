import 'fake-indexeddb/auto'
import Dexie from 'dexie'
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
  vi.useRealTimers()
  await database.delete()
})

describe('local persistence', () => {
  it('upgrades a v1 database without replacing legacy card content', async () => {
    const name = `legacy-knowledge-${crypto.randomUUID()}`
    const legacy = new Dexie(name)
    legacy
      .version(1)
      .stores({ cards: '&id, updatedAt, *tags', metadata: '&key' })
    const seed = makeSeedCards('2025-01-01T00:00:00.000Z')[0]
    const {
      source: _source,
      html: _html,
      css: _css,
      js: _js,
      revision: _revision,
      ...oldCard
    } = seed
    await legacy.table('cards').add(oldCard)
    legacy.close()
    const upgraded = new KnowledgeDB(name)
    try {
      expect(await upgraded.cards.get(seed.id)).toEqual({
        ...seed,
        source: '',
        html: '',
        css: '',
        js: '',
        revision: 1,
      })
      expect(await upgraded.loadCards()).toHaveLength(1)
    } finally {
      await upgraded.delete()
    }
  })

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
    expect({ ...restored, updatedAt: original.updatedAt }).toEqual({
      ...original,
      revision: original.revision + 1,
    })
    expect(Date.parse(restored.updatedAt)).toBeGreaterThanOrEqual(
      Date.parse(original.updatedAt),
    )
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

  it('keeps bounded history and can restore an older version without losing the current one', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    let current = await database.createCard()
    for (let index = 1; index <= 22; index++) {
      vi.setSystemTime(Date.now() + 11 * 60 * 1000)
      current = await database.saveCard({ ...current, body: `第 ${index} 版` })
    }
    const history = await database.listHistory(current.id)
    expect(history).toHaveLength(20)
    expect(history[0].card.body).toBe('第 21 版')
    expect(history.at(-1)?.card.body).toBe('第 2 版')
    const restored = await database.restoreVersion(
      current.id,
      history.at(-1)!,
      current.revision,
    )
    expect(restored.body).toBe('第 2 版')
    expect(restored.revision).toBe(current.revision + 1)
    expect((await database.listHistory(current.id))[0].card.body).toBe(
      '第 22 版',
    )
    await expect(
      database.restoreVersion(current.id, history[0], current.revision),
    ).rejects.toBeInstanceOf(ConflictError)
  })

  it('does not restore a changed history snapshot that reuses its ID, revision and timestamps', async () => {
    const card = await database.createCard()
    const current = await database.saveCard({ ...card, body: '当前正文' })
    const [old] = await database.listHistory(card.id)
    const snapshot = await database.exportWorkspace()
    const replacement = {
      ...old,
      card: { ...old.card, body: '备份替换的历史正文' },
    }
    await database.replaceWorkspace(
      { ...snapshot, history: [replacement] },
      await database.workspaceMarker(),
    )
    await expect(
      database.restoreVersion(card.id, old, current.revision),
    ).rejects.toThrow(/刷新历史版本/)
    expect(await database.cards.get(card.id)).toEqual(current)
    expect(await database.listHistory(card.id)).toEqual([replacement])
    const restored = await database.restoreVersion(
      card.id,
      replacement,
      current.revision,
    )
    expect(restored.body).toBe(replacement.card.body)
    expect(
      (await database.listHistory(card.id)).some(
        ({ card: version }) => version.body === current.body,
      ),
    ).toBe(true)
  })

  it('rejects history entries with changed recording times or removed snapshots', async () => {
    const card = await database.createCard()
    const current = await database.saveCard({ ...card, body: '保持当前内容' })
    const [old] = await database.listHistory(card.id)
    const replacement = { ...old, recordedAt: '2099-01-01T00:00:00.000Z' }
    await database.history.put(replacement)
    await expect(
      database.restoreVersion(card.id, old, current.revision),
    ).rejects.toThrow(/刷新历史版本/)
    expect(await database.cards.get(card.id)).toEqual(current)
    await database.history.delete(old.id)
    await expect(
      database.restoreVersion(card.id, replacement, current.revision),
    ).rejects.toThrow(/已不存在.*刷新/)
    expect(await database.cards.get(card.id)).toEqual(current)
    expect(await database.listHistory(card.id)).toEqual([])
  })

  it('keeps one snapshot during rapid autosaves and adds one after a long edit or pause', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    let current = await database.createCard()
    for (let index = 1; index <= 3; index++) {
      vi.setSystemTime(Date.now() + 30_000)
      current = await database.saveCard({
        ...current,
        body: `连续修改 ${index}`,
      })
    }
    expect(
      (await database.listHistory(current.id)).map((entry) => entry.card.body),
    ).toEqual([''])

    vi.setSystemTime(Date.now() + 10 * 60 * 1000)
    current = await database.saveCard({ ...current, body: '长时间编辑后' })
    expect(
      (await database.listHistory(current.id)).map((entry) => entry.card.body),
    ).toEqual(['连续修改 3', ''])

    vi.setSystemTime(Date.now() + 6 * 60 * 1000)
    current = await database.saveCard({ ...current, body: '暂停后继续' })
    expect(
      (await database.listHistory(current.id)).map((entry) => entry.card.body),
    ).toEqual(['长时间编辑后', '连续修改 3', ''])
    await database.deleteCard(current)
    expect((await database.listHistory(current.id))[0].card.body).toBe(
      '暂停后继续',
    )
  })

  it('keeps deleted cards in the recycle bin across reopening and restores them once', async () => {
    const original = await database.createCard()
    await database.deleteCard(original)
    database.close()
    await database.open()
    expect((await database.listTrash()).map((entry) => entry.id)).toEqual([
      original.id,
    ])
    const [deleted] = await database.listTrash()
    const restored = await database.restoreDeletedCard(deleted)
    expect(restored.revision).toBe(original.revision + 1)
    expect(await database.listTrash()).toEqual([])
    await expect(database.restoreDeletedCard(deleted)).rejects.toBeInstanceOf(
      ConflictError,
    )
  })

  it('permanently removes a recycled card and its history only when requested', async () => {
    const original = await database.createCard()
    const changed = await database.saveCard({ ...original, body: '历史正文' })
    await database.deleteCard(changed)
    expect(await database.listHistory(original.id)).toHaveLength(2)
    const [deleted] = await database.listTrash()
    await database.purgeDeletedCard(deleted)
    expect(await database.listTrash()).toEqual([])
    expect(await database.listHistory(original.id)).toEqual([])
    await expect(database.restoreDeletedCard(deleted)).rejects.toThrow(/找不到/)
  })

  it('rejects an old recycle-bin selection after another page restores, edits and deletes again', async () => {
    const card = await database.createCard()
    await database.deleteCard(card)
    const [old] = await database.listTrash()
    const other = new KnowledgeDB(database.name)
    try {
      const restored = await other.restoreDeletedCard(old)
      const changed = await other.saveCard({
        ...restored,
        body: '其他页面的新内容',
      })
      await other.deleteCard(changed)
      const [latest] = await other.listTrash()
      const history = await other.listHistory(card.id)
      await expect(database.restoreDeletedCard(old)).rejects.toThrow(
        /刷新回收站/,
      )
      await expect(database.purgeDeletedCard(old)).rejects.toThrow(/刷新回收站/)
      expect(await database.cards.get(card.id)).toBeUndefined()
      expect(await database.listTrash()).toEqual([latest])
      expect(await database.listHistory(card.id)).toEqual(history)
      expect((await database.restoreDeletedCard(latest)).body).toBe(
        changed.body,
      )
    } finally {
      other.close()
    }
  })

  it('checks exact recycled content even when a restored backup reuses revision and timestamps', async () => {
    const card = await database.createCard()
    await database.deleteCard(card)
    const [old] = await database.listTrash()
    const snapshot = await database.exportWorkspace()
    const changed = {
      ...old,
      card: {
        ...old.card,
        body: '备份里的不同正文',
        html: '<script>原文</script>',
      },
    }
    await database.replaceWorkspace(
      { ...snapshot, trash: [changed] },
      await database.workspaceMarker(),
    )
    await expect(database.restoreCard(old.card)).rejects.toThrow(/刷新回收站/)
    await expect(database.restoreDeletedCard(old)).rejects.toThrow(/刷新回收站/)
    await expect(database.purgeDeletedCard(old)).rejects.toThrow(/刷新回收站/)
    expect(await database.listTrash()).toEqual([changed])
    expect(await database.listHistory(card.id)).toEqual(snapshot.history)
    await database.purgeDeletedCard(changed)
    expect(await database.listTrash()).toEqual([])
  })

  it('checks the deletion timestamp even when recycled card content is identical', async () => {
    const card = await database.createCard()
    await database.deleteCard(card)
    const [old] = await database.listTrash()
    const latest = { ...old, deletedAt: '2099-01-01T00:00:00.000Z' }
    await database.trash.put(latest)
    await expect(database.restoreDeletedCard(old)).rejects.toThrow(/刷新回收站/)
    await expect(database.purgeDeletedCard(old)).rejects.toThrow(/刷新回收站/)
    expect(await database.listTrash()).toEqual([latest])
    await database.purgeDeletedCard(latest)
    expect(await database.listTrash()).toEqual([])
  })

  it('rolls back both recycle-bin removal and history when permanent deletion fails', async () => {
    const card = await database.createCard()
    await database.deleteCard(card)
    const [deleted] = await database.listTrash()
    const history = await database.listHistory(card.id)
    const fail = () => {
      throw new Error('模拟历史删除失败')
    }
    database.history.hook('deleting', fail)
    await expect(database.purgeDeletedCard(deleted)).rejects.toThrow(/模拟/)
    database.history.hook('deleting').unsubscribe(fail)
    expect(await database.listTrash()).toEqual([deleted])
    expect(await database.listHistory(card.id)).toEqual(history)
  })

  it('resets demo data together with its history and recycle bin', async () => {
    const first = await database.createCard()
    const saved = await database.saveCard({ ...first, body: '实验修改' })
    await database.deleteCard(saved)
    expect(await database.listTrash()).toHaveLength(1)
    await database.resetExamples()
    expect(await database.cards.count()).toBe(3)
    expect(await database.listTrash()).toEqual([])
    expect(await database.listHistory(first.id)).toEqual([])
  })

  it('rolls back a failed save along with its history snapshot', async () => {
    const card = await database.createCard()
    const fail = () => {
      throw new Error('模拟写入失败')
    }
    database.cards.hook('updating', fail)
    await expect(
      database.saveCard({ ...card, title: '新标题' }),
    ).rejects.toThrow(/模拟/)
    database.cards.hook('updating').unsubscribe(fail)
    expect(await database.listHistory(card.id)).toEqual([])
    expect(await database.cards.get(card.id)).toEqual(card)
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

  it('restores selected backup cards while retaining the replaced version in history', async () => {
    const original = makeSeedCards('2025-01-01T00:00:00.000Z')
    await database.importCards(original, 'skip')
    const changed = await database.saveCard({
      ...original[0],
      body: '当前正文',
    })
    const result = await database.restoreBackupCards(original, {
      [original[0].id]: {
        choice: 'replace',
        expectedRevision: changed.revision,
      },
      [original[1].id]: {
        choice: 'copy',
        expectedRevision: original[1].revision,
      },
      [original[2].id]: {
        choice: 'skip',
        expectedRevision: original[2].revision,
      },
    })
    expect(result).toEqual({ added: 1, replaced: 1, skipped: 1 })
    const restored = (await database.cards.get(original[0].id))!
    expect(restored.body).toBe(original[0].body)
    expect(restored.revision).toBe(changed.revision + 1)
    expect((await database.listHistory(original[0].id))[0].card.body).toBe(
      '当前正文',
    )
    expect(await database.cards.count()).toBe(4)
  })

  it('rejects a changed card and rolls back earlier backup additions', async () => {
    const original = await database.createCard()
    const changed = await database.saveCard({
      ...original,
      body: '另一页面修改',
    })
    const extra = { ...original, id: crypto.randomUUID() }
    await expect(
      database.restoreBackupCards([extra, original], {
        [original.id]: {
          choice: 'replace',
          expectedRevision: original.revision,
        },
      }),
    ).rejects.toBeInstanceOf(ConflictError)
    expect(await database.cards.get(extra.id)).toBeUndefined()
    expect(await database.cards.get(original.id)).toEqual(changed)
    expect(await database.listHistory(original.id)).toHaveLength(1)
  })

  it('removes a recycled entry when its card is brought back from backup', async () => {
    const card = await database.createCard()
    await database.deleteCard(card)
    expect(await database.restoreBackupCards([card], {})).toEqual({
      added: 1,
      skipped: 0,
      replaced: 0,
    })
    expect(await database.listTrash()).toEqual([])
    expect(await database.cards.get(card.id)).toMatchObject({
      id: card.id,
      body: card.body,
      revision: card.revision + 1,
    })
    await expect(
      database.saveCard({ ...card, body: '旧页面写入' }),
    ).rejects.toBeInstanceOf(ConflictError)
  })
})
