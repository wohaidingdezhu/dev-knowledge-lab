import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { strToU8, unzipSync, zipSync } from 'fflate'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { KnowledgeDB } from '../src/lib/db'
import {
  createFullBackupFile,
  parseFullBackupFile,
  validateFullSnapshot,
} from '../src/lib/fullBackup'

let database: KnowledgeDB

beforeEach(() => {
  database = new KnowledgeDB(`full-features-${crypto.randomUUID()}`)
})

afterEach(async () => {
  await database.delete()
})

it('upgrades a v3 workspace while preserving cards, history and trash', async () => {
  const name = `v3-workspace-${crypto.randomUUID()}`
  const legacy = new Dexie(name)
  legacy.version(3).stores({
    cards: '&id, updatedAt, *tags',
    metadata: '&key',
    history: '&id, cardId, recordedAt',
    trash: '&id, deletedAt',
  })
  const [seed, recycled] = await database.loadCards()
  await legacy.table('cards').add(seed)
  await legacy.table('history').add({
    id: crypto.randomUUID(),
    cardId: seed.id,
    card: seed,
    recordedAt: seed.updatedAt,
  })
  await legacy
    .table('metadata')
    .add({ key: 'initialized', value: seed.createdAt })
  await legacy.table('trash').add({
    id: recycled.id,
    card: recycled,
    deletedAt: recycled.updatedAt,
  })
  legacy.close()
  const upgraded = new KnowledgeDB(name)
  try {
    expect(await upgraded.loadCards()).toEqual([seed])
    expect(await upgraded.listHistory(seed.id)).toHaveLength(1)
    expect(await upgraded.listTrash()).toEqual([
      { id: recycled.id, card: recycled, deletedAt: recycled.updatedAt },
    ])
    expect((await upgraded.loadWorkspace()).generation).toBe('initial')
    await upgraded.togglePin(seed.id)
    expect((await upgraded.exportFullSnapshot()).pins).toEqual([seed.id])
  } finally {
    await upgraded.delete()
  }
})

it('duplicates independently, merges tags and preserves the previous version', async () => {
  const original = (await database.loadCards()).find((card) =>
    card.tags.includes('CSS'),
  )!
  const copy = await database.duplicateCard(original.id)
  expect(copy.id).not.toBe(original.id)
  expect(copy.body).toBe(original.body)
  expect(copy.revision).toBe(1)
  const changed = await database.saveCard({ ...copy, title: '我的实验' })
  expect((await database.cards.get(original.id))?.title).toBe(original.title)
  expect((await database.cards.get(changed.id))?.title).toBe('我的实验')

  expect(await database.renameTag('CSS', '布局')).toBe(2)
  const renamed = await database.cards.get(original.id)
  expect(renamed?.tags).toEqual(['布局'])
  expect(renamed?.revision).toBe(original.revision + 1)
  expect((await database.listHistory(original.id))[0].card.tags).toEqual(
    original.tags,
  )
})

it('batch edits selected cards and moves them to the recycle bin together', async () => {
  const cards = await database.loadCards()
  const selection = cards.slice(0, 2).map(({ id, revision }) => ({
    id,
    revision,
  }))
  const generation = (await database.loadWorkspace()).generation
  expect(
    await database.batchTag(selection, 'add', '批量整理', generation),
  ).toBe(2)
  const changed = await database.cards.bulkGet(selection.map(({ id }) => id))
  expect(changed.every((card) => card?.tags.includes('批量整理'))).toBe(true)
  const updatedSelection = changed.map((card) => ({
    id: card!.id,
    revision: card!.revision,
  }))
  expect(await database.batchPin(updatedSelection, true, generation)).toBe(2)
  expect(await database.batchPin(updatedSelection, true, generation)).toBe(0)
  expect(await database.batchPin(updatedSelection, false, generation)).toBe(2)
  expect(await database.batchPin(updatedSelection, true, generation)).toBe(2)
  expect(await database.batchDelete(updatedSelection, generation)).toBe(2)
  expect(await database.cards.count()).toBe(1)
  expect(await database.listTrash()).toHaveLength(2)
  expect((await database.exportFullSnapshot()).pins).toEqual([])
  expect(await database.listHistory(selection[0].id)).toHaveLength(2)
})

it('rolls back a batch tag change if any selected card exceeds the tag limit', async () => {
  const [first, second] = await database.loadCards()
  const full = await database.saveCard({
    ...second,
    tags: Array.from({ length: 24 }, (_, index) => `标签${index}`),
  })
  const generation = (await database.loadWorkspace()).generation
  await expect(
    database.batchTag(
      [
        { id: first.id, revision: first.revision },
        { id: full.id, revision: full.revision },
      ],
      'add',
      '超额标签',
      generation,
    ),
  ).rejects.toThrow(/24 个标签上限/)
  expect(await database.cards.get(first.id)).toEqual(first)
  expect(await database.listHistory(first.id)).toEqual([])
})

it('removes a selected tag without changing unrelated cards', async () => {
  const [first, second] = await database.loadCards()
  const tag = first.tags[0]
  const generation = (await database.loadWorkspace()).generation
  expect(
    await database.batchTag(
      [{ id: first.id, revision: first.revision }],
      'remove',
      tag,
      generation,
    ),
  ).toBe(1)
  const updated = (await database.cards.get(first.id))!
  expect(updated.tags).not.toContain(tag)
  expect(await database.cards.get(second.id)).toEqual(second)
  expect(
    await database.batchTag(
      [{ id: updated.id, revision: updated.revision }],
      'remove',
      tag,
      generation,
    ),
  ).toBe(0)
})

it('keeps only the newest 20 revisions during a bulk tag edit', async () => {
  const [first] = await database.loadCards()
  const current = { ...first, revision: 21 }
  await database.cards.put(current)
  await database.history.bulkAdd(
    Array.from({ length: 20 }, (_, index) => ({
      id: crypto.randomUUID(),
      cardId: first.id,
      card: { ...first, revision: index + 1 },
      recordedAt: first.updatedAt,
    })),
  )
  const generation = (await database.loadWorkspace()).generation
  expect(
    await database.batchTag(
      [{ id: first.id, revision: current.revision }],
      'add',
      '归档',
      generation,
    ),
  ).toBe(1)
  const history = await database.listHistory(first.id)
  expect(history).toHaveLength(20)
  expect(history.map(({ card }) => card.revision)).toEqual(
    Array.from({ length: 20 }, (_, index) => 21 - index),
  )
})

it('rolls back a bulk edit if writing its history fails', async () => {
  const cards = await database.loadCards()
  const selection = cards.slice(0, 2).map(({ id, revision }) => ({
    id,
    revision,
  }))
  const generation = (await database.loadWorkspace()).generation
  const fail = () => {
    throw new Error('历史写入失败')
  }
  database.history.hook('creating', fail)
  try {
    await expect(
      database.batchTag(selection, 'add', '新标签', generation),
    ).rejects.toThrow(/历史写入失败/)
  } finally {
    database.history.hook('creating').unsubscribe(fail)
  }
  expect(await database.cards.bulkGet(selection.map(({ id }) => id))).toEqual(
    cards.slice(0, 2),
  )
  expect(await database.history.count()).toBe(0)
})

it('round-trips cards, history, trash and pins in a verified full archive', async () => {
  const cards = await database.loadCards()
  await database.togglePin(cards[0].id)
  const updated = await database.saveCard({
    ...cards[0],
    title: '已修改的卡片',
  })
  await database.deleteCard(cards[1])
  const snapshot = await database.exportFullSnapshot()
  expect(snapshot.history.length).toBeGreaterThan(0)
  expect(snapshot.trash).toHaveLength(1)
  expect(snapshot.pins).toEqual([cards[0].id])
  expect(snapshot.cards.find((card) => card.id === updated.id)?.title).toBe(
    '已修改的卡片',
  )

  const file = await createFullBackupFile(snapshot)
  const parsed = await parseFullBackupFile(new File([file], 'complete.zip'))
  expect(parsed).toEqual(snapshot)
  const restored = new KnowledgeDB(`full-restore-${crypto.randomUUID()}`)
  try {
    await restored.loadCards()
    await restored.replaceFullSnapshot(parsed, await restored.workspaceMarker())
    expect(await restored.exportFullSnapshot()).toMatchObject({
      cards: snapshot.cards,
      history: snapshot.history,
      trash: snapshot.trash,
      pins: snapshot.pins,
    })
    expect(await restored.getLastBackup()).toBe(snapshot.exportedAt)
  } finally {
    await restored.delete()
  }
})

it('rejects tampering and invalid relations without replacing existing data', async () => {
  const cards = await database.loadCards()
  const snapshot = await database.exportFullSnapshot()
  const archive = await createFullBackupFile(snapshot)
  const files = unzipSync(new Uint8Array(await archive.arrayBuffer()))
  const broken = zipSync({ ...files, 'snapshot.json': strToU8('{}') })
  await expect(
    parseFullBackupFile(new File([broken], 'broken.zip')),
  ).rejects.toThrow(/校验失败/)
  await expect(
    database.replaceFullSnapshot(
      { ...snapshot, pins: ['missing-id'] },
      await database.workspaceMarker(),
    ),
  ).rejects.toThrow(/置顶/)
  expect(await database.loadCards()).toEqual(cards)
  expect(() =>
    validateFullSnapshot({
      ...snapshot,
      trash: [
        { id: cards[0].id, card: cards[0], deletedAt: snapshot.exportedAt },
      ],
    }),
  ).toThrow(/冲突/)
})

it('rejects stale edits and deletion after another tab restores the workspace', async () => {
  const [card] = await database.loadCards()
  const generation = (await database.loadWorkspace()).generation
  const snapshot = await database.exportFullSnapshot()
  await database.saveCard({ ...card, title: '恢复前的更改' })
  await database.replaceFullSnapshot(snapshot, await database.workspaceMarker())

  await expect(
    database.saveCard({ ...card, title: '旧页面的草稿' }, generation),
  ).rejects.toThrow(/工作区已在其他页面恢复或重置/)
  await expect(database.deleteCard(card, generation)).rejects.toThrow(
    /工作区已在其他页面恢复或重置/,
  )
  expect(await database.cards.get(card.id)).toEqual(card)
  expect((await database.loadWorkspace()).generation).not.toBe(generation)
})

it('stops a full restore when cards or pins change after preview', async () => {
  const [card] = await database.loadCards()
  const snapshot = await database.exportFullSnapshot()
  const beforePin = await database.workspaceMarker()
  await database.togglePin(card.id)
  await expect(
    database.replaceFullSnapshot(snapshot, beforePin),
  ).rejects.toThrow(/重新选择备份文件/)
  expect((await database.exportFullSnapshot()).pins).toEqual([card.id])

  const beforeEdit = await database.workspaceMarker()
  const updated = await database.saveCard({
    ...card,
    title: '其他页面的新修改',
  })
  await expect(
    database.replaceFullSnapshot(snapshot, beforeEdit),
  ).rejects.toThrow(/重新选择备份文件/)
  expect(await database.cards.get(card.id)).toEqual(updated)
})

it('rolls back all workspace tables when full restoration fails halfway', async () => {
  const cards = await database.loadCards()
  await database.deleteCard(cards[0])
  const snapshot = await database.exportFullSnapshot()
  const newCard = await database.createCard()
  await database.togglePin(newCard.id)
  const before = await database.exportFullSnapshot()
  const fail = () => {
    throw new Error('模拟恢复写入失败')
  }
  database.trash.hook('creating', fail)
  await expect(
    database.replaceFullSnapshot(snapshot, await database.workspaceMarker()),
  ).rejects.toThrow(/模拟恢复写入失败/)
  database.trash.hook('creating').unsubscribe(fail)
  expect(await database.exportFullSnapshot()).toMatchObject({
    cards: before.cards,
    history: before.history,
    trash: before.trash,
    pins: before.pins,
  })
})
