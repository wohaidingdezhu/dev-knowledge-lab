import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { strToU8, unzipSync, zipSync } from 'fflate'
import {
  createArchive,
  createBackupFile,
  parseArchive,
  parseBackupFile,
} from '../src/lib/backup'
import { makeSeedCards } from '../src/lib/seeds'
import { KnowledgeDB } from '../src/lib/db'
import type { Card } from '../src/lib/types'

const sample = makeSeedCards('2026-09-25T00:00:00.000Z')
const largeCards = (): Card[] =>
  Array.from({ length: 25 }, (_, index) => ({
    ...sample[0],
    id: `large-${index}`,
    title: `大备份 ${index}`,
    body: `${index}:` + 'x'.repeat(500_000 - `${index}:`.length),
    tags: [...sample[0].tags],
  }))

describe('v2 portable ZIP archive', () => {
  it('automatically switches above 10 MiB and round-trips every field across parts', async () => {
    const incoming = largeCards()
    const backup = await createBackupFile(incoming)
    expect(backup.extension).toBe('zip')
    const restored = await parseBackupFile(
      new File([backup.data], 'backup.zip'),
    )
    expect(restored).toEqual(incoming)
    const files = unzipSync(new Uint8Array(await backup.data.arrayBuffer()))
    const manifest = JSON.parse(
      new TextDecoder().decode(files['manifest.json']),
    )
    expect(manifest.schemaVersion).toBe(2)
    expect(manifest.parts.length).toBeGreaterThan(1)
    const database = new KnowledgeDB(`archive-roundtrip-${crypto.randomUUID()}`)
    try {
      expect(await database.importCards(restored, 'skip')).toEqual({
        added: 25,
        skipped: 0,
      })
      expect(await database.importCards(restored, 'skip')).toEqual({
        added: 0,
        skipped: 25,
      })
      expect(
        (await database.cards.toArray()).sort((a, b) =>
          a.id.localeCompare(b.id),
        ),
      ).toEqual([...incoming].sort((a, b) => a.id.localeCompare(b.id)))
    } finally {
      await database.delete()
    }
  }, 30_000)

  it('keeps small backups as compatible v1 JSON', async () => {
    const backup = await createBackupFile(sample)
    expect(backup.extension).toBe('json')
    expect(
      await parseBackupFile(new File([backup.data], 'backup.json')),
    ).toEqual(sample)
  })

  it('rejects a missing or corrupted part before database import', async () => {
    const files = unzipSync(await createArchive(sample))
    const missing = { ...files }
    delete missing['parts/00001.json']
    await expect(parseArchive(zipSync(missing))).rejects.toThrow(/缺少|未声明/)
    const corrupted = { ...files, 'parts/00001.json': strToU8('[]') }
    await expect(parseArchive(zipSync(corrupted))).rejects.toThrow(/校验值/)
  })

  it('rejects unexpected files, unsupported versions and malformed archives', async () => {
    const files = unzipSync(await createArchive(sample))
    await expect(
      parseArchive(zipSync({ ...files, 'unexpected.txt': strToU8('hello') })),
    ).rejects.toThrow(/无效文件/)
    const badManifest = JSON.parse(
      new TextDecoder().decode(files['manifest.json']),
    )
    badManifest.schemaVersion = 99
    await expect(
      parseArchive(
        zipSync({
          ...files,
          'manifest.json': strToU8(JSON.stringify(badManifest)),
        }),
      ),
    ).rejects.toThrow(/版本/)
    await expect(parseArchive(strToU8('not a zip'))).rejects.toThrow(/无法解压/)
  })
})
