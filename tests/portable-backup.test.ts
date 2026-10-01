import { expect, it } from 'vitest'
import { strToU8, unzipSync, zipSync } from 'fflate'
import { createBackupFile } from '../src/lib/backup'
import { createFullBackupFile } from '../src/lib/fullBackup'
import { readAnyBackupFile } from '../src/lib/portableBackup'
import { makeSeedCards } from '../src/lib/seeds'
import { createWorkspaceBackupFile } from '../src/lib/workspaceBackup'
import type { FullSnapshot } from '../src/lib/types'

it('identifies complete archives, current workspace files and legacy card files', async () => {
  const cards = makeSeedCards()
  const full: FullSnapshot = {
    format: 'pianduan-full-snapshot',
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    cards,
    history: [],
    trash: [],
    pins: [cards[0].id],
  }
  const fullFile = await createFullBackupFile(full)
  await expect(
    readAnyBackupFile(new File([fullFile], 'renamed.zip')),
  ).resolves.toEqual({ kind: 'full', snapshot: full })

  const workspace = await createWorkspaceBackupFile({
    cards,
    history: [],
    trash: [],
  })
  await expect(
    readAnyBackupFile(
      new File([workspace.data], `current.${workspace.extension}`),
    ),
  ).resolves.toMatchObject({
    kind: 'portable',
    complete: true,
    workspace: { cards },
  })

  const legacy = await createBackupFile(cards)
  await expect(
    readAnyBackupFile(new File([legacy.data], `legacy.${legacy.extension}`)),
  ).resolves.toMatchObject({
    kind: 'portable',
    complete: false,
    workspace: { cards },
  })

  const largeCards = Array.from({ length: 22 }, (_, index) => ({
    ...cards[0],
    id: `portable-large-${index}`,
    body: 'x'.repeat(500_000),
  }))
  const legacyZip = await createBackupFile(largeCards)
  expect(legacyZip.extension).toBe('zip')
  const older = await readAnyBackupFile(
    new File([legacyZip.data], 'legacy.zip'),
  )
  expect(older.kind).toBe('portable')
  if (older.kind === 'portable') {
    expect(older.complete).toBe(false)
    expect(older.workspace.cards).toHaveLength(22)
  }

  const workspaceZip = await createWorkspaceBackupFile({
    cards: largeCards,
    history: [],
    trash: [],
  })
  expect(workspaceZip.extension).toBe('zip')
  const current = await readAnyBackupFile(
    new File([workspaceZip.data], 'current.zip'),
  )
  expect(current.kind).toBe('portable')
  if (current.kind === 'portable') {
    expect(current.complete).toBe(true)
    expect(current.workspace.cards).toHaveLength(22)
  }
})

it('keeps full-archive checksum errors visible through the common importer', async () => {
  const cards = makeSeedCards()
  const full: FullSnapshot = {
    format: 'pianduan-full-snapshot',
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    cards,
    history: [],
    trash: [],
    pins: [],
  }
  const archive = await createFullBackupFile(full)
  const files = unzipSync(new Uint8Array(await archive.arrayBuffer()))
  const tampered = zipSync({ ...files, 'snapshot.json': strToU8('{}') })
  await expect(
    readAnyBackupFile(new File([tampered], 'damaged.zip')),
  ).rejects.toThrow(/校验失败/)
})

it('accepts a valid large manifest from a split v3 backup', async () => {
  const seed = makeSeedCards()[0]
  const files: Record<string, Uint8Array> = {}
  const parts = await Promise.all(
    Array.from({ length: 600 }, async (_, index) => {
      const name = `cards/${String(index + 1).padStart(5, '0')}.json`
      const content = strToU8(
        JSON.stringify([{ ...seed, id: `split-${index}` }]),
      )
      files[name] = content
      const hash = await crypto.subtle.digest('SHA-256', content)
      return {
        name,
        kind: 'cards',
        bytes: content.length,
        count: 1,
        sha256: [...new Uint8Array(hash)]
          .map((byte) => byte.toString(16).padStart(2, '0'))
          .join(''),
      }
    }),
  )
  const manifest = strToU8(
    JSON.stringify({
      format: 'pianduan-workspace',
      schemaVersion: 3,
      exportedAt: new Date().toISOString(),
      counts: { cards: 600, history: 0, trash: 0 },
      parts,
    }),
  )
  expect(manifest.length).toBeGreaterThan(64 * 1024)
  files['manifest.json'] = manifest
  const archive = zipSync(files)
  const parsed = await readAnyBackupFile(new File([archive], 'split.zip'))
  expect(parsed.kind).toBe('portable')
  if (parsed.kind === 'portable') {
    expect(parsed.complete).toBe(true)
    expect(parsed.workspace.cards).toHaveLength(600)
  }
})
