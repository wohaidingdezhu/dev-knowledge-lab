import {
  Children,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'

export function MarkdownCodeBlock({ children }: { children?: ReactNode }) {
  const pre = useRef<HTMLPreElement>(null)
  const operation = useRef(0)
  const [status, setStatus] = useState<
    'idle' | 'copying' | 'copied' | 'failed'
  >('idle')
  const child = Children.toArray(children)[0]
  const language = isValidElement<{ className?: string }>(child)
    ? child.props.className?.match(/^language-(\S+)/)?.[1]
    : undefined
  useEffect(() => {
    setStatus('idle')
    return () => {
      operation.current++
    }
  }, [children])

  const copy = async () => {
    if (status === 'copying') return
    const text = pre.current?.textContent ?? ''
    const current = ++operation.current
    setStatus('copying')
    try {
      if (!navigator.clipboard?.writeText)
        throw new Error('Clipboard unavailable')
      await navigator.clipboard.writeText(text)
      if (current === operation.current) setStatus('copied')
    } catch {
      if (current === operation.current) setStatus('failed')
    }
  }
  const select = () => {
    if (!pre.current) return
    pre.current.focus()
    const range = document.createRange()
    range.selectNodeContents(pre.current)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
  }

  return (
    <div className="markdown-code-block" role="group" aria-label="代码片段">
      <div className="markdown-code-toolbar">
        <span>{language || '代码片段'}</span>
        {status === 'copied' && <span role="status">已复制</span>}
        <button
          type="button"
          className="secondary-button"
          aria-disabled={status === 'copying'}
          onClick={() => void copy()}
        >
          {status === 'copying' ? '正在复制…' : '复制代码'}
        </button>
        {status === 'failed' && (
          <button type="button" className="secondary-button" onClick={select}>
            选中代码
          </button>
        )}
      </div>
      {status === 'failed' && (
        <p className="field-error" role="alert">
          复制失败。可选中代码后手动复制，或重试。
        </p>
      )}
      <pre ref={pre} tabIndex={0} aria-label="代码片段内容">
        {children}
      </pre>
    </div>
  )
}
