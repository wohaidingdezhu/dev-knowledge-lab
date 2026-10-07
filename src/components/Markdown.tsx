import {
  memo,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { highlightParts } from '../lib/search'
import { MarkdownCodeBlock } from './MarkdownCodeBlock'

export function Highlight({ text, query }: { text: string; query: string }) {
  return (
    <>
      {highlightParts(text, query).map((part, index) =>
        part.match ? <mark key={index}>{part.text}</mark> : part.text,
      )}
    </>
  )
}

// Keep outline state changes from reparsing an unchanged Markdown body.
const MarkdownBody = memo(function MarkdownBody({
  body,
  root,
}: {
  body: string
  root: RefObject<HTMLDivElement | null>
}) {
  return (
    <div className="markdown" ref={root}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          pre: ({ children }) => (
            <MarkdownCodeBlock>{children}</MarkdownCodeBlock>
          ),
          a: ({ href, children }) =>
            href && /^https?:\/\//i.test(href) ? (
              <a href={href} target="_blank" rel="noreferrer noopener">
                {children}
              </a>
            ) : (
              <span>{children}</span>
            ),
          img: ({ alt }) => (
            <span className="image-placeholder">
              [图片：{alt || '已省略远程资源'}]
            </span>
          ),
        }}
      >
        {body || '*还没有正文。切换到编辑，记下你的第一个发现。*'}
      </ReactMarkdown>
    </div>
  )
})

type Section = {
  id: string
  label: string
  level: number
  heading: HTMLHeadingElement
}
const OUTLINE_PAGE_SIZE = 100

export const Markdown = memo(function Markdown({ body }: { body: string }) {
  const prefix = useId()
  const root = useRef<HTMLDivElement>(null)
  const directory = useRef<HTMLDetailsElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const nextFocus = useRef<number | null>(null)
  const [sections, setSections] = useState<Section[]>([])
  const [visibleCount, setVisibleCount] = useState(OUTLINE_PAGE_SIZE)
  const [activeId, setActiveId] = useState<string | null>(null)

  useLayoutEffect(() => {
    const headings = root.current?.querySelectorAll<HTMLHeadingElement>(
      'h1, h2, h3, h4, h5, h6',
    )
    setSections(
      Array.from(headings ?? [], (heading, index) => {
        const id = `note-${prefix}-${index}`
        heading.id = id
        heading.tabIndex = -1
        const text =
          heading.textContent?.replace(/\s+/g, ' ').trim() || '未命名小节'
        const label =
          text.length > 160
            ? text.slice(0, 160).replace(/[\uD800-\uDBFF]$/, '') + '…'
            : text
        return { id, label, level: Number(heading.tagName.slice(1)), heading }
      }),
    )
    nextFocus.current = null
    setVisibleCount(OUTLINE_PAGE_SIZE)
    setActiveId(null)
  }, [body, prefix])

  useLayoutEffect(() => {
    if (nextFocus.current === null) return
    const button =
      list.current?.querySelectorAll<HTMLButtonElement>('button')[
        nextFocus.current
      ]
    nextFocus.current = null
    button?.focus({ preventScroll: true })
    button?.scrollIntoView({ block: 'nearest' })
  }, [visibleCount])

  const startLevel = sections.reduce(
    (level, section) => Math.min(level, section.level),
    6,
  )
  return (
    <div className="note-reader">
      {sections.length > 1 && (
        <details className="markdown-outline" ref={directory}>
          <summary>笔记目录 · {sections.length} 个小节</summary>
          <nav aria-label="笔记目录">
            <ul ref={list} id={`outline-${prefix}`}>
              {sections.slice(0, visibleCount).map((section) => (
                <li
                  key={section.id}
                  style={{
                    paddingInlineStart: `${(section.level - startLevel) * 12}px`,
                  }}
                >
                  <button
                    type="button"
                    aria-current={
                      activeId === section.id ? 'location' : undefined
                    }
                    onClick={() => {
                      if (directory.current) directory.current.open = false
                      section.heading.focus({ preventScroll: true })
                      section.heading.scrollIntoView({ block: 'start' })
                      setActiveId(section.id)
                    }}
                  >
                    {section.label}
                  </button>
                </li>
              ))}
            </ul>
            <div className="markdown-outline-footer">
              <span role="status">
                已显示 {Math.min(visibleCount, sections.length)} /{' '}
                {sections.length} 项
              </span>
              {visibleCount < sections.length && (
                <button
                  type="button"
                  className="secondary-button"
                  aria-controls={`outline-${prefix}`}
                  onClick={() => {
                    nextFocus.current = visibleCount
                    setVisibleCount((count) =>
                      Math.min(count + OUTLINE_PAGE_SIZE, sections.length),
                    )
                  }}
                >
                  显示更多目录项
                </button>
              )}
            </div>
          </nav>
        </details>
      )}
      <MarkdownBody body={body} root={root} />
    </div>
  )
})
