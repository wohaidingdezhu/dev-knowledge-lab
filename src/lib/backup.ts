import { schemaVersion, type BackupV1, type Card } from './types'

export { schemaVersion } from './types'

export const BACKUP_LIMITS = {
  bytes: 10 * 1024 * 1024,
  cards: 5000,
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
export function validateCards(value: unknown): Card[] {
  if (!Array.isArray(value) || value.length > BACKUP_LIMITS.cards) {
    throw new Error(`卡片必须是数组，且最多包含 ${BACKUP_LIMITS.cards} 张。`)
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
  return validateCards(value.cards)
}

export function serializeBackup(cards: Card[]): string {
  const backup: BackupV1 = {
    schemaVersion,
    exportedAt: new Date().toISOString(),
    cards: validateCards(cards),
  }
  const text = JSON.stringify(backup, null, 2)
  if (new TextEncoder().encode(text).byteLength > BACKUP_LIMITS.bytes) {
    throw new Error('备份超过 10 MiB 的单文件限制，请减少卡片数量后重试。')
  }
  return text
}
