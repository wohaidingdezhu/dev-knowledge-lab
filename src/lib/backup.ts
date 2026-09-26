import { schemaVersion, type BackupV1, type Card } from './types'
import { strToU8, unzip, zip } from 'fflate'

export { schemaVersion } from './types'

export const BACKUP_LIMITS = {
  bytes: 10 * 1024 * 1024,
  cards: 5000,
  archiveCards: 50_000,
  archiveBytes: 100 * 1024 * 1024,
  archiveRawBytes: 250 * 1024 * 1024,
  partBytes: 8 * 1024 * 1024,
  id: 200,
  title: 200,
  body: 500_000,
  code: 250_000,
  tags: 24,
  tag: 48,
  source: 2048,
} as const

const cardKeys = [
  'id',
  'title',
  'body',
  'tags',
  'source',
  'html',
  'css',
  'js',
  'createdAt',
  'updatedAt',
  'revision',
] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function assertExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
) {
  if (
    Object.keys(value).length !== expected.length ||
    expected.some((key) => !Object.hasOwn(value, key))
  ) {
    throw new Error(`${label}字段不完整或包含不支持的字段。`)
  }
}

function assertString(
  value: unknown,
  label: string,
  max: number,
  nonempty = false,
): asserts value is string {
  if (
    typeof value !== 'string' ||
    value.length > max ||
    (nonempty && !value.trim())
  ) {
    throw new Error(
      `${label}必须是${nonempty ? '非空' : ''}字符串，且不超过 ${max} 个字符。`,
    )
  }
}

function assertTimestamp(
  value: unknown,
  label: string,
): asserts value is string {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  ) {
    throw new Error(
      `${label}必须是有效的 UTC ISO 时间（例如 2026-01-01T00:00:00.000Z）。`,
    )
  }
  const timestamp = new Date(value)
  if (
    !Number.isFinite(timestamp.getTime()) ||
    timestamp.toISOString() !== value
  ) {
    throw new Error(`${label}不是有效时间。`)
  }
}

export function validateSource(value: string): boolean {
  if (typeof value !== 'string' || value.length > BACKUP_LIMITS.source)
    return false
  if (value.trim() === '') return true
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

/** Validates every field before storage and returns detached, plain card objects. */
export function validateCards(
  value: unknown,
  maxCards: number = BACKUP_LIMITS.archiveCards,
): Card[] {
  if (!Array.isArray(value) || value.length > maxCards) {
    throw new Error(`卡片必须是数组，且最多包含 ${maxCards} 张。`)
  }
  const ids = new Set<string>()
  return value.map((candidate: unknown, index) => {
    const label = `第 ${index + 1} 张卡片：`
    if (!isRecord(candidate)) throw new Error(`${label}格式错误。`)
    assertExactKeys(candidate, cardKeys, label)
    assertString(candidate.id, `${label}ID`, BACKUP_LIMITS.id, true)
    assertString(candidate.title, `${label}标题`, BACKUP_LIMITS.title)
    assertString(candidate.body, `${label}正文`, BACKUP_LIMITS.body)
    assertString(candidate.source, `${label}来源链接`, BACKUP_LIMITS.source)
    for (const field of ['html', 'css', 'js'] as const) {
      assertString(
        candidate[field],
        `${label}${field} 源码`,
        BACKUP_LIMITS.code,
      )
    }
    if (!validateSource(candidate.source))
      throw new Error(`${label}来源链接仅支持 http:// 或 https://。`)
    if (
      !Array.isArray(candidate.tags) ||
      candidate.tags.length > BACKUP_LIMITS.tags
    ) {
      throw new Error(
        `${label}标签必须是数组，且最多 ${BACKUP_LIMITS.tags} 个。`,
      )
    }
    for (const tag of candidate.tags)
      assertString(tag, `${label}标签`, BACKUP_LIMITS.tag, true)
    if (new Set(candidate.tags).size !== candidate.tags.length)
      throw new Error(`${label}标签不能重复。`)
    assertTimestamp(candidate.createdAt, `${label}创建时间`)
    assertTimestamp(candidate.updatedAt, `${label}修改时间`)
    if (candidate.updatedAt < candidate.createdAt)
      throw new Error(`${label}修改时间不能早于创建时间。`)
    if (
      !Number.isSafeInteger(candidate.revision) ||
      (candidate.revision as number) < 1
    ) {
      throw new Error(`${label}版本号必须为正整数。`)
    }
    if (ids.has(candidate.id))
      throw new Error(`备份中出现重复的卡片 ID：${candidate.id}。`)
    ids.add(candidate.id)
    return {
      id: candidate.id,
      title: candidate.title,
      body: candidate.body,
      tags: [...candidate.tags] as string[],
      source: candidate.source,
      html: candidate.html as string,
      css: candidate.css as string,
      js: candidate.js as string,
      createdAt: candidate.createdAt,
      updatedAt: candidate.updatedAt,
      revision: candidate.revision as number,
    }
  })
}

export function parseBackup(text: string): Card[] {
  if (
    typeof text !== 'string' ||
    text.length > BACKUP_LIMITS.bytes ||
    new TextEncoder().encode(text).byteLength > BACKUP_LIMITS.bytes
  ) {
    throw new Error('备份文件不能超过 10 MiB。')
  }
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new Error('无法读取备份：请选择有效的 JSON 文件。')
  }
  if (!isRecord(value))
    throw new Error('备份格式错误：需要完整的版本化备份对象。')
  if (value.schemaVersion !== schemaVersion)
    throw new Error('不支持此备份版本，目前只支持 schemaVersion 1。')
  assertExactKeys(value, ['schemaVersion', 'exportedAt', 'cards'], '备份')
  assertTimestamp(value.exportedAt, '备份导出时间')
  return validateCards(value.cards, BACKUP_LIMITS.cards)
}

export function serializeBackup(cards: Card[]): string {
  if (cards.length > BACKUP_LIMITS.cards)
    throw new Error('v1 JSON 备份最多包含 5000 张卡片，请使用 ZIP 归档。')
  const backup: BackupV1 = {
    schemaVersion,
    exportedAt: new Date().toISOString(),
    cards: validateCards(cards, BACKUP_LIMITS.cards),
  }
  const text = JSON.stringify(backup, null, 2)
  if (new TextEncoder().encode(text).byteLength > BACKUP_LIMITS.bytes) {
    throw new Error('备份超过 10 MiB 的单文件限制，请减少卡片数量后重试。')
  }
  return text
}

interface ArchivePart {
  name: string
  bytes: number
  cards: number
  sha256: string
}

interface ArchiveManifest {
  format: 'pianduan-archive'
  schemaVersion: 2
  exportedAt: string
  cardCount: number
  parts: ArchivePart[]
}

const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8', { fatal: true })

async function sha256(value: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest(
    'SHA-256',
    value as Uint8Array<ArrayBuffer>,
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
          count++
          if (
            !Number.isSafeInteger(info.originalSize) ||
            info.originalSize < 0 ||
            info.originalSize > BACKUP_LIMITS.partBytes ||
            total > BACKUP_LIMITS.archiveRawBytes ||
            count > 1001 ||
            (info.name !== 'manifest.json' &&
              !/^parts\/\d{5}\.json$/.test(info.name))
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
            ? reject(new Error('归档包含无效文件或超过大小限制。'))
            : resolve(files),
    )
  })
}

/** A single ZIP contains bounded JSON parts and a SHA-256 manifest. */
export async function createArchive(cards: Card[]): Promise<Uint8Array> {
  const validated = validateCards(cards)
  const files: Record<string, Uint8Array> = {}
  const parts: ArchivePart[] = []
  let batch: Card[] = []
  let batchBytes = 2
  let total = 0
  const writePart = async () => {
    if (!batch.length) return
    const name = `parts/${String(parts.length + 1).padStart(5, '0')}.json`
    const data = strToU8(JSON.stringify(batch))
    if (data.length > BACKUP_LIMITS.partBytes)
      throw new Error('单张卡片超过归档分块限制。')
    total += data.length
    if (total > BACKUP_LIMITS.archiveRawBytes)
      throw new Error('完整备份超过 250 MiB 上限。')
    files[name] = data
    parts.push({
      name,
      bytes: data.length,
      cards: batch.length,
      sha256: await sha256(data),
    })
    batch = []
    batchBytes = 2
  }
  for (const card of validated) {
    const bytes =
      encoder.encode(JSON.stringify(card)).length + (batch.length ? 1 : 0)
    if (batch.length && batchBytes + bytes > BACKUP_LIMITS.partBytes)
      await writePart()
    batch.push(card)
    batchBytes += bytes
  }
  await writePart()
  const manifest: ArchiveManifest = {
    format: 'pianduan-archive',
    schemaVersion: 2,
    exportedAt: new Date().toISOString(),
    cardCount: validated.length,
    parts,
  }
  files['manifest.json'] = strToU8(JSON.stringify(manifest))
  const result = await makeZip(files)
  if (result.length > BACKUP_LIMITS.archiveBytes)
    throw new Error('归档文件超过 100 MiB 上限。')
  return result
}

/** Validate every part before returning cards for an atomic database import. */
export async function parseArchive(data: Uint8Array): Promise<Card[]> {
  if (data.length > BACKUP_LIMITS.archiveBytes)
    throw new Error('归档文件超过 100 MiB 上限。')
  let files: Record<string, Uint8Array>
  try {
    files = await readZip(data)
  } catch (cause) {
    throw new Error(
      `无法解压备份归档：${cause instanceof Error ? cause.message : '文件损坏'}`,
    )
  }
  if (!files['manifest.json']) throw new Error('归档缺少 manifest.json。')
  let value: unknown
  try {
    value = JSON.parse(decoder.decode(files['manifest.json']))
  } catch {
    throw new Error('归档清单不是有效的 JSON。')
  }
  if (!isRecord(value)) throw new Error('归档清单格式错误。')
  assertExactKeys(
    value,
    ['format', 'schemaVersion', 'exportedAt', 'cardCount', 'parts'],
    '归档清单',
  )
  if (value.format !== 'pianduan-archive' || value.schemaVersion !== 2)
    throw new Error('不支持此归档版本。')
  assertTimestamp(value.exportedAt, '归档导出时间')
  if (
    !Number.isSafeInteger(value.cardCount) ||
    (value.cardCount as number) < 0 ||
    (value.cardCount as number) > BACKUP_LIMITS.archiveCards
  )
    throw new Error('归档卡片数量无效。')
  if (!Array.isArray(value.parts) || value.parts.length > 1000)
    throw new Error('归档分块列表无效。')
  if (Object.keys(files).length !== value.parts.length + 1)
    throw new Error('归档包含未声明的分块。')
  const cards: Card[] = []
  for (let index = 0; index < value.parts.length; index++) {
    const part = value.parts[index]
    if (!isRecord(part)) throw new Error('归档分块信息无效。')
    assertExactKeys(part, ['name', 'bytes', 'cards', 'sha256'], '归档分块')
    const expected = `parts/${String(index + 1).padStart(5, '0')}.json`
    if (
      part.name !== expected ||
      !Number.isSafeInteger(part.bytes) ||
      (part.bytes as number) < 0 ||
      (part.bytes as number) > BACKUP_LIMITS.partBytes ||
      !Number.isSafeInteger(part.cards) ||
      (part.cards as number) < 1 ||
      (part.cards as number) > BACKUP_LIMITS.archiveCards ||
      typeof part.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(part.sha256)
    )
      throw new Error('归档分块信息无效。')
    const content = files[expected]
    if (!content) throw new Error(`归档缺少 ${expected}。`)
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
    if (!Array.isArray(parsed) || parsed.length !== part.cards)
      throw new Error(`${expected} 的卡片数量不匹配。`)
    cards.push(...parsed)
    if (cards.length > BACKUP_LIMITS.archiveCards)
      throw new Error('归档卡片数量超过上限。')
  }
  if (cards.length !== value.cardCount)
    throw new Error('归档总卡片数量不匹配。')
  return validateCards(cards)
}

export async function createBackupFile(
  cards: Card[],
): Promise<{ data: Blob; extension: 'json' | 'zip' }> {
  const validated = validateCards(cards)
  if (validated.length <= BACKUP_LIMITS.cards) {
    const text = JSON.stringify(
      { schemaVersion, exportedAt: new Date().toISOString(), cards: validated },
      null,
      2,
    )
    if (encoder.encode(text).length <= BACKUP_LIMITS.bytes)
      return {
        data: new Blob([text], { type: 'application/json' }),
        extension: 'json',
      }
  }
  const zipped = await createArchive(validated)
  return {
    data: new Blob([new Uint8Array(zipped)], { type: 'application/zip' }),
    extension: 'zip',
  }
}

export async function parseBackupFile(file: File): Promise<Card[]> {
  if (/\.json$/i.test(file.name)) return parseBackup(await file.text())
  if (!/\.zip$/i.test(file.name))
    throw new Error('请选择 .json 或 .zip 备份文件。')
  if (file.size > BACKUP_LIMITS.archiveBytes)
    throw new Error('归档文件超过 100 MiB 上限。')
  return parseArchive(new Uint8Array(await file.arrayBuffer()))
}
