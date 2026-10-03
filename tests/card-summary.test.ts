import { describe, expect, it } from 'vitest'
import { summarizeCards } from '../src/lib/cardSummary'
import type { Card } from '../src/lib/types'

function card(id: string, overrides: Partial<Card> = {}): Card {
  return {
    id,
    title: 'Untitled',
    body: '',
    tags: [],
    source: '',
    html: '',
    css: '',
    js: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    revision: 1,
    ...overrides,
  }
}

describe('summarizeCards', () => {
  it('counts cards per exact tag, without double-counting repeated tags', () => {
    const records = [
      card('one', { tags: ['CSS', 'CSS', '__proto__'] }),
      card('two', { tags: ['CSS', 'css', 'CSS Grid', '中文'] }),
      card('three'),
    ]
    const { tags, tagCounts } = summarizeCards(records)
    expect(tagCounts).toEqual(
      new Map([
        ['CSS', 2],
        ['__proto__', 1],
        ['css', 1],
        ['CSS Grid', 1],
        ['中文', 1],
      ]),
    )
    expect(tags).toEqual(
      ['CSS', '__proto__', 'css', 'CSS Grid', '中文'].sort((a, b) =>
        a.localeCompare(b),
      ),
    )
    expect(records[0].tags).toEqual(['CSS', 'CSS', '__proto__'])
  })

  it('includes nonempty HTML, CSS and JavaScript in original card order', () => {
    const records = [
      card('whitespace', { html: ' \n', css: '\t', js: ' ' }),
      card('css', { css: ' body {} ' }),
      card('body-only', { body: '```js\nconsole.log(1)\n```' }),
      card('html', { html: '<div></div>' }),
      card('js', { js: '// A comment is also code content' }),
    ]
    expect(summarizeCards(records).codeCards).toEqual([
      records[1],
      records[3],
      records[4],
    ])
  })

  it('refreshes counts after edits and deletions, including an empty library', () => {
    const original = card('one', { tags: ['CSS'], css: 'body {}' })
    expect(summarizeCards([original]).tagCounts.get('CSS')).toBe(1)
    const edited = { ...original, tags: ['HTML'], css: '' }
    expect(summarizeCards([edited])).toEqual({
      tags: ['HTML'],
      tagCounts: new Map([['HTML', 1]]),
      codeCards: [],
    })
    expect(summarizeCards([])).toEqual({
      tags: [],
      tagCounts: new Map(),
      codeCards: [],
    })
  })
})
