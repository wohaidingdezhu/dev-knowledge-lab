import type { Card } from './types'

export function summarizeCards(cards: Card[]) {
  const tagCounts = new Map<string, number>()
  const codeCards: Card[] = []

  for (const card of cards) {
    // Count cards, even if an imported record repeats a tag.
    for (const tag of new Set(card.tags)) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1)
    }
    if (card.html.trim() || card.css.trim() || card.js.trim()) {
      codeCards.push(card)
    }
  }

  const tags = [...tagCounts.keys()].sort((left, right) =>
    left.localeCompare(right),
  )
  return { tags, tagCounts, codeCards }
}
