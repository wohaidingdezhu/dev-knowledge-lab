import type { Card } from './types'

const fields = [
  ['title', '标题'],
  ['tags', '标签'],
  ['source', '来源'],
  ['body', '正文'],
  ['html', 'HTML'],
  ['css', 'CSS'],
  ['js', 'JavaScript'],
] as const

type ContentChange = {
  field: (typeof fields)[number][0]
  label: string
  before: string
  after: string
}

export function compareCardContent(before: Card, after: Card) {
  const previousTags = new Set(before.tags)
  const currentTags = new Set(after.tags)
  const addedTags = [...currentTags].filter((tag) => !previousTags.has(tag))
  const removedTags = [...previousTags].filter((tag) => !currentTags.has(tag))
  const changes = fields.flatMap<ContentChange>(([field, label]) => {
    if (field === 'tags')
      return addedTags.length || removedTags.length
        ? [
            {
              field,
              label,
              before: before.tags.join('、'),
              after: after.tags.join('、'),
            },
          ]
        : []
    return before[field] === after[field]
      ? []
      : [{ field, label, before: before[field], after: after[field] }]
  })
  return { changes, addedTags, removedTags }
}

export const MAX_COMPARISON_PREVIEW = 6000
const CONTEXT = 160
const lowSurrogate = (code: number) => code >= 0xdc00 && code <= 0xdfff

/** Linear prefix/suffix comparison; no quadratic diff matrix for large notes. */
export function comparisonPreview(before: string, after: string) {
  let prefix = 0
  while (
    prefix < before.length &&
    prefix < after.length &&
    before[prefix] === after[prefix]
  )
    prefix++
  if (
    prefix > 0 &&
    (lowSurrogate(before.charCodeAt(prefix)) ||
      lowSurrogate(after.charCodeAt(prefix)))
  )
    prefix--
  let suffix = 0
  while (
    suffix < before.length - prefix &&
    suffix < after.length - prefix &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  )
    suffix++
  if (
    suffix &&
    (lowSurrogate(before.charCodeAt(before.length - suffix)) ||
      lowSurrogate(after.charCodeAt(after.length - suffix)))
  )
    suffix--

  const excerpt = (text: string) => {
    let start = Math.max(0, prefix - CONTEXT)
    const changedEnd = text.length - suffix
    let end = Math.min(
      text.length,
      changedEnd + CONTEXT,
      start + MAX_COMPARISON_PREVIEW,
    )
    if (lowSurrogate(text.charCodeAt(start))) start++
    if (lowSurrogate(text.charCodeAt(end))) end--
    let line = 1
    for (
      let newline = text.indexOf('\n');
      newline >= 0 && newline < start;
      newline = text.indexOf('\n', newline + 1)
    )
      line++
    return {
      leading: text.slice(start, Math.min(prefix, end)),
      changed: text.slice(Math.max(start, prefix), Math.min(changedEnd, end)),
      trailing: text.slice(Math.max(start, changedEnd), end),
      truncatedBefore: start > 0,
      truncatedAfter: end < text.length,
      line,
    }
  }
  return { before: excerpt(before), after: excerpt(after) }
}

export const cardContents = (card: Card) =>
  `标题：${card.title}\n标签：${card.tags.join('、') || '无'}\n来源：${card.source || '无'}\n\n正文：\n${card.body}\n\nHTML：\n${card.html}\n\nCSS：\n${card.css}\n\nJavaScript：\n${card.js}`
