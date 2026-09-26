import Dexie, { type Table } from 'dexie'
import { validateCards } from './backup'
import { makeSeedCards, PITFALL_TEMPLATE } from './seeds'
import type {
  Card,
  CardHistoryEntry,
  DeletedCard,
  ImportResult,
  ImportStrategy,
  RestoreDecision,
  RestoreResult,
} from './types'

const HISTORY_LIMIT = 20
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
  }

  private async remember(card: Card): Promise<void> {
    const entries = await this.history
      .where('cardId')
      .equals(card.id)
      .sortBy('recordedAt')
    entries.sort((left, right) => left.card.revision - right.card.revision)
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

  async listHistory(cardId: string): Promise<CardHistoryEntry[]> {
    return (await this.history.where('cardId').equals(cardId).toArray()).sort(
      (left, right) => right.card.revision - left.card.revision,
    )
  }

  async listTrash(): Promise<DeletedCard[]> {
    return this.trash.orderBy('deletedAt').reverse().toArray()
  }

  async loadCards(): Promise<Card[]> {
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
      return this.cards.orderBy('updatedAt').reverse().toArray()
    })
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

  async saveCard(card: Card): Promise<Card> {
    const [validated] = validateCards([card])
    return this.transaction('rw', this.cards, this.history, async () => {
      const current = await this.cards.get(validated.id)
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
      await this.remember(current)
      await this.cards.put(saved)
      return saved
    })
  }

  async deleteCard(card: Card): Promise<void> {
    await this.transaction(
      'rw',
      this.cards,
      this.history,
      this.trash,
      async () => {
        const current = await this.cards.get(card.id)
        if (!current || current.revision !== card.revision)
          throw new ConflictError(current ?? null)
        await this.remember(current)
        await this.trash.put({
          id: current.id,
          card: structuredClone(current),
          deletedAt: new Date().toISOString(),
        })
        await this.cards.delete(card.id)
      },
    )
  }

  async restoreCard(card: Card): Promise<Card> {
    const [validated] = validateCards([card])
    return this.transaction('rw', this.cards, this.trash, async () => {
      const current = await this.cards.get(validated.id)
      if (current)
        throw new ConflictError(current, '相同 ID 的卡片已存在，无法覆盖恢复。')
      const deleted = await this.trash.get(validated.id)
      if (!deleted || deleted.card.revision !== validated.revision)
        throw new Error('回收站中已找不到这次删除的卡片。')
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

  async restoreDeletedCard(id: string): Promise<Card> {
    const deleted = await this.trash.get(id)
    if (!deleted) throw new Error('回收站中已找不到这张卡片。')
    return this.restoreCard(deleted.card)
  }

  async purgeDeletedCard(id: string): Promise<void> {
    await this.transaction('rw', this.trash, this.history, async () => {
      if (!(await this.trash.get(id)))
        throw new Error('回收站中已找不到这张卡片。')
      await this.trash.delete(id)
      await this.history.where('cardId').equals(id).delete()
    })
  }

  async restoreVersion(
    cardId: string,
    historyId: string,
    expectedRevision: number,
  ): Promise<Card> {
    return this.transaction('rw', this.cards, this.history, async () => {
      const current = await this.cards.get(cardId)
      if (!current || current.revision !== expectedRevision)
        throw new ConflictError(current ?? null)
      const entry = await this.history.get(historyId)
      if (!entry || entry.cardId !== cardId)
        throw new Error('找不到所选历史版本。')
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
      this.metadata,
      async () => {
        await this.cards.clear()
        await this.history.clear()
        await this.trash.clear()
        await this.cards.bulkAdd(examples)
        await this.metadata.put({
          key: 'initialized',
          value: new Date().toISOString(),
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
export const createCard = (template = false) => db.createCard(template)
export const saveCard = (card: Card) => db.saveCard(card)
export const deleteCard = (card: Card) => db.deleteCard(card)
export const restoreCard = (card: Card) => db.restoreCard(card)
export const restoreDeletedCard = (id: string) => db.restoreDeletedCard(id)
export const purgeDeletedCard = (id: string) => db.purgeDeletedCard(id)
export const listTrash = () => db.listTrash()
export const listHistory = (cardId: string) => db.listHistory(cardId)
export const restoreVersion = (
  cardId: string,
  historyId: string,
  expectedRevision: number,
) => db.restoreVersion(cardId, historyId, expectedRevision)
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
