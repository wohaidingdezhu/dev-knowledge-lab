import { describe, expect, it, vi } from 'vitest'
import {
  BACKUP_LIMITS,
  createBackupFile,
  createDraftFile,
  parseBackup,
  parseBackupFile,
  serializeBackup,
  validateSource,
} from '../src/lib/backup'
import { makeSeedCards } from '../src/lib/seeds'

const cards = makeSeedCards('2026-09-25T00:00:00.000Z')
const backup = () => JSON.parse(serializeBackup(cards))

describe('versioned backups', () => {
  it('preserves invalid draft fields while requiring correction before import', async () => {
    const drafts = structuredClone(cards)
    drafts[0].source = 'developer.mozilla.org'
    drafts[0].body = '尚未保存的正文'
    drafts[0].js = 'console.log("尚未保存的代码")'
    await expect(createBackupFile(drafts)).rejects.toThrow(/来源链接/)
    const text = await createDraftFile(drafts).text()
    const recovered = JSON.parse(text)
    expect(recovered.cards).toEqual(drafts)
    expect(() => parseBackup(text)).toThrow(/来源链接/)
    recovered.cards[0].source = 'https://developer.mozilla.org'
    expect(parseBackup(JSON.stringify(recovered))).toEqual(
      drafts.map((card, index) =>
        index === 0
          ? { ...card, source: 'https://developer.mozilla.org' }
          : card,
      ),
    )
  })

  it.each([
    ['json', BACKUP_LIMITS.bytes, 'text', /10 MiB/],
    ['zip', BACKUP_LIMITS.archiveBytes, 'arrayBuffer', /100 MiB/],
  ] as const)(
    'rejects oversized %s files before reading their contents',
    async (extension, limit, method, message) => {
      const file = new File([''], `backup.${extension}`)
      Object.defineProperty(file, 'size', { value: limit + 1 })
      const read = vi.spyOn(file, method)
      await expect(parseBackupFile(file)).rejects.toThrow(message)
      expect(read).not.toHaveBeenCalled()
    },
  )

  it('round-trips all content, IDs, tags, timestamps, code and revisions', () => {
    expect(parseBackup(serializeBackup(cards))).toEqual(cards)
    expect(JSON.parse(serializeBackup(cards)).schemaVersion).toBe(1)
  })

  it('returns independent card and tag objects', () => {
    const parsed = parseBackup(serializeBackup(cards))
    parsed[0].tags.push('独立副本')
    expect(cards[0].tags).not.toContain('独立副本')
  })

  it.each(['', 'not-json', 'null', '[]', '{}'])(
    'rejects incomplete or malformed input: %j',
    (text) => {
      expect(() => parseBackup(text)).toThrow()
    },
  )

  it('rejects unknown schema versions and unexpected fields', () => {
    expect(() =>
      parseBackup(JSON.stringify({ ...backup(), schemaVersion: 2 })),
    ).toThrow(/版本/)
    expect(() =>
      parseBackup(JSON.stringify({ ...backup(), extra: true })),
    ).toThrow(/字段/)
    const input = backup()
    input.cards[0].extra = true
    expect(() => parseBackup(JSON.stringify(input))).toThrow(/字段/)
  })

  it.each([
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
  ])('requires %s on every card', (field) => {
    const input = backup()
    delete input.cards[0][field]
    expect(() => parseBackup(JSON.stringify(input))).toThrow(/字段/)
  })

  it('rejects duplicate card IDs and duplicate tags', () => {
    const input = backup()
    input.cards[1].id = input.cards[0].id
    expect(() => parseBackup(JSON.stringify(input))).toThrow(/重复.*ID/)
    input.cards[1].id = 'unique'
    input.cards[0].tags = ['CSS', 'CSS']
    expect(() => parseBackup(JSON.stringify(input))).toThrow(/标签不能重复/)
  })

  it.each([0, -1, 1.5, '1', Number.MAX_SAFE_INTEGER + 1])(
    'rejects an invalid revision: %s',
    (revision) => {
      const input = backup()
      input.cards[0].revision = revision
      expect(() => parseBackup(JSON.stringify(input))).toThrow(/版本号/)
    },
  )

  it('rejects impossible and reversed timestamps', () => {
    const input = backup()
    input.cards[0].createdAt = '2026-02-30T00:00:00.000Z'
    expect(() => parseBackup(JSON.stringify(input))).toThrow(/有效时间/)
    input.cards[0].createdAt = '2027-01-01T00:00:00.000Z'
    expect(() => parseBackup(JSON.stringify(input))).toThrow(/早于/)
  })

  it('rejects invalid tags and overlong fields', () => {
    for (const tags of [
      null,
      'css',
      [''],
      [7],
      Array.from({ length: 25 }, (_, i) => String(i)),
    ]) {
      const input = backup()
      input.cards[0].tags = tags
      expect(() => parseBackup(JSON.stringify(input))).toThrow(/标签/)
    }
    const input = backup()
    input.cards[0].title = 'a'.repeat(BACKUP_LIMITS.title + 1)
    expect(() => parseBackup(JSON.stringify(input))).toThrow(/标题/)
  })

  it('enforces UTF-8 file size and card count before importing', () => {
    expect(() =>
      parseBackup('中'.repeat(Math.floor(BACKUP_LIMITS.bytes / 3) + 1)),
    ).toThrow(/10 MiB/)
    const input = backup()
    input.cards = Array.from({ length: BACKUP_LIMITS.cards + 1 }, (_, id) => ({
      ...cards[0],
      id: String(id),
      body: '',
      html: '',
      css: '',
      js: '',
    }))
    expect(() => parseBackup(JSON.stringify(input))).toThrow(/5000/)
  })

  it('allows only empty or HTTP(S) source links', () => {
    for (const url of [
      '',
      'https://example.com/path?q=hello#notes',
      'http://localhost:5173',
    ]) {
      expect(validateSource(url)).toBe(true)
    }
    for (const url of [
      'javascript:alert(1)',
      'data:text/html,hello',
      'file:///etc/passwd',
      '//example.com',
      'example.com',
    ]) {
      expect(validateSource(url)).toBe(false)
      const input = backup()
      input.cards[0].source = url
      expect(() => parseBackup(JSON.stringify(input))).toThrow(/来源链接/)
    }
  })
})
