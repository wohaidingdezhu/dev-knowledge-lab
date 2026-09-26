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
