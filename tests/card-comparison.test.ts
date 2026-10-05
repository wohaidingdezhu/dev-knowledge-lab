import { describe, expect, it } from 'vitest'
import {
  compareCardContent,
  comparisonPreview,
  MAX_COMPARISON_PREVIEW,
} from '../src/lib/cardComparison'
import { makeSeedCards } from '../src/lib/seeds'

describe('card content comparison', () => {
  it('ignores revision metadata and tag ordering when content is unchanged', () => {
    const before = makeSeedCards()[0]
    const after = {
      ...before,
      id: 'other',
      revision: 9,
      updatedAt: '2026-10-04T00:00:00.000Z',
      tags: [...before.tags].reverse(),
    }
    expect(compareCardContent(before, after)).toEqual({
      changes: [],
      addedTags: [],
      removedTags: [],
    })
  })

  it('reports each edited field and exact tag additions/removals', () => {
    const before = {
      ...makeSeedCards()[0],
      tags: ['CSS', 'css', 'CSS'],
      css: ' \n',
    }
    const after = {
      ...before,
      title: '标题变化',
      body: '<script>原文</script>',
      tags: ['css', 'DOM'],
      source: '',
      html: '',
      css: '',
      js: '// new',
    }
    const result = compareCardContent(before, after)
    expect(result.changes.map(({ field }) => field)).toEqual([
      'title',
      'tags',
      'source',
      'body',
      'html',
      'css',
      'js',
    ])
    expect(result.addedTags).toEqual(['DOM'])
    expect(result.removedTags).toEqual(['CSS'])
    expect(result.changes.find(({ field }) => field === 'body')?.after).toBe(
      after.body,
    )
    expect(result.changes.find(({ field }) => field === 'css')?.before).toBe(
      ' \n',
    )
  })

  it('isolates insertion, deletion and replacement without losing Unicode characters', () => {
    expect(comparisonPreview('a😃z', 'a😄z').before.changed).toBe('😃')
    expect(comparisonPreview('a😃z', 'a😄z').after.changed).toBe('😄')
    const added = comparisonPreview('ab', 'axb')
    expect(added.before.changed).toBe('')
    expect(added.after.changed).toBe('x')
    const removed = comparisonPreview('abc', '')
    expect(removed.before.changed).toBe('abc')
    expect(removed.after).toMatchObject({
      leading: '',
      changed: '',
      trailing: '',
    })
    expect(comparisonPreview('a\r\nb', 'a\nb').before.changed).toBe('\r')
    expect(comparisonPreview('', '').after.changed).toBe('')
  })

  it('focuses a late change in a large note and bounds each excerpt', () => {
    const prefix = '相同正文\n'.repeat(50000)
    const suffix = '\n后续相同'.repeat(10000)
    const preview = comparisonPreview(
      prefix + '旧内容' + suffix,
      prefix + '新内容' + suffix,
    )
    expect(preview.before.changed).toBe('旧')
    expect(preview.after.changed).toBe('新')
    for (const excerpt of [preview.before, preview.after]) {
      expect(excerpt.truncatedBefore).toBe(true)
      expect(excerpt.truncatedAfter).toBe(true)
      expect(excerpt.line).toBeGreaterThan(49000)
      expect(
        (excerpt.leading + excerpt.changed + excerpt.trailing).length,
      ).toBeLessThanOrEqual(MAX_COMPARISON_PREVIEW)
    }
  })

  it('bounds completely different large content and preserves preview boundaries', () => {
    const preview = comparisonPreview('😃'.repeat(100000), '😄'.repeat(100000))
    expect(preview.before.changed).toBe('😃'.repeat(MAX_COMPARISON_PREVIEW / 2))
    expect(preview.after.changed).toBe('😄'.repeat(MAX_COMPARISON_PREVIEW / 2))
    expect(preview.before.truncatedAfter).toBe(true)
    expect(preview.before.truncatedBefore).toBe(false)
  })
})
