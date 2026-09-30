import 'fake-indexeddb/auto'
import { describe, expect, it, vi } from 'vitest'
import { strToU8, unzipSync, zipSync } from 'fflate'
import { createBackupFile } from '../src/lib/backup'
import { KnowledgeDB } from '../src/lib/db'
import { makeSeedCards } from '../src/lib/seeds'
import {
  createWorkspaceBackupFile,
  readPortableBackupFile,
  validateWorkspace,
} from '../src/lib/workspaceBackup'
import type { WorkspaceData } from '../src/lib/types'

const sample = makeSeedCards('2026-09-25T00:00:00.000Z')
const workspace = (): WorkspaceData => ({
  cards: [sample[0]],
  history: [
    {
      id: 'history-1',
      cardId: sample[0].id,
      card: { ...sample[0], body: '旧正文' },
      recordedAt: sample[0].updatedAt,
    },
  ],
  trash: [
    {
      id: sample[1].id,
      card: sample[1],
      deletedAt: sample[1].updatedAt,
    },
  ],
})

describe('complete workspace backups', () => {
  it('round-trips cards, history and trash in v3 JSON', async () => {
    const original = workspace()
    const backup = await createWorkspaceBackupFile(original)
    expect(backup.extension).toBe('json')
    const parsed = await readPortableBackupFile(
      new File([backup.data], 'workspace.json'),
    )
    expect(parsed).toEqual({ workspace: original, complete: true })
  })

  it('round-trips a multi-part v3 ZIP and rejects missing or corrupted parts', async () => {
    const original = workspace()
    original.cards[0] = {
      ...original.cards[0],
      body: 'x'.repeat(500_000),
    }
    original.cards.push(
      ...Array.from({ length: 24 }, (_, index) => ({
        ...sample[0],
        id: `large-${index}`,
        body: `${index}` + 'x'.repeat(500_000 - String(index).length),
      })),
    )
    const backup = await createWorkspaceBackupFile(original)
    expect(backup.extension).toBe('zip')
    const file = new File([backup.data], 'workspace.zip')
    expect(await readPortableBackupFile(file)).toEqual({
      workspace: original,
      complete: true,
    })
    const files = unzipSync(new Uint8Array(await backup.data.arrayBuffer()))
    const manifest = JSON.parse(
      new TextDecoder().decode(files['manifest.json']),
    )
    expect(manifest.schemaVersion).toBe(3)
    expect(manifest.parts.length).toBeGreaterThan(1)
    const part = manifest.parts[0].name as string
    const missing = { ...files }
    delete missing[part]
    await expect(
      readPortableBackupFile(new File([zipSync(missing)], 'missing.zip')),
    ).rejects.toThrow(/分块列表|缺少/)
    await expect(
      readPortableBackupFile(
        new File([zipSync({ ...files, [part]: strToU8('[]') })], 'broken.zip'),
      ),
    ).rejects.toThrow(/校验值/)
  }, 30_000)

  it('rejects inconsistent history and trash references', () => {
    const original = workspace()
    expect(() =>
      validateWorkspace({
        ...original,
        history: [{ ...original.history[0], cardId: 'missing' }],
      }),
    ).toThrow(/所属卡片/)
    expect(() =>
      validateWorkspace({
        ...original,
        trash: [{ ...original.trash[0], id: original.cards[0].id }],
      }),
    ).toThrow(/ID 冲突/)
  })

  it('still reads legacy v1 JSON and v2 ZIP as card-only imports', async () => {
    for (const count of [1, 25]) {
      const cards = Array.from({ length: count }, (_, index) => ({
        ...sample[0],
        id: `legacy-${index}`,
        body: count === 25 ? 'x'.repeat(500_000) : sample[0].body,
      }))
      const backup = await createBackupFile(cards)
      const parsed = await readPortableBackupFile(
        new File([backup.data], `legacy.${backup.extension}`),
      )
      expect(parsed).toEqual({
        workspace: { cards, history: [], trash: [] },
        complete: false,
      })
    }
  }, 30_000)

  it('replaces every table atomically, rejects stale state and rolls back a failed write', async () => {
    const db = new KnowledgeDB(`workspace-test-${crypto.randomUUID()}`)
    try {
      await db.loadCards()
      const baseline = await db.workspaceMarker()
      const original = await db.exportWorkspace()
      const restored = workspace()
      await db.replaceWorkspace(restored, baseline)
      expect(await db.exportWorkspace()).toEqual(restored)
      await expect(db.replaceWorkspace(original, baseline)).rejects.toThrow(
        /其他页面变化/,
      )
      expect(await db.exportWorkspace()).toEqual(restored)

      const current = await db.workspaceMarker()
      const write = vi
        .spyOn(db.history, 'bulkAdd')
        .mockRejectedValueOnce(new Error('write failure'))
      await expect(
        db.replaceWorkspace(
          { ...original, history: restored.history },
          current,
        ),
      ).rejects.toThrow(/write failure/)
      write.mockRestore()
      expect(await db.exportWorkspace()).toEqual(restored)

      const duplicate = {
        ...restored,
        history: [...restored.history, restored.history[0]],
      }
      await expect(db.replaceWorkspace(duplicate, current)).rejects.toThrow()
      expect(await db.exportWorkspace()).toEqual(restored)
    } finally {
      await db.delete()
    }
  })
})
