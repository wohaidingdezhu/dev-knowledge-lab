export interface Card {
  id: string
  title: string
  body: string
  tags: string[]
  source: string
  html: string
  css: string
  js: string
  createdAt: string
  updatedAt: string
  revision: number
}

export const schemaVersion = 1 as const

export interface BackupV1 {
  schemaVersion: typeof schemaVersion
  exportedAt: string
  cards: Card[]
}

export type ImportStrategy = 'skip' | 'copy'

export interface ImportResult {
  added: number
  skipped: number
}

export interface CardHistoryEntry {
  id: string
  cardId: string
  card: Card
  recordedAt: string
}

export interface DeletedCard {
  id: string
  card: Card
  deletedAt: string
}

export interface WorkspaceData {
  cards: Card[]
  history: CardHistoryEntry[]
  trash: DeletedCard[]
}

export type RestoreChoice = 'skip' | 'copy' | 'replace'
export interface RestoreDecision {
  choice: RestoreChoice
  expectedRevision: number
}

export interface RestoreResult extends ImportResult {
  replaced: number
}
