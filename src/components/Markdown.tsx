import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { highlightParts } from '../lib/search'

export function Highlight({ text, query }: { text: string; query: string }) {
  return (
    <>
      {highlightParts(text, query).map((part, index) =>
        part.match ? <mark key={index}>{part.text}</mark> : part.text,
      )}
    </>
  )
}

export function Markdown({ body }: { body: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
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
}
