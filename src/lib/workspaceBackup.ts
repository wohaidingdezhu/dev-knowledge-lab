import { unzip, zip } from 'fflate'
import {
  BACKUP_LIMITS,
  parseBackup,
  parseBackupFile,
  validateCards,
} from './backup'
import type { CardHistoryEntry, DeletedCard, WorkspaceData } from './types'

const HISTORY_LIMIT = 20
const MAX_HISTORY = 250_000
const MAX_PARTS = 1000
const kinds = ['cards', 'history', 'trash'] as const
type Kind = (typeof kinds)[number]
type Part = {
  name: string
  kind: Kind
  bytes: number
  count: number
  sha256: string
}

const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8', { fatal: true })

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function exact(value: Record<string, unknown>, keys: string[], label: string) {
  if (
    Object.keys(value).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(value, key))
  )
    throw new Error(`${label}字段不完整或包含不支持的字段。`)
}

function timestamp(value: unknown, label: string): string {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  )
    throw new Error(`${label}不是有效的 UTC 时间。`)
  return value
}

function entryId(value: unknown, label: string): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > BACKUP_LIMITS.id
  )
    throw new Error(`${label} ID 无效。`)
  return value
}

/** Validate a complete workspace before exporting or starting a restore transaction. */
export function validateWorkspace(input: unknown): WorkspaceData {
  if (!record(input)) throw new Error('完整备份格式错误。')
  exact(input, ['cards', 'history', 'trash'], '完整备份')
  const cards = validateCards(input.cards)
  if (
    !Array.isArray(input.trash) ||
    input.trash.length > BACKUP_LIMITS.archiveCards
  )
    throw new Error('回收站记录数量无效。')
  const activeIds = new Set(cards.map((card) => card.id))
  const trashIds = new Set<string>()
  const trash: DeletedCard[] = input.trash.map((candidate, index) => {
    if (!record(candidate))
      throw new Error(`第 ${index + 1} 条回收站记录无效。`)
    exact(candidate, ['id', 'card', 'deletedAt'], '回收站记录')
    const id = entryId(candidate.id, '回收站记录')
    const card = validateCards([candidate.card])[0]
    if (card.id !== id || activeIds.has(id) || trashIds.has(id))
      throw new Error('回收站与当前卡片的 ID 冲突。')
    trashIds.add(id)
    return { id, card, deletedAt: timestamp(candidate.deletedAt, '删除时间') }
  })
  if (!Array.isArray(input.history) || input.history.length > MAX_HISTORY)
    throw new Error('历史版本数量无效。')
  const historyIds = new Set<string>()
  const perCard = new Map<string, number>()
  const history: CardHistoryEntry[] = input.history.map((candidate, index) => {
    if (!record(candidate)) throw new Error(`第 ${index + 1} 条历史版本无效。`)
    exact(candidate, ['id', 'cardId', 'card', 'recordedAt'], '历史版本')
    const id = entryId(candidate.id, '历史版本')
    const cardId = entryId(candidate.cardId, '历史版本卡片')
    const card = validateCards([candidate.card])[0]
    if (
      historyIds.has(id) ||
      card.id !== cardId ||
      (!activeIds.has(cardId) && !trashIds.has(cardId))
    )
      throw new Error('历史版本的 ID 或所属卡片无效。')
    historyIds.add(id)
    const count = (perCard.get(cardId) ?? 0) + 1
    if (count > HISTORY_LIMIT) throw new Error('单张卡片的历史版本超过 20 条。')
    perCard.set(cardId, count)
    return {
      id,
      cardId,
      card,
      recordedAt: timestamp(candidate.recordedAt, '历史版本时间'),
    }
  })
  return { cards, history, trash }
}

async function sha256(data: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest(
    'SHA-256',
    data as Uint8Array<ArrayBuffer>,
  )
  return [...new Uint8Array(hash)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function makeZip(files: Record<string, Uint8Array>): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    zip(files, { level: 6 }, (error, data) =>
      error ? reject(error) : resolve(data),
    )
  })
}

function readZip(data: Uint8Array): Promise<Record<string, Uint8Array>> {
  let total = 0
  let count = 0
  let invalid = false
  return new Promise((resolve, reject) => {
    unzip(
      data,
      {
        filter(info) {
          total += info.originalSize
          count += 1
          if (
            !Number.isSafeInteger(info.originalSize) ||
            info.originalSize < 0 ||
            info.originalSize > BACKUP_LIMITS.partBytes ||
            total > BACKUP_LIMITS.archiveRawBytes ||
            count > MAX_PARTS + 1 ||
            (info.name !== 'manifest.json' &&
              !/^(cards|history|trash|parts)\/\d{5}\.json$/.test(info.name))
          ) {
            invalid = true
            return false
          }
          return true
        },
      },
      (error, files) =>
        error
          ? reject(error)
          : invalid
            ? reject(new Error('完整归档包含无效文件或超过大小限制。'))
            : resolve(files),
    )
  })
}

async function makeArchive(
  data: WorkspaceData,
  exportedAt: string,
): Promise<Blob> {
  const files: Record<string, Uint8Array> = {}
  const parts: Part[] = []
  let total = 0
  for (const kind of kinds) {
    let batch: unknown[] = []
    let batchBytes = 2
    let partNumber = 0
    const write = async () => {
      if (!batch.length) return
      const name = `${kind}/${String(++partNumber).padStart(5, '0')}.json`
      const content = encoder.encode(JSON.stringify(batch))
      total += content.length
      if (total > BACKUP_LIMITS.archiveRawBytes || parts.length >= MAX_PARTS)
        throw new Error('完整备份超过 250 MiB 或 1000 分块上限。')
      files[name] = content
      parts.push({
        name,
        kind,
        bytes: content.length,
        count: batch.length,
        sha256: await sha256(content),
      })
      batch = []
      batchBytes = 2
    }
    for (const item of data[kind]) {
      const bytes =
        encoder.encode(JSON.stringify(item)).length + (batch.length ? 1 : 0)
      if (bytes + 2 > BACKUP_LIMITS.partBytes)
        throw new Error('单条记录超过归档分块限制。')
      if (batch.length && batchBytes + bytes > BACKUP_LIMITS.partBytes)
        await write()
      batch.push(item)
      batchBytes += bytes
    }
    await write()
  }
  const manifest = {
    format: 'pianduan-workspace',
    schemaVersion: 3,
    exportedAt,
    counts: {
      cards: data.cards.length,
      history: data.history.length,
      trash: data.trash.length,
    },
    parts,
  }
  files['manifest.json'] = encoder.encode(JSON.stringify(manifest))
  const zipped = await makeZip(files)
  if (zipped.length > BACKUP_LIMITS.archiveBytes)
    throw new Error('完整归档超过 100 MiB 上限。')
  return new Blob([new Uint8Array(zipped)], { type: 'application/zip' })
}

export async function createWorkspaceBackupFile(
  input: WorkspaceData,
): Promise<{ data: Blob; extension: 'json' | 'zip' }> {
  const data = validateWorkspace(input)
  const exportedAt = new Date().toISOString()
  const text = JSON.stringify(
    { format: 'pianduan-workspace', schemaVersion: 3, exportedAt, ...data },
    null,
    2,
  )
  if (encoder.encode(text).length <= BACKUP_LIMITS.bytes)
    return {
      data: new Blob([text], { type: 'application/json' }),
      extension: 'json',
    }
  return { data: await makeArchive(data, exportedAt), extension: 'zip' }
}

function parseFullJson(text: string): WorkspaceData {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new Error('完整备份不是有效的 JSON。')
  }
  if (!record(value)) throw new Error('完整备份格式错误。')
  exact(
    value,
    ['format', 'schemaVersion', 'exportedAt', 'cards', 'history', 'trash'],
    '完整备份',
  )
  if (value.format !== 'pianduan-workspace' || value.schemaVersion !== 3)
    throw new Error('不支持此完整备份版本。')
  timestamp(value.exportedAt, '完整备份导出时间')
  return validateWorkspace({
    cards: value.cards,
    history: value.history,
    trash: value.trash,
  })
}

async function parseFullArchive(
  files: Record<string, Uint8Array>,
): Promise<WorkspaceData> {
  let value: unknown
  try {
    value = JSON.parse(decoder.decode(files['manifest.json']))
  } catch {
    throw new Error('完整归档清单不是有效的 JSON。')
  }
  if (!record(value)) throw new Error('完整归档清单格式错误。')
  exact(
    value,
    ['format', 'schemaVersion', 'exportedAt', 'counts', 'parts'],
    '完整归档清单',
  )
  if (value.format !== 'pianduan-workspace' || value.schemaVersion !== 3)
    throw new Error('不支持此完整归档版本。')
  timestamp(value.exportedAt, '完整归档导出时间')
  if (!record(value.counts)) throw new Error('完整归档数量无效。')
  exact(value.counts, ['cards', 'history', 'trash'], '完整归档数量')
  for (const kind of kinds) {
    const limit = kind === 'history' ? MAX_HISTORY : BACKUP_LIMITS.archiveCards
    if (
      !Number.isSafeInteger(value.counts[kind]) ||
      (value.counts[kind] as number) < 0 ||
      (value.counts[kind] as number) > limit
    )
      throw new Error('完整归档数量无效。')
  }
  const counts = value.counts as Record<Kind, number>
  if (
    !Array.isArray(value.parts) ||
    value.parts.length > MAX_PARTS ||
    Object.keys(files).length !== value.parts.length + 1
  )
    throw new Error('完整归档分块列表无效。')
  const data: Record<Kind, unknown[]> = { cards: [], history: [], trash: [] }
  const numbers: Record<Kind, number> = { cards: 0, history: 0, trash: 0 }
  for (const part of value.parts) {
    if (!record(part)) throw new Error('完整归档分块信息无效。')
    exact(part, ['name', 'kind', 'bytes', 'count', 'sha256'], '完整归档分块')
    if (!kinds.includes(part.kind as Kind))
      throw new Error('完整归档分块类型无效。')
    const kind = part.kind as Kind
    const expected = `${kind}/${String(++numbers[kind]).padStart(5, '0')}.json`
    if (
      part.name !== expected ||
      !Number.isSafeInteger(part.bytes) ||
      (part.bytes as number) < 0 ||
      (part.bytes as number) > BACKUP_LIMITS.partBytes ||
      !Number.isSafeInteger(part.count) ||
      (part.count as number) < 1 ||
      typeof part.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(part.sha256)
    )
      throw new Error('完整归档分块信息无效。')
    const content = files[expected]
    if (!content) throw new Error(`完整归档缺少 ${expected}。`)
    if (
      content.length !== part.bytes ||
      (await sha256(content)) !== part.sha256
    )
      throw new Error(`${expected} 的校验值不匹配，备份可能已损坏。`)
    let parsed: unknown
    try {
      parsed = JSON.parse(decoder.decode(content))
    } catch {
      throw new Error(`${expected} 不是有效的 JSON。`)
    }
    if (!Array.isArray(parsed) || parsed.length !== part.count)
      throw new Error(`${expected} 的记录数量不匹配。`)
    data[kind].push(...parsed)
    if (data[kind].length > counts[kind])
      throw new Error('完整归档记录数量超过清单。')
  }
  if (kinds.some((kind) => data[kind].length !== counts[kind]))
    throw new Error('完整归档记录数量不匹配。')
  return validateWorkspace(data)
}

export async function readPortableBackupFile(
  file: File,
): Promise<{ workspace: WorkspaceData; complete: boolean }> {
  if (/\.json$/i.test(file.name)) {
    if (file.size > BACKUP_LIMITS.bytes)
      throw new Error('备份文件不能超过 10 MiB。')
    const text = await file.text()
    let version: unknown
    try {
      version = JSON.parse(text)?.schemaVersion
    } catch {
      throw new Error('备份不是有效的 JSON。')
    }
    if (version === 3) return { workspace: parseFullJson(text), complete: true }
    const cards = parseBackup(text)
    return { workspace: { cards, history: [], trash: [] }, complete: false }
  }
  if (!/\.zip$/i.test(file.name))
    throw new Error('请选择 .json 或 .zip 备份文件。')
  if (file.size > BACKUP_LIMITS.archiveBytes)
    throw new Error('归档文件超过 100 MiB 上限。')
  const bytes = new Uint8Array(await file.arrayBuffer())
  const files = await readZip(bytes)
  if (!files['manifest.json']) throw new Error('归档缺少 manifest.json。')
  let manifest: unknown
  try {
    manifest = JSON.parse(decoder.decode(files['manifest.json']))
  } catch {
    throw new Error('归档清单不是有效的 JSON。')
  }
  if (record(manifest) && manifest.schemaVersion === 3)
    return { workspace: await parseFullArchive(files), complete: true }
  const cards = await parseBackupFile(file)
  return { workspace: { cards, history: [], trash: [] }, complete: false }
}
