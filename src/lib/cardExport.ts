import { strToU8, zip } from 'fflate'
import type { Card } from './types'

export type CardExportFormat = 'markdown' | 'source'

export function cardExportName(title: string): string {
  const cleaned = title
    .replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, '_')
    .trim()
    .replace(/^[. ]+|[. ]+$/g, '')
  const encoder = new TextEncoder()
  let bytes = 0
  let shortened = ''
  for (const character of Array.from(cleaned).slice(0, 80)) {
    bytes += encoder.encode(character).length
    if (bytes > 160) break
    shortened += character
  }
  const name = shortened.replace(/[. ]+$/g, '')
  if (!name) return '知识卡片'
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)
    ? `_${name}`
    : name
}

const plainText = (text: string) =>
  text.replace(/\r?\n/g, ' ').replace(/[\\`*_{}\[\]()#+.!<>|~-]/g, '\\$&')

export function cardMarkdown(card: Card): string {
  const metadata = [
    card.tags.length ? `标签：${card.tags.map(plainText).join('、')}` : '',
    card.source ? `来源：${plainText(card.source)}` : '',
  ].filter(Boolean)
  return `# ${plainText(card.title || '未命名卡片')}\n\n${card.body}${metadata.length ? `\n\n---\n\n${metadata.join('\n\n')}` : ''}\n`
}

/** Export a frozen in-memory card, including drafts that cannot yet be saved. */
export async function createCardExport(
  card: Card,
  format: CardExportFormat,
): Promise<{ data: Blob; filename: string }> {
  const name = cardExportName(card.title)
  const note = cardMarkdown(card)
  if (format === 'markdown')
    return {
      data: new Blob([note], { type: 'text/markdown;charset=utf-8' }),
      filename: `${name}.md`,
    }
  const bytes = await new Promise<Uint8Array>((resolve, reject) => {
    zip(
      {
        'README.md': strToU8(note),
        'index.html': strToU8(card.html),
        'style.css': strToU8(card.css),
        'script.js': strToU8(card.js),
      },
      { level: 6 },
      (error, data) => (error ? reject(error) : resolve(data)),
    )
  })
  return {
    data: new Blob([new Uint8Array(bytes)], { type: 'application/zip' }),
    filename: `${name}-source.zip`,
  }
}
