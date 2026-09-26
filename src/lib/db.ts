import Dexie, { type Table } from 'dexie'
import { validateCards } from './backup'
import { makeSeedCards, PITFALL_TEMPLATE } from './seeds'
import type { Card, ImportResult, ImportStrategy } from './types'

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
    return this.transaction('rw', this.cards, async () => {
      const current = await this.cards.get(validated.id)
      if (!current || current.revision !== validated.revision)
        throw new ConflictError(current ?? null)
      if (current.revision === Number.MAX_SAFE_INTEGER)
        throw new Error('记录版本号已达到上限，请复制为新卡片。')
      const saved: Card = {
        ...validated,
        createdAt: current.createdAt,
        updatedAt: new Date(
          Math.max(Date.now(), Date.parse(current.updatedAt)),
        ).toISOString(),
        revision: current.revision + 1,
      }
      await this.cards.put(saved)
      return saved
    })
  }

  async deleteCard(card: Card): Promise<void> {
    await this.transaction('rw', this.cards, async () => {
      const current = await this.cards.get(card.id)
      if (!current || current.revision !== card.revision)
        throw new ConflictError(current ?? null)
      await this.cards.delete(card.id)
    })
  }

  async restoreCard(card: Card): Promise<Card> {
    const [validated] = validateCards([card])
    return this.transaction('rw', this.cards, async () => {
      const current = await this.cards.get(validated.id)
      if (current)
        throw new ConflictError(current, '相同 ID 的卡片已存在，无法覆盖恢复。')
      if (validated.revision === Number.MAX_SAFE_INTEGER)
        throw new Error('记录版本号已达到上限，请复制为新卡片。')
      const restored = { ...validated, revision: validated.revision + 1 }
      await this.cards.add(restored)
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
    return this.transaction('rw', this.cards, this.metadata, async () => {
      const existing = await this.cards.bulkGet(incoming.map((card) => card.id))
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
      if (toAdd.length) await this.cards.bulkAdd(toAdd)
      // Import is an explicit initialization, including an empty backup.
      await this.metadata.put({
        key: 'initialized',
        value: new Date().toISOString(),
      })
      return { added: toAdd.length, skipped }
    })
  }

  async resetExamples(): Promise<Card[]> {
    const examples = makeSeedCards()
    await this.transaction('rw', this.cards, this.metadata, async () => {
      await this.cards.clear()
      await this.cards.bulkAdd(examples)
      await this.metadata.put({
        key: 'initialized',
        value: new Date().toISOString(),
      })
    })
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
export const importCards = (cards: Card[], strategy: ImportStrategy) =>
  db.importCards(cards, strategy)
export const resetDemoCards = async () => {
  if (!demoMode) throw new Error('只有演示空间可以重置示例。')
  return db.resetExamples()
}
