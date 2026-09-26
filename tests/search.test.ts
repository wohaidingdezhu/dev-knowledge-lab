import { describe, expect, it } from 'vitest'
import { highlightParts, searchCards } from '../src/lib/search'
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
    createdAt: '2026-09-20T00:00:00.000Z',
    updatedAt: '2026-09-20T00:00:00.000Z',
    revision: 1,
    ...overrides,
  }
}

describe('searchCards', () => {
  it('finds Chinese and case-insensitive English across multiple fields with AND tokens', () => {
    const expected = card('one', {
      title: 'React 状态管理',
      body: '异步更新容易踩坑',
      tags: ['Hooks'],
      js: 'useEffect(() => {});',
    })
    const other = card('two', { title: 'React 状态管理', body: '同步更新' })
    expect(
      searchCards([expected, other], 'react 异步 HOOKS useeffect', null),
    ).toEqual([
      { card: expected, matchField: 'title', snippet: 'useEffect(() => {});' },
    ])
    expect(searchCards([expected], 'react missing', null)).toEqual([])
  })

  it('filters by the exact tag, independently of the keyword query', () => {
    const records = [
      card('one', { tags: ['CSS'] }),
      card('two', { tags: ['CSS Grid'] }),
      card('three', { tags: ['css'] }),
    ]
    expect(
      searchCards(records, '', 'CSS').map(({ card: item }) => item.id),
    ).toEqual(['one'])
    expect(searchCards(records, 'grid', 'CSS')).toEqual([])
    expect(searchCards(records, 'css', null)).toHaveLength(3)
  })

  it('ranks title, tag, body, and code matches in that order', () => {
    const records = [
      card('code', { js: 'const grid = true;' }),
      card('body', { body: 'A grid layout' }),
      card('tag', { tags: ['grid'] }),
      card('title', { title: 'CSS grid' }),
    ]
    expect(
      searchCards(records, 'grid', null).map(({ card: item, matchField }) => [
        item.id,
        matchField,
      ]),
    ).toEqual([
      ['title', 'title'],
      ['tag', 'tags'],
      ['body', 'body'],
      ['code', 'code'],
    ])
  })

  it('sorts an empty query by latest update and preserves input order for ties', () => {
    const records = [
      card('first'),
      card('newest', { updatedAt: '2026-09-25T00:00:00.000Z' }),
      card('third'),
    ]
    const results = searchCards(records, ' \n\t ', null)
    expect(results.map(({ card: item }) => item.id)).toEqual([
      'newest',
      'first',
      'third',
    ])
    expect(results.every(({ matchField }) => matchField === null)).toBe(true)
  })

  it('extracts relevant code context from HTML, CSS, and JavaScript', () => {
    const records = [
      card('html', { html: '<button aria-label="save">保存</button>' }),
      card('css', { css: ':root { --accent: purple; }' }),
      card('js', {
        js: `${'// Setup example\n'.repeat(30)}throw new Error("needle");\nconsole.log("done");`,
      }),
    ]
    expect(searchCards(records, 'aria-label', null)[0].matchField).toBe('code')
    expect(searchCards(records, '--accent', null)[0].matchField).toBe('code')
    const result = searchCards(records, 'needle', null)[0]
    expect(result.snippet).toContain('throw new Error("needle")')
    expect(result.snippet.startsWith('…')).toBe(true)
    expect(result.snippet.length).toBeLessThanOrEqual(152)
  })

  it('shows code context when different query terms match the title and code', () => {
    const record = card('one', {
      title: 'Event listeners',
      body: '绑定点击处理函数。',
      js: `// Event setup\n${'// Setup\n'.repeat(30)}button.addEventListener("click", handleClick);`,
    })
    const result = searchCards([record], 'event handleclick', null)[0]
    expect(result.matchField).toBe('title')
    expect(result.snippet).toContain('handleClick')
  })

  it('provides readable Markdown snippets and does not index source URLs', () => {
    const record = card('one', {
      body: '# 标题\n\n- **重点**和 `const`\n\n[参考](https://example.org)\n```js\nlet x = 1;\n```',
      source: 'https://unique-source.example',
    })
    expect(searchCards([record], '', null)[0].snippet).toBe(
      '标题 重点和 const 参考 let x = 1;',
    )
    expect(searchCards([record], 'unique-source', null)).toEqual([])
  })

  it('searches regex punctuation literally and treats duplicate terms as one token', () => {
    const records = [
      card('one', { body: '调用 a+b [x] foo.bar?' }),
      card('two', { body: '调用 aaab x fooXbar' }),
    ]
    expect(
      searchCards(records, 'a+b [x]', null).map(({ card: item }) => item.id),
    ).toEqual(['one'])
    expect(searchCards(records, 'a+b a+b', null)).toEqual(
      searchCards(records, 'a+b', null),
    )
  })
})

describe('highlightParts', () => {
  it('highlights Chinese and English without losing the original case or text', () => {
    const text = 'React 和响应式 REACT'
    const parts = highlightParts(text, 'react 响应式')
    expect(parts.filter((part) => part.match).map((part) => part.text)).toEqual(
      ['React', '响应式', 'REACT'],
    )
    expect(parts.map((part) => part.text).join('')).toBe(text)
  })

  it('escapes regex special characters and leaves HTML as plain text', () => {
    const text = '<script>a+b [x] .* ? (y) $ ^ \\</script>'
    const parts = highlightParts(text, 'a+b [x] .* ? (y) $ ^ \\')
    expect(parts.filter((part) => part.match).map((part) => part.text)).toEqual(
      ['a+b', '[x]', '.*', '?', '(y)', '$', '^', '\\'],
    )
    expect(parts.map((part) => part.text).join('')).toBe(text)
    expect(parts[0]).toEqual({ text: '<script>', match: false })
  })

  it('prefers the longest token at a shared starting position', () => {
    expect(highlightParts('typescript types', 'type types typescript')).toEqual(
      [
        { text: 'typescript', match: true },
        { text: ' ', match: false },
        { text: 'types', match: true },
      ],
    )
  })

  it('handles an empty query, missing matches, and empty content', () => {
    expect(highlightParts('hello', '   ')).toEqual([
      { text: 'hello', match: false },
    ])
    expect(highlightParts('hello', 'world')).toEqual([
      { text: 'hello', match: false },
    ])
    expect(highlightParts('', 'hello')).toEqual([])
  })
})
