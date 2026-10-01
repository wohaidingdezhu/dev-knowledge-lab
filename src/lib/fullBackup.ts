import { strToU8, unzip, zip } from 'fflate'
import { BACKUP_LIMITS, validateCards } from './backup'
import type { CardHistoryEntry, DeletedCard, FullSnapshot } from './types'

const decoder = new TextDecoder('utf-8', { fatal: true })
const MAX_HISTORY = 1_000_000

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function exact(value: Record<string, unknown>, keys: string[], label: string) {
  if (
    Object.keys(value).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(value, key))
  )
    throw new Error(`${label}字段不完整或包含未知字段。`)
}

function iso(value: unknown, label: string): string {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  )
    throw new Error(`${label}不是有效的 UTC 时间。`)
  return value
}

/** Validate the complete recovery archive before any database write. */
export function validateFullSnapshot(value: unknown): FullSnapshot {
  if (!record(value)) throw new Error('完整归档格式错误。')
  exact(
    value,
    [
      'format',
      'schemaVersion',
      'exportedAt',
      'cards',
      'history',
      'trash',
      'pins',
    ],
    '完整归档',
  )
  if (value.format !== 'pianduan-full-snapshot' || value.schemaVersion !== 1)
    throw new Error('不支持此完整归档版本。')
  const exportedAt = iso(value.exportedAt, '导出时间')
  const cards = validateCards(value.cards)
  if (
    !Array.isArray(value.trash) ||
    value.trash.length > BACKUP_LIMITS.archiveCards
  )
    throw new Error('回收站记录数量无效。')
  const trashIds = new Set<string>()
  const activeIds = new Set(cards.map((card) => card.id))
  const trash: DeletedCard[] = value.trash.map((item: unknown) => {
    if (!record(item)) throw new Error('回收站记录格式错误。')
    exact(item, ['id', 'card', 'deletedAt'], '回收站记录')
    const [card] = validateCards([item.card])
    if (item.id !== card.id || trashIds.has(card.id) || activeIds.has(card.id))
      throw new Error('回收站包含重复或与当前卡片冲突的 ID。')
    trashIds.add(card.id)
    return { id: card.id, card, deletedAt: iso(item.deletedAt, '删除时间') }
  })
  if (!Array.isArray(value.history) || value.history.length > MAX_HISTORY)
    throw new Error('历史版本数量无效。')
  const historyIds = new Set<string>()
  const history: CardHistoryEntry[] = value.history.map((item: unknown) => {
    if (!record(item)) throw new Error('历史版本格式错误。')
    exact(item, ['id', 'cardId', 'card', 'recordedAt'], '历史版本')
    const [card] = validateCards([item.card])
    if (
      typeof item.id !== 'string' ||
      !item.id ||
      item.id.length > BACKUP_LIMITS.id ||
      historyIds.has(item.id) ||
      item.cardId !== card.id ||
      (!activeIds.has(card.id) && !trashIds.has(card.id))
    )
      throw new Error('历史版本的 ID 或所属卡片无效。')
    historyIds.add(item.id)
    return {
      id: item.id,
      cardId: card.id,
      card,
      recordedAt: iso(item.recordedAt, '历史记录时间'),
    }
  })
  if (!Array.isArray(value.pins) || value.pins.length > cards.length)
    throw new Error('置顶卡片列表无效。')
  const pins = value.pins as unknown[]
  if (
    pins.some((id) => typeof id !== 'string' || !activeIds.has(id)) ||
    new Set(pins).size !== pins.length
  )
    throw new Error('置顶卡片 ID 无效或重复。')
  return {
    format: 'pianduan-full-snapshot',
    schemaVersion: 1,
    exportedAt,
    cards,
    history,
    trash,
    pins: pins as string[],
  }
}

async function digest(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest(
    'SHA-256',
    bytes as Uint8Array<ArrayBuffer>,
  )
  return [...new Uint8Array(hash)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function compress(files: Record<string, Uint8Array>): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    zip(files, { level: 6 }, (error, data) =>
      error ? reject(error) : resolve(data),
    )
  })
}

export async function createFullBackupFile(
  snapshot: FullSnapshot,
): Promise<Blob> {
  const checked = validateFullSnapshot(snapshot)
  const content = strToU8(JSON.stringify(checked))
  if (content.length > BACKUP_LIMITS.archiveRawBytes)
    throw new Error('完整归档超过 250 MiB 上限。')
  const manifest = strToU8(
    JSON.stringify({
      format: 'pianduan-full-archive',
      schemaVersion: 1,
      bytes: content.length,
      sha256: await digest(content),
    }),
  )
  const zipped = await compress({
    'manifest.json': manifest,
    'snapshot.json': content,
  })
  if (zipped.length > BACKUP_LIMITS.archiveBytes)
    throw new Error('完整归档超过 100 MiB 上限。')
  return new Blob([new Uint8Array(zipped)], { type: 'application/zip' })
}

export async function parseFullBackupFile(file: File): Promise<FullSnapshot> {
  if (!/\.zip$/i.test(file.name)) throw new Error('请选择完整归档 .zip 文件。')
  if (file.size > BACKUP_LIMITS.archiveBytes)
    throw new Error('完整归档超过 100 MiB 上限。')
  const data = new Uint8Array(await file.arrayBuffer())
  let seen = new Set<string>()
  let invalid = false
  const files = await new Promise<Record<string, Uint8Array>>(
    (resolve, reject) => {
      unzip(
        data,
        {
          filter(info) {
            if (
              seen.has(info.name) ||
              (info.name !== 'manifest.json' &&
                info.name !== 'snapshot.json') ||
              !Number.isSafeInteger(info.originalSize) ||
              info.originalSize < 0 ||
              info.originalSize >
                (info.name === 'manifest.json'
                  ? 64 * 1024
                  : BACKUP_LIMITS.archiveRawBytes)
            ) {
              invalid = true
              return false
            }
            seen.add(info.name)
            return true
          },
        },
        (error, contents) =>
          error
            ? reject(new Error('完整归档无法解压或已损坏。'))
            : invalid
              ? reject(new Error('完整归档包含无效文件。'))
              : resolve(contents),
      )
    },
  )
  if (seen.size !== 2 || !files['manifest.json'] || !files['snapshot.json'])
    throw new Error('完整归档缺少清单或数据。')
  let manifest: unknown
  let snapshot: unknown
  try {
    manifest = JSON.parse(decoder.decode(files['manifest.json']))
    snapshot = JSON.parse(decoder.decode(files['snapshot.json']))
  } catch {
    throw new Error('完整归档中的 JSON 无效。')
  }
  if (!record(manifest)) throw new Error('完整归档清单无效。')
  exact(
    manifest,
    ['format', 'schemaVersion', 'bytes', 'sha256'],
    '完整归档清单',
  )
  if (
    manifest.format !== 'pianduan-full-archive' ||
    manifest.schemaVersion !== 1
  )
    throw new Error('不支持此完整归档版本。')
  if (
    manifest.bytes !== files['snapshot.json'].length ||
    typeof manifest.sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(manifest.sha256) ||
    manifest.sha256 !== (await digest(files['snapshot.json']))
  )
    throw new Error('完整归档校验失败，文件可能已损坏。')
  return validateFullSnapshot(snapshot)
}
