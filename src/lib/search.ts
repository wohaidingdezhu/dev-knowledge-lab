import type { Card } from './types'

export type SearchResult = {
  card: Card
  matchField: 'title' | 'body' | 'code' | 'tags' | null
  snippet: string
}

export type HighlightPart = { text: string; match: boolean }

const SNIPPET_LENGTH = 150

function tokensFor(query: string): string[] {
  return [...new Set(query.trim().toLowerCase().split(/\s+/u).filter(Boolean))]
}

function plainMarkdown(markdown: string): string {
  return markdown
    .replace(/^\s*(```|~~~)[^\n]*$/gm, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(?:#{1,6}\s+|>\s?|[-+*]\s+|\d+\.\s+)/gm, '')
    .replace(/(?:\*\*|__|~~|`)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function snippetAround(text: string, tokens: string[]): string {
  const compact = text.replace(/\s+/g, ' ').trim()
  if (compact.length <= SNIPPET_LENGTH) return compact
  const lower = compact.toLowerCase()
  const matches = tokens
    .map((token) => lower.indexOf(token))
    .filter((index) => index >= 0)
  const firstMatch = matches.length ? Math.min(...matches) : 0
  const start = Math.max(0, firstMatch - 45)
  const end = Math.min(compact.length, start + SNIPPET_LENGTH)
  return `${start > 0 ? '…' : ''}${compact.slice(start, end)}${end < compact.length ? '…' : ''}`
}

function timestamp(value: Card['updatedAt']): number {
  const date = typeof value === 'number' ? value : Date.parse(value)
  return Number.isFinite(date) ? date : 0
}

/** All tokens must occur, but may occur in different fields. Source URLs are not indexed. */
export function searchCards(
  cards: Card[],
  query: string,
  tag: string | null,
): SearchResult[] {
  const tokens = tokensFor(query)
  if (!tokens.length) {
    return cards
      .filter((card) => tag === null || card.tags.includes(tag))
      .sort(
        (left, right) => timestamp(right.updatedAt) - timestamp(left.updatedAt),
      )
      .map((card) => ({
        card,
        matchField: null,
        snippet: snippetAround(
          plainMarkdown(card.body.slice(0, 500)) ||
            [card.html, card.css, card.js].join('\n').slice(0, 500),
          [],
        ),
      }))
  }
  const results: (SearchResult & { relevance: number[]; index: number })[] = []

  cards.forEach((card, index) => {
    if (tag !== null && !card.tags.includes(tag)) return
    const code = [card.html, card.css, card.js].join('\n')
    const fields = [card.title, card.tags.join('\n'), card.body, code].map(
      (field) => field.toLowerCase(),
    )
    const tokenFields = tokens.map((token) =>
      fields.findIndex((field) => field.includes(token)),
    )
    if (tokenFields.some((field) => field < 0)) return

    // Compare title matches first, then tags, body, and code. A title match remains
    // more relevant than any number of matches confined to lower-priority fields.
    const relevance = fields.map(
      (_, fieldIndex) =>
        tokenFields.filter((field) => field === fieldIndex).length,
    )
    const firstField = tokenFields.length ? Math.min(...tokenFields) : -1
    const fieldNames = ['title', 'tags', 'body', 'code'] as const
    const matchField = firstField < 0 ? null : fieldNames[firstField]
    const body = plainMarkdown(card.body)
    const codeTokens = tokens.filter(
      (_, tokenIndex) => tokenFields[tokenIndex] === 3,
    )
    const snippet = tokenFields.includes(3)
      ? snippetAround(code, codeTokens)
      : snippetAround(
          body || (matchField === 'tags' ? card.tags.join(' · ') : code),
          tokens,
        )

    results.push({ card, matchField, snippet, relevance, index })
  })

  results.sort((left, right) => {
    for (let i = 0; i < left.relevance.length; i += 1) {
      const difference = right.relevance[i] - left.relevance[i]
      if (difference) return difference
    }
    return (
      timestamp(right.card.updatedAt) - timestamp(left.card.updatedAt) ||
      left.index - right.index
    )
  })

  return results.map(({ card, matchField, snippet }) => ({
    card,
    matchField,
    snippet,
  }))
}

/** Returns text segments for React rendering; never constructs HTML from user content. */
export function highlightParts(text: string, query: string): HighlightPart[] {
  if (!text) return []
  const tokens = tokensFor(query).sort(
    (left, right) => right.length - left.length,
  )
  if (!tokens.length) return [{ text, match: false }]
  const pattern = tokens
    .map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')
  const matcher = new RegExp(pattern, 'giu')
  const parts: HighlightPart[] = []
  let cursor = 0

  for (const match of text.matchAll(matcher)) {
    const position = match.index
    if (position > cursor)
      parts.push({ text: text.slice(cursor, position), match: false })
    parts.push({ text: match[0], match: true })
    cursor = position + match[0].length
  }
  if (cursor < text.length)
    parts.push({ text: text.slice(cursor), match: false })
  return parts
}
