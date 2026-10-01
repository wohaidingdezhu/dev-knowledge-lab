import { unzip } from 'fflate'
import { BACKUP_LIMITS } from './backup'
import { parseFullBackupFile } from './fullBackup'
import { readPortableBackupFile } from './workspaceBackup'
import type { FullSnapshot, WorkspaceData } from './types'

export type ImportedBackup =
  | { kind: 'full'; snapshot: FullSnapshot }
  | { kind: 'portable'; workspace: WorkspaceData; complete: boolean }

async function isFullArchive(file: File): Promise<boolean> {
  if (file.size > BACKUP_LIMITS.archiveBytes)
    throw new Error('归档文件超过 100 MiB 上限。')
  const bytes = new Uint8Array(await file.arrayBuffer())
  let manifestCount = 0
  let invalidManifest = false
  const files = await new Promise<Record<string, Uint8Array>>(
    (resolve, reject) => {
      unzip(
        bytes,
        {
          filter(info) {
            if (info.name !== 'manifest.json') return false
            manifestCount++
            if (
              !Number.isSafeInteger(info.originalSize) ||
              info.originalSize < 0 ||
              info.originalSize > BACKUP_LIMITS.partBytes
            ) {
              invalidManifest = true
              return false
            }
            return true
          },
        },
        (error, contents) =>
          error
            ? reject(new Error('备份归档无法解压或已损坏。'))
            : resolve(contents),
      )
    },
  )
  if (invalidManifest || manifestCount !== 1 || !files['manifest.json'])
    throw new Error('备份归档缺少有效清单。')
  let manifest: unknown
  try {
    manifest = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(files['manifest.json']),
    )
  } catch {
    throw new Error('备份归档清单不是有效的 JSON。')
  }
  return (
    manifest !== null &&
    typeof manifest === 'object' &&
    !Array.isArray(manifest) &&
    'format' in manifest &&
    manifest.format === 'pianduan-full-archive'
  )
}

/** Identify the archive, then let its format-specific parser verify every record. */
export async function readAnyBackupFile(file: File): Promise<ImportedBackup> {
  if (/\.zip$/i.test(file.name) && (await isFullArchive(file)))
    return { kind: 'full', snapshot: await parseFullBackupFile(file) }
  const parsed = await readPortableBackupFile(file)
  return { kind: 'portable', ...parsed }
}
