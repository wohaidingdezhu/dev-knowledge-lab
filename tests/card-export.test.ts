import { describe, expect, it } from 'vitest'
import { strFromU8, unzipSync } from 'fflate'
import {
  cardExportName,
  cardMarkdown,
  createCardExport,
} from '../src/lib/cardExport'
import { makeSeedCards } from '../src/lib/seeds'

describe('single-card exports', () => {
  it('uses portable filenames without paths, device names or broken Unicode', () => {
    expect(cardExportName('../../知识:笔记\\示例?')).toBe('_.._知识_笔记_示例_')
    expect(cardExportName('CON')).toBe('_CON')
    expect(cardExportName('lpt9.txt')).toBe('_lpt9.txt')
    expect(cardExportName('  ... ')).toBe('知识卡片')
    expect(cardExportName('😃'.repeat(100))).toBe('😃'.repeat(40))
    expect(cardExportName('中'.repeat(200))).toBe('中'.repeat(53))
    expect(cardExportName('a\u0000b')).toBe('a_b')
  })

  it('keeps Markdown body verbatim and treats metadata as plain text', async () => {
    const card = {
      ...makeSeedCards()[0],
      title: '# 标题 [链接]\n下一行',
      body: '## 正文\r\n\r\n```js\r\nconsole.log("中文")\r\n```',
      tags: ['[标签]', '<tag>'],
      source: '尚未完成的来源',
    }
    const text = cardMarkdown(card)
    expect(text.startsWith('# \\# 标题 \\[链接\\] 下一行\n\n')).toBe(true)
    expect(text).toContain(card.body)
    expect(text).toContain('标签：\\[标签\\]、\\<tag\\>')
    expect(text).toContain('来源：尚未完成的来源')
    const file = await createCardExport(card, 'markdown')
    expect(file.data.type).toBe('text/markdown;charset=utf-8')
    expect(await file.data.text()).toBe(text)
    expect(file.filename.endsWith('.md')).toBe(true)
  })

  it('exports exact source bytes and empty files using fixed archive paths', async () => {
    const card = {
      ...makeSeedCards()[0],
      title: '../源码',
      body: '保留草稿正文',
      html: '<p>原始片段</p>\r\n<!-- </script> -->',
      css: '',
      js: 'console.log("中文");\r\n// source\n',
    }
    const file = await createCardExport(card, 'source')
    const contents = unzipSync(new Uint8Array(await file.data.arrayBuffer()))
    expect(Object.keys(contents).sort()).toEqual([
      'README.md',
      'index.html',
      'script.js',
      'style.css',
    ])
    expect(strFromU8(contents['index.html'])).toBe(card.html)
    expect(strFromU8(contents['style.css'])).toBe('')
    expect(strFromU8(contents['script.js'])).toBe(card.js)
    expect(strFromU8(contents['README.md'])).toContain(card.body)
    expect(file.filename).toBe('_源码-source.zip')
    expect(file.data.type).toBe('application/zip')
  })
})
