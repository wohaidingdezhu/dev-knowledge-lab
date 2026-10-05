import Dexie, { type Table } from 'dexie'
import { BACKUP_LIMITS, validateCards } from './backup'
import { validateWorkspace } from './workspaceBackup'
import { validateFullSnapshot } from './fullBackup'

import { makeSeedCards, PITFALL_TEMPLATE } from './seeds'
import type {
  Card,
  CardHistoryEntry,
  DeletedCard,
  FullSnapshot,
  ImportResult,
  ImportStrategy,
  RestoreDecision,
  RestoreResult,
  WorkspaceData,
} from './types'

const HISTORY_LIMIT = 20
const HISTORY_INTERVAL_MS = 10 * 60 * 1000
const EDITING_PAUSE_MS = 5 * 60 * 1000
const sameCard = (current: Card, expected: Card) =>
  (
    [
      'id',
      'title',
      'body',
      'source',
      'html',
      'css',
      'js',
      'createdAt',
      'updatedAt',
      'revision',
    ] as const
  ).every((field) => current[field] === expected[field]) &&
  current.tags.length === expected.tags.length &&
  current.tags.every((tag, index) => tag === expected.tags[index])
const trashChanged = () =>
  new ConflictError(
    null,
    '回收站内容已在其他页面变化，请刷新回收站后重新选择。',
  )
const nextUpdatedAt = (card: Card) =>
  new Date(
    Math.max(
      Date.now(),
      Date.parse(card.updatedAt),
      Date.parse(card.createdAt),
    ),
  ).toISOString()
const revivedFromBackup = (card: Card, deleted?: DeletedCard): Card => {
  if (!deleted) return card
  const revision = Math.max(card.revision, deleted.card.revision)
  if (revision === Number.MAX_SAFE_INTEGER)
    throw new Error('记录版本号已达到上限，请先另存副本。')
  return {
    ...card,
    revision: revision + 1,
    updatedAt: new Date(
      Math.max(
        Date.now(),
        Date.parse(card.updatedAt),
        Date.parse(deleted.card.updatedAt),
      ),
    ).toISOString(),
  }
}

interface Metadata {
  key: string
  value: string
}

const workspaceMarker = (
  { cards, history, trash }: WorkspaceData,
  pins: string[],
) =>
  JSON.stringify({
    cards: cards
      .map(({ id, revision, updatedAt }) => [id, revision, updatedAt])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    history: history
      .map(({ id, cardId, recordedAt }) => [id, cardId, recordedAt])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    trash: trash
      .map(({ id, deletedAt, card }) => [id, deletedAt, card.revision])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    pins: [...pins].sort(),
  })
interface WorkspaceState {
  cards: Card[]
  generation: string
}

export interface CardSelection {
  id: string
  revision: number
}

function selectionIds(selection: CardSelection[]): string[] {
  if (
    !selection.length ||
    selection.length > 5000 ||
    selection.some(
      ({ id, revision }) =>
        typeof id !== 'string' ||
        !id ||
        !Number.isSafeInteger(revision) ||
        revision < 1,
    )
  )
    throw new Error('请选择 1 至 5000 张有效卡片。')
  const ids = selection.map(({ id }) => id)
  if (new Set(ids).size !== ids.length)
    throw new Error('批量选择中出现重复卡片。')
  return ids
}

export class ConflictError extends Error {
  readonly latest: Card | null

  constructor(
    latest: Card | null,
    message = latest
      ? '这张卡片已在其他页面更新。请保留当前内容，再载入最新版本。'
      : '这张卡片已被删除。当前修改尚未保存，请先复制内容。',
  ) {
    super(message)
    this.name = 'ConflictError'
    this.latest = latest
  }
}

export class KnowledgeDB extends Dexie {
  cards!: Table<Card, string>
  metadata!: Table<Metadata, string>
  history!: Table<CardHistoryEntry, string>
  trash!: Table<DeletedCard, string>
  pins!: Table<{ id: string }, string>

  constructor(name = 'dev-knowledge-lab') {
    super(name)
    this.version(1).stores({ cards: '&id, updatedAt, *tags', metadata: '&key' })
    this.version(2)
      .stores({ cards: '&id, updatedAt, *tags', metadata: '&key' })
      .upgrade(async (transaction) => {
        await transaction
          .table<Card, string>('cards')
          .toCollection()
          .modify((card) => {
            card.tags ??= []
            card.source ??= ''
            card.html ??= ''
            card.css ??= ''
            card.js ??= ''
            card.revision ??= 1
          })
      })
    this.version(3).stores({
      cards: '&id, updatedAt, *tags',
      metadata: '&key',
      history: '&id, cardId, recordedAt',
      trash: '&id, deletedAt',
    })
    this.version(4).stores({
      cards: '&id, updatedAt, *tags',
      metadata: '&key',
      history: '&id, cardId, recordedAt',
      trash: '&id, deletedAt',
      pins: '&id',
    })
  }

  private async remember(card: Card, autosave = false): Promise<void> {
    const entries = await this.history
      .where('cardId')
      .equals(card.id)
      .sortBy('recordedAt')
    entries.sort((left, right) => left.card.revision - right.card.revision)
    const latest = entries.at(-1)
    if (
      autosave &&
      latest &&
      Date.now() - Date.parse(latest.recordedAt) < HISTORY_INTERVAL_MS &&
      Date.now() - Date.parse(card.updatedAt) < EDITING_PAUSE_MS
    )
      return
    if (entries.length >= HISTORY_LIMIT)
      await this.history.bulkDelete(
        entries
          .slice(0, entries.length - HISTORY_LIMIT + 1)
          .map((entry) => entry.id),
      )
    await this.history.add({
      id: crypto.randomUUID(),
      cardId: card.id,
      card: structuredClone(card),
      recordedAt: new Date().toISOString(),
    })
  }

  private async rememberMany(cards: Card[]): Promise<void> {
    if (!cards.length) return
    const grouped = new Map<string, CardHistoryEntry[]>()
    for (let start = 0; start < cards.length; start += 500) {
      const ids = cards.slice(start, start + 500).map(({ id }) => id)
      const entries = await this.history.where('cardId').anyOf(ids).toArray()
      for (const entry of entries) {
        const group = grouped.get(entry.cardId) ?? []
        group.push(entry)
        grouped.set(entry.cardId, group)
      }
    }
    const removeIds: string[] = []
    const additions: CardHistoryEntry[] = []
    const recordedAt = new Date().toISOString()
    for (const card of cards) {
      const entries = grouped.get(card.id) ?? []
      entries.sort((left, right) => left.card.revision - right.card.revision)
      if (entries.length >= HISTORY_LIMIT)
        removeIds.push(
          ...entries
            .slice(0, entries.length - HISTORY_LIMIT + 1)
            .map(({ id }) => id),
        )
      additions.push({
        id: crypto.randomUUID(),
        cardId: card.id,
        card: structuredClone(card),
        recordedAt,
      })
    }
    if (removeIds.length) await this.history.bulkDelete(removeIds)
    await this.history.bulkAdd(additions)
  }

  async listHistory(cardId: string): Promise<CardHistoryEntry[]> {
    return (await this.history.where('cardId').equals(cardId).toArray()).sort(
      (left, right) => right.card.revision - left.card.revision,
    )
  }

  async listTrash(): Promise<DeletedCard[]> {
    return this.trash.orderBy('deletedAt').reverse().toArray()
  }

  async exportWorkspace(): Promise<WorkspaceData> {
    return this.transaction(
      'r',
      this.cards,
      this.history,
      this.trash,
      async () => ({
        cards: await this.cards.toArray(),
        history: await this.history.toArray(),
        trash: await this.trash.toArray(),
      }),
    )
  }

  async workspaceMarker(): Promise<string> {
    return this.transaction(
      'r',
      this.cards,
      this.history,
      this.trash,
      this.pins,
      async () =>
        workspaceMarker(
          {
            cards: await this.cards.toArray(),
            history: await this.history.toArray(),
            trash: await this.trash.toArray(),
          },
          (await this.pins.toArray()).map(({ id }) => id),
        ),
    )
  }

  async getLastBackup(): Promise<string | null> {
    return (await this.metadata.get('lastBackup'))?.value ?? null
  }

  async readWorkspace(): Promise<WorkspaceState> {
    return this.transaction('r', this.cards, this.metadata, async () => ({
      cards: await this.cards.orderBy('updatedAt').reverse().toArray(),
      generation:
        (await this.metadata.get('workspaceGeneration'))?.value ?? 'initial',
    }))
  }

  async recordBackup(date = new Date().toISOString()): Promise<void> {
    await this.metadata.put({ key: 'lastBackup', value: date })
  }

  async togglePin(id: string): Promise<boolean> {
    return this.transaction('rw', this.cards, this.pins, async () => {
      if (!(await this.cards.get(id))) throw new Error('卡片已不存在。')
      if (await this.pins.get(id)) {
        await this.pins.delete(id)
        return false
      }
      await this.pins.add({ id })
      return true
    })
  }

  private async assertWorkspaceGeneration(generation: string): Promise<void> {
    const current =
      (await this.metadata.get('workspaceGeneration'))?.value ?? 'initial'
    if (current !== generation)
      throw new Error('工作区已在其他页面恢复或重置，请刷新后重新选择卡片。')
  }

  private async selectedCards(selection: CardSelection[]): Promise<Card[]> {
    const current = await this.cards.bulkGet(selectionIds(selection))
    return current.map((card, index) => {
      if (!card || card.revision !== selection[index].revision)
        throw new ConflictError(
          card ?? null,
          '有卡片已在其他页面修改，请刷新后重新选择。',
        )
      return card
    })
  }

  async batchTag(
    selection: CardSelection[],
    action: 'add' | 'remove',
    value: string,
    generation: string,
  ): Promise<number> {
    const tag = value.trim()
    if (
      (action !== 'add' && action !== 'remove') ||
      !tag ||
      tag.length > BACKUP_LIMITS.tag
    )
      throw new Error('请选择有效操作和不超过 48 字的标签。')
    return this.transaction(
      'rw',
      this.cards,
      this.history,
      this.metadata,
      async () => {
        await this.assertWorkspaceGeneration(generation)
        const cards = await this.selectedCards(selection)
        const changed: Card[] = []
        const updated: Card[] = []
        for (const card of cards) {
          const hasTag = card.tags.includes(tag)
          if ((action === 'add' && hasTag) || (action === 'remove' && !hasTag))
            continue
          if (card.revision === Number.MAX_SAFE_INTEGER)
            throw new Error('有卡片的版本号已达到上限。')
          if (action === 'add' && card.tags.length >= BACKUP_LIMITS.tags)
            throw new Error(
              `「${card.title || '未命名卡片'}」已达到 24 个标签上限。`,
            )
          changed.push(card)
          updated.push({
            ...card,
            tags:
              action === 'add'
                ? [...card.tags, tag]
                : card.tags.filter((item) => item !== tag),
            revision: card.revision + 1,
            updatedAt: nextUpdatedAt(card),
          })
        }
        await this.rememberMany(changed)
        if (updated.length) await this.cards.bulkPut(updated)
        return changed.length
      },
    )
  }

  async batchPin(
    selection: CardSelection[],
    pin: boolean,
    generation: string,
  ): Promise<number> {
    return this.transaction(
      'rw',
      this.cards,
      this.pins,
      this.metadata,
      async () => {
        await this.assertWorkspaceGeneration(generation)
        const cards = await this.selectedCards(selection)
        const existing = await this.pins.bulkGet(cards.map(({ id }) => id))
        const changed = cards.filter(
          (_, index) => Boolean(existing[index]) !== pin,
        )
        if (pin) await this.pins.bulkPut(changed.map(({ id }) => ({ id })))
        else await this.pins.bulkDelete(changed.map(({ id }) => id))
        return changed.length
      },
    )
  }

  async batchDelete(
    selection: CardSelection[],
    generation: string,
  ): Promise<number> {
    return this.transaction(
      'rw',
      this.cards,
      this.history,
      this.trash,
      this.pins,
      this.metadata,
      async () => {
        await this.assertWorkspaceGeneration(generation)
        const cards = await this.selectedCards(selection)
        const deletedAt = new Date().toISOString()
        await this.rememberMany(cards)
        await this.trash.bulkPut(
          cards.map((card) => ({
            id: card.id,
            card: structuredClone(card),
            deletedAt,
          })),
        )
        const ids = cards.map(({ id }) => id)
        await this.cards.bulkDelete(ids)
        await this.pins.bulkDelete(ids)
        return ids.length
      },
    )
  }

  async duplicateCard(id: string): Promise<Card> {
    return this.transaction('rw', this.cards, async () => {
      const current = await this.cards.get(id)
      if (!current) throw new Error('卡片已不存在。')
      const now = new Date().toISOString()
      const copy: Card = {
        ...structuredClone(current),
        id: crypto.randomUUID(),
        title: `${(current.title || '未命名卡片').slice(0, 195)}（副本）`,
        createdAt: now,
        updatedAt: now,
        revision: 1,
      }
      await this.cards.add(copy)
      return copy
    })
  }

  async renameTag(from: string, to: string): Promise<number> {
    const next = to.trim()
    if (!from || !next || next.length > 48 || from === next)
      throw new Error('请选择不同且不超过 48 字的目标标签。')
    return this.transaction('rw', this.cards, this.history, async () => {
      const affected = await this.cards.where('tags').equals(from).toArray()
      const updated = affected.map((card) => {
        if (card.revision === Number.MAX_SAFE_INTEGER)
          throw new Error('有卡片的版本号已达到上限。')
        const tags = [
          ...new Set(card.tags.map((tag) => (tag === from ? next : tag))),
        ]
        return {
          ...card,
          tags,
          revision: card.revision + 1,
          updatedAt: nextUpdatedAt(card),
        }
      })
      await this.rememberMany(affected)
      if (updated.length) await this.cards.bulkPut(updated)
      return affected.length
    })
  }

  async exportFullSnapshot(): Promise<FullSnapshot> {
    return this.transaction(
      'r',
      this.cards,
      this.history,
      this.trash,
      this.pins,
      async () => ({
        format: 'pianduan-full-snapshot',
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        cards: await this.cards.toArray(),
        history: await this.history.toArray(),
        trash: await this.trash.toArray(),
        pins: (await this.pins.toArray()).map(({ id }) => id),
      }),
    )
  }

  async replaceWorkspace(
    data: WorkspaceData,
    expectedMarker: string,
  ): Promise<void> {
    const incoming = validateWorkspace(data)
    await this.transaction(
      'rw',
      this.cards,
      this.history,
      this.trash,
      this.pins,
      this.metadata,
      async () => {
        const current: WorkspaceData = {
          cards: await this.cards.toArray(),
          history: await this.history.toArray(),
          trash: await this.trash.toArray(),
        }
        const currentPins = (await this.pins.toArray()).map(({ id }) => id)
        if (workspaceMarker(current, currentPins) !== expectedMarker)
          throw new Error('本地数据已在其他页面变化，请重新选择备份文件。')
        await this.cards.clear()
        await this.history.clear()
        await this.trash.clear()
        await this.pins.clear()
        if (incoming.cards.length) await this.cards.bulkAdd(incoming.cards)
        if (incoming.history.length)
          await this.history.bulkAdd(incoming.history)
        if (incoming.trash.length) await this.trash.bulkAdd(incoming.trash)
        await this.metadata.put({
          key: 'initialized',
          value: new Date().toISOString(),
        })
        await this.metadata.put({
          key: 'workspaceGeneration',
          value: crypto.randomUUID(),
        })
      },
    )
  }

  async replaceFullSnapshot(
    snapshot: FullSnapshot,
    expectedMarker: string,
  ): Promise<void> {
    const checked = validateFullSnapshot(snapshot)

    await this.transaction(
      'rw',
      this.cards,
      this.history,
      this.trash,
      this.pins,
      this.metadata,
      async () => {
        const current: WorkspaceData = {
          cards: await this.cards.toArray(),
          history: await this.history.toArray(),
          trash: await this.trash.toArray(),
        }
        const currentPins = (await this.pins.toArray()).map(({ id }) => id)
        if (workspaceMarker(current, currentPins) !== expectedMarker)
          throw new Error('本地数据已在其他页面变化，请重新选择备份文件。')
        await this.cards.clear()
        await this.history.clear()
        await this.trash.clear()
        await this.pins.clear()
        if (checked.cards.length) await this.cards.bulkAdd(checked.cards)
        if (checked.history.length) await this.history.bulkAdd(checked.history)
        if (checked.trash.length) await this.trash.bulkAdd(checked.trash)
        if (checked.pins.length)
          await this.pins.bulkAdd(checked.pins.map((id) => ({ id })))

        await this.metadata.put({
          key: 'initialized',
          value: new Date().toISOString(),
        })
        await this.metadata.put({
          key: 'lastBackup',
          value: checked.exportedAt,
        })
        await this.metadata.put({
          key: 'workspaceGeneration',
          value: crypto.randomUUID(),
        })
      },
    )
  }

  async loadWorkspace(): Promise<WorkspaceState> {
    return this.transaction('rw', this.cards, this.metadata, async () => {
      const initialized = await this.metadata.get('initialized')
      if (!initialized) {
        // An older database without the marker must never have its content replaced.
        if ((await this.cards.count()) === 0)
          await this.cards.bulkAdd(makeSeedCards())
        await this.metadata.put({
          key: 'initialized',
          value: new Date().toISOString(),
        })
      }
      return {
        cards: await this.cards.orderBy('updatedAt').reverse().toArray(),
        generation:
          (await this.metadata.get('workspaceGeneration'))?.value ?? 'initial',
      }
    })
  }

  async loadCards(): Promise<Card[]> {
    return (await this.loadWorkspace()).cards
  }

  async createCard(template = false): Promise<Card> {
    const now = new Date().toISOString()
    const card: Card = {
      id: crypto.randomUUID(),
      title: template ? '一次踩坑记录' : '未命名卡片',
      body: template ? PITFALL_TEMPLATE : '',
      tags: [],
      source: '',
      html: '',
      css: '',
      js: '',
      createdAt: now,
      updatedAt: now,
      revision: 1,
    }
    await this.cards.add(card)
    return card
  }

  async saveCard(card: Card, generation?: string): Promise<Card> {
    const [validated] = validateCards([card])
    return this.transaction(
      'rw',
      this.cards,
      this.history,
      this.metadata,
      async () => {
        const current = await this.cards.get(validated.id)
        if (
          generation !== undefined &&
          generation !==
            ((await this.metadata.get('workspaceGeneration'))?.value ??
              'initial')
        )
          throw new ConflictError(
            current ?? null,
            '工作区已在其他页面恢复或重置。当前修改尚未保存，请保留为副本或载入已存版本。',
          )
        if (!current || current.revision !== validated.revision)
          throw new ConflictError(current ?? null)
        if (current.revision === Number.MAX_SAFE_INTEGER)
          throw new Error('记录版本号已达到上限，请复制为新卡片。')
        const saved: Card = {
          ...validated,
          createdAt: current.createdAt,
          updatedAt: nextUpdatedAt(current),
          revision: current.revision + 1,
        }
        await this.remember(current, true)
        await this.cards.put(saved)
        return saved
      },
    )
  }

  async deleteCard(card: Card, generation?: string): Promise<void> {
    await this.transaction(
      'rw',
      this.cards,
      this.history,
      this.trash,
      this.pins,
      this.metadata,
      async () => {
        const current = await this.cards.get(card.id)
        if (
          generation !== undefined &&
          generation !==
            ((await this.metadata.get('workspaceGeneration'))?.value ??
              'initial')
        )
          throw new ConflictError(
            current ?? null,
            '工作区已在其他页面恢复或重置，请先载入已存版本。',
          )
        if (!current || current.revision !== card.revision)
          throw new ConflictError(current ?? null)
        await this.remember(current)
        await this.trash.put({
          id: current.id,
          card: structuredClone(current),
          deletedAt: new Date().toISOString(),
        })
        await this.cards.delete(card.id)
        await this.pins.delete(card.id)
      },
    )
  }

  async restoreCard(card: Card, deletedAt?: string): Promise<Card> {
    const [validated] = validateCards([card])
    return this.transaction('rw', this.cards, this.trash, async () => {
      const current = await this.cards.get(validated.id)
      if (current)
        throw new ConflictError(
          current,
          '相同 ID 的卡片已存在，无法覆盖恢复；请刷新回收站后重新选择。',
        )
      const deleted = await this.trash.get(validated.id)
      if (!deleted)
        throw new Error('回收站中已找不到这张卡片，请刷新回收站后重新选择。')
      if (
        !sameCard(deleted.card, validated) ||
        (deletedAt !== undefined && deleted.deletedAt !== deletedAt)
      )
        throw trashChanged()
      if (deleted.card.revision === Number.MAX_SAFE_INTEGER)
        throw new Error('记录版本号已达到上限，请复制为新卡片。')
      const restored = {
        ...deleted.card,
        updatedAt: nextUpdatedAt(deleted.card),
        revision: deleted.card.revision + 1,
      }
      await this.cards.add(restored)
      await this.trash.delete(validated.id)
      return restored
    })
  }

  async restoreDeletedCard(expected: DeletedCard): Promise<Card> {
    if (expected.id !== expected.card.id) throw trashChanged()
    return this.restoreCard(expected.card, expected.deletedAt)
  }

  async purgeDeletedCard(expected: DeletedCard): Promise<void> {
    await this.transaction('rw', this.trash, this.history, async () => {
      const current = await this.trash.get(expected.id)
      if (!current)
        throw new Error('回收站中已找不到这张卡片，请刷新回收站后重新选择。')
      if (
        current.deletedAt !== expected.deletedAt ||
        !sameCard(current.card, expected.card)
      )
        throw trashChanged()
      await this.trash.delete(expected.id)
      await this.history.where('cardId').equals(expected.id).delete()
    })
  }

  async restoreVersion(
    cardId: string,
    expected: CardHistoryEntry,
    expectedRevision: number,
  ): Promise<Card> {
    return this.transaction('rw', this.cards, this.history, async () => {
      const current = await this.cards.get(cardId)
      if (!current || current.revision !== expectedRevision)
        throw new ConflictError(current ?? null)
      const entry = await this.history.get(expected.id)
      if (!entry || entry.cardId !== cardId)
        throw new Error('所选历史版本已不存在，请刷新历史版本后重新选择。')
      if (
        expected.cardId !== cardId ||
        entry.recordedAt !== expected.recordedAt ||
        !sameCard(entry.card, expected.card)
      )
        throw new ConflictError(
          current,
          '所选历史版本已在其他页面变化，请刷新历史版本后重新选择。',
        )
      if (current.revision === Number.MAX_SAFE_INTEGER)
        throw new Error('记录版本号已达到上限，请复制为新卡片。')
      await this.remember(current)
      const restored: Card = {
        ...structuredClone(entry.card),
        id: current.id,
        createdAt: current.createdAt,
        updatedAt: nextUpdatedAt(current),
        revision: current.revision + 1,
      }
      await this.cards.put(restored)
      return restored
    })
  }

  async importCards(
    cards: Card[],
    strategy: ImportStrategy,
  ): Promise<ImportResult> {
    if (strategy !== 'skip' && strategy !== 'copy')
      throw new Error('请选择跳过冲突或导入为副本。')
    const incoming = validateCards(cards)
    return this.transaction(
      'rw',
      this.cards,
      this.trash,
      this.metadata,
      async () => {
        const existing = await this.cards.bulkGet(
          incoming.map((card) => card.id),
        )
        const toAdd: Card[] = []
        let skipped = 0
        for (let index = 0; index < incoming.length; index++) {
          const card = incoming[index]
          if (existing[index]) {
            if (strategy === 'skip') {
              skipped++
              continue
            }
            toAdd.push({ ...card, id: crypto.randomUUID() })
          } else {
            toAdd.push(card)
          }
        }
        if (toAdd.length) {
          const recycled = await this.trash.bulkGet(
            toAdd.map((card) => card.id),
          )
          await this.cards.bulkAdd(
            toAdd.map((card, index) =>
              revivedFromBackup(card, recycled[index]),
            ),
          )
          await this.trash.bulkDelete(toAdd.map((card) => card.id))
        }
        // Import is an explicit initialization, including an empty backup.
        await this.metadata.put({
          key: 'initialized',
          value: new Date().toISOString(),
        })
        return { added: toAdd.length, skipped }
      },
    )
  }

  async restoreBackupCards(
    cards: Card[],
    decisions: Record<string, RestoreDecision>,
  ): Promise<RestoreResult> {
    const incoming = validateCards(cards)
    return this.transaction(
      'rw',
      this.cards,
      this.history,
      this.trash,
      this.metadata,
      async () => {
        const existing = await this.cards.bulkGet(
          incoming.map((card) => card.id),
        )
        const recycled = await this.trash.bulkGet(
          incoming.map((card) => card.id),
        )
        const toAdd: Card[] = []
        const toReplace: Card[] = []
        const revivedIds: string[] = []
        let added = 0
        let skipped = 0
        let replaced = 0
        for (let index = 0; index < incoming.length; index++) {
          const card = incoming[index]
          const current = existing[index]
          const decision = Object.hasOwn(decisions, card.id)
            ? decisions[card.id]
            : undefined
          if (!current) {
            if (decision)
              throw new Error('导入期间卡片状态已变化，请重新选择备份文件。')
            toAdd.push(revivedFromBackup(card, recycled[index]))
            if (recycled[index]) revivedIds.push(card.id)
            added++
            continue
          }
          if (!decision || current.revision !== decision.expectedRevision)
            throw new ConflictError(
              current,
              '导入期间卡片已变化，请重新选择备份文件。',
            )
          if (decision.choice === 'skip') {
            skipped++
          } else if (decision.choice === 'copy') {
            toAdd.push({ ...card, id: crypto.randomUUID() })
            added++
          } else if (decision.choice === 'replace') {
            if (current.revision === Number.MAX_SAFE_INTEGER)
              throw new Error('记录版本号已达到上限，请先另存副本。')
            await this.remember(current)
            toReplace.push({
              ...card,
              id: current.id,
              createdAt: current.createdAt,
              updatedAt: nextUpdatedAt(current),
              revision: current.revision + 1,
            })
            replaced++
          } else {
            throw new Error('请选择有效的冲突处理方式。')
          }
        }
        if (toAdd.length) await this.cards.bulkAdd(toAdd)
        if (toReplace.length) await this.cards.bulkPut(toReplace)
        if (revivedIds.length) await this.trash.bulkDelete(revivedIds)
        await this.metadata.put({
          key: 'initialized',
          value: new Date().toISOString(),
        })
        return { added, skipped, replaced }
      },
    )
  }

  async resetExamples(): Promise<Card[]> {
    const examples = makeSeedCards()
    await this.transaction(
      'rw',
      this.cards,
      this.history,
      this.trash,
      this.pins,
      this.metadata,
      async () => {
        await this.cards.clear()
        await this.history.clear()
        await this.trash.clear()
        await this.pins.clear()
        await this.cards.bulkAdd(examples)
        await this.metadata.put({
          key: 'initialized',
          value: new Date().toISOString(),
        })
        await this.metadata.put({
          key: 'workspaceGeneration',
          value: crypto.randomUUID(),
        })
      },
    )
    return examples
  }
}

export const demoMode =
  typeof location !== 'undefined' &&
  new URLSearchParams(location.search).get('demo') === '1'
export const db = new KnowledgeDB(
  demoMode ? 'dev-knowledge-lab-demo' : 'dev-knowledge-lab',
)

export const loadCards = () => db.loadCards()
export const loadWorkspace = () => db.loadWorkspace()
export const createCard = (template = false) => db.createCard(template)
export const saveCard = (card: Card, generation?: string) =>
  db.saveCard(card, generation)
export const deleteCard = (card: Card, generation?: string) =>
  db.deleteCard(card, generation)
export const restoreCard = (card: Card) => db.restoreCard(card)
export const restoreDeletedCard = (entry: DeletedCard) =>
  db.restoreDeletedCard(entry)
export const purgeDeletedCard = (entry: DeletedCard) =>
  db.purgeDeletedCard(entry)
export const listTrash = () => db.listTrash()
export const listHistory = (cardId: string) => db.listHistory(cardId)
export const exportWorkspace = () => db.exportWorkspace()
export const getWorkspaceMarker = () => db.workspaceMarker()
export const replaceWorkspace = (data: WorkspaceData, marker: string) =>
  db.replaceWorkspace(data, marker)
export const restoreVersion = (
  cardId: string,
  entry: CardHistoryEntry,
  expectedRevision: number,
) => db.restoreVersion(cardId, entry, expectedRevision)
export const restoreBackupCards = (
  cards: Card[],
  decisions: Record<string, RestoreDecision>,
) => db.restoreBackupCards(cards, decisions)
export const importCards = (cards: Card[], strategy: ImportStrategy) =>
  db.importCards(cards, strategy)
export const resetDemoCards = async () => {
  if (!demoMode) throw new Error('只有演示空间可以重置示例。')
  return db.resetExamples()
}
export const getLastBackup = () => db.getLastBackup()
export const recordBackup = (date?: string) => db.recordBackup(date)
export const togglePin = (id: string) => db.togglePin(id)
export const batchTag = (
  selection: CardSelection[],
  action: 'add' | 'remove',
  tag: string,
  generation: string,
) => db.batchTag(selection, action, tag, generation)
export const batchPin = (
  selection: CardSelection[],
  pin: boolean,
  generation: string,
) => db.batchPin(selection, pin, generation)
export const batchDelete = (selection: CardSelection[], generation: string) =>
  db.batchDelete(selection, generation)
export const duplicateCard = (id: string) => db.duplicateCard(id)
export const renameTag = (from: string, to: string) => db.renameTag(from, to)
export const exportFullSnapshot = () => db.exportFullSnapshot()
export const replaceFullSnapshot = (snapshot: FullSnapshot, marker: string) =>
  db.replaceFullSnapshot(snapshot, marker)
