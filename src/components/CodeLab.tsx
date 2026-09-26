import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react'
import {
  Code2,
  FlaskConical,
  Play,
  RotateCcw,
  Terminal,
  TriangleAlert,
} from 'lucide-react'
import type { Card } from '../lib/types'
import {
  buildSandboxDocument,
  MAX_PREVIEW_MESSAGES,
  readSandboxMessage,
  type SandboxSource,
} from '../lib/sandbox'

interface CodeLabProps {
  card: Card
  onChange: (patch: Partial<Card>) => void
  disabled?: boolean
}

type Language = 'html' | 'css' | 'js'
type PreviewEntry = {
  level: 'log' | 'info' | 'warn' | 'error' | 'debug'
  text: string
}
type PreviewRun = {
  id: string
  cardId: string
  srcDoc: string
  source: SandboxSource
}
const languages: { id: Language; label: string; filename: string }[] = [
  { id: 'html', label: 'HTML', filename: 'index.html' },
  { id: 'css', label: 'CSS', filename: 'style.css' },
  { id: 'js', label: 'JavaScript', filename: 'script.js' },
]

export function CodeLab({ card, onChange, disabled = false }: CodeLabProps) {
  const [language, setLanguage] = useState<Language>('html')
  const [run, setRun] = useState<PreviewRun | null>(null)
  const [entries, setEntries] = useState<PreviewEntry[]>([])
  const [ready, setReady] = useState(false)
  const [limited, setLimited] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const linesRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const editorId = useId()
  const activeRun = run?.cardId === card.id ? run : null
  const activeFile = languages.find((item) => item.id === language)!
  const changedSinceRun =
    activeRun && languages.some(({ id }) => activeRun.source[id] !== card[id])
  const errorCount = entries.filter((entry) => entry.level === 'error').length

  useEffect(() => {
    setRun(null)
    setEntries([])
    setReady(false)
    setLimited(false)
  }, [card.id])

  useLayoutEffect(() => {
    if (!activeRun) return
    let count = 0
    const receive = (event: MessageEvent) => {
      const message = readSandboxMessage(
        event,
        iframeRef.current?.contentWindow ?? null,
        activeRun.id,
      )
      if (!message) return
      if (message.kind === 'ready') {
        setReady(true)
        return
      }
      if (message.kind === 'limit' || count >= MAX_PREVIEW_MESSAGES) {
        setLimited(true)
        return
      }
      count += 1
      const entry: PreviewEntry =
        message.kind === 'error'
          ? {
              level: 'error',
              text:
                message.text +
                (message.line
                  ? ` （第 ${message.line} 行${message.column ? `:${message.column}` : ''}）`
                  : ''),
            }
          : { level: message.level, text: message.text }
      setEntries((previous) => [...previous, entry])
    }
    window.addEventListener('message', receive)
    return () => window.removeEventListener('message', receive)
  }, [activeRun])

  function runExample() {
    if (disabled) return
    const id = crypto.randomUUID()
    const source = { html: card.html, css: card.css, js: card.js }
    setEntries([])
    setReady(false)
    setLimited(false)
    setRun({
      id,
      cardId: card.id,
      srcDoc: buildSandboxDocument(source, id, crypto.randomUUID()),
      source,
    })
  }

  function clearPreview() {
    setRun(null)
    setEntries([])
    setReady(false)
    setLimited(false)
  }

  function handleEditorKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault()
      runExample()
    }
  }

  function handleTabKey(
    event: KeyboardEvent<HTMLButtonElement>,
    current: number,
  ) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? languages.length - 1
          : (current +
              (event.key === 'ArrowRight' ? 1 : -1) +
              languages.length) %
            languages.length
    setLanguage(languages[next].id)
    document.getElementById(`${editorId}-tab-${languages[next].id}`)?.focus()
  }

  return (
    <section className="lab-panel" aria-labelledby={`${editorId}-heading`}>
      <header className="lab-header">
        <div className="lab-heading-group">
          <div className="lab-title">
            <FlaskConical size={17} />
            <h2 id={`${editorId}-heading`}>代码实验室</h2>
            <span className="lab-badge">LIVE</span>
          </div>
          <p className="lab-description">保存思路，也验证它。</p>
        </div>
        <div className="lab-actions">
          <button
            type="button"
            className="lab-button lab-reset"
            onClick={clearPreview}
            disabled={!activeRun}
            title="移除当前预览并清空控制台，保留源码"
          >
            <RotateCcw size={14} />
            <span>清空</span>
          </button>
          <button
            type="button"
            className="lab-button lab-run"
            onClick={runExample}
            disabled={disabled}
            title="运行代码（⌘ / Ctrl + Enter）"
          >
            <Play size={14} fill="currentColor" />
            运行代码
          </button>
        </div>
      </header>

      <p className="lab-run-notice">
        点击运行会执行当前代码；切换卡片与刷新不会自动执行。
      </p>

      <div className="lab-workspace">
        <div className="lab-source">
          <div className="lab-editor-toolbar">
            <div className="lab-tabs" role="tablist" aria-label="代码语言">
              {languages.map((item, index) => (
                <button
                  type="button"
                  key={item.id}
                  id={`${editorId}-tab-${item.id}`}
                  role="tab"
                  aria-selected={language === item.id}
                  aria-controls={`${editorId}-editor`}
                  tabIndex={language === item.id ? 0 : -1}
                  className={`lab-tab ${language === item.id ? 'is-active' : ''}`}
                  onClick={() => setLanguage(item.id)}
                  onKeyDown={(event) => handleTabKey(event, index)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <span className="lab-filename">{activeFile.filename}</span>
          </div>
          <div
            className="lab-code-editor"
            role="tabpanel"
            id={`${editorId}-editor`}
            aria-labelledby={`${editorId}-tab-${language}`}
          >
            <div className="lab-line-numbers" ref={linesRef} aria-hidden="true">
              {card[language].split('\n').map((_, index) => (
                <span key={index}>{index + 1}</span>
              ))}
            </div>
            <textarea
              ref={textareaRef}
              className="lab-textarea"
              maxLength={250000}
              aria-label={`${activeFile.label} 代码`}
              value={card[language]}
              onChange={(event) => onChange({ [language]: event.target.value })}
              onKeyDown={handleEditorKey}
              onScroll={(event) => {
                if (linesRef.current)
                  linesRef.current.scrollTop = event.currentTarget.scrollTop
              }}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              wrap="off"
              disabled={disabled}
              placeholder={
                language === 'html'
                  ? '<h1>Hello, world.</h1>'
                  : language === 'css'
                    ? 'h1 { color: #5268e8; }'
                    : "console.log('开始你的实验');"
              }
            />
          </div>
          <div className="lab-editor-footer">
            <span>原生浏览器代码</span>
            <kbd>⌘ / Ctrl ↵ 运行</kbd>
          </div>
        </div>

        <div className="lab-preview">
          <div className="lab-preview-toolbar">
            <span>
              <span
                className={`lab-status-dot ${activeRun ? 'is-running' : ''}`}
              />
              预览
            </span>
            <span className="lab-preview-status">
              {activeRun
                ? changedSinceRun
                  ? '代码已更改 · 待运行'
                  : ready
                    ? '预览已启动'
                    : '正在启动…'
                : '等待运行'}
            </span>
          </div>
          <div className="lab-preview-content">
            {activeRun ? (
              <iframe
                key={activeRun.id}
                ref={iframeRef}
                className="lab-frame"
                title={`${card.title || '未命名卡片'}的代码预览`}
                sandbox="allow-scripts"
                referrerPolicy="no-referrer"
                srcDoc={activeRun.srcDoc}
              />
            ) : (
              <div className="lab-preview-empty">
                <div className="lab-empty-icon">
                  <Code2 size={25} />
                </div>
                <strong>让想法运行起来</strong>
                <p>点击「运行代码」，在这里查看结果</p>
                <span>切换卡片和刷新时不会自动执行</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="lab-console">
        <div className="lab-console-heading">
          <span>
            <Terminal size={14} />
            控制台 <span className="lab-console-count">{entries.length}</span>
          </span>
          {errorCount > 0 && (
            <span className="lab-error-count">
              <TriangleAlert size={12} />
              {errorCount} 条错误
            </span>
          )}
        </div>
        <div
          className="lab-console-output"
          role="log"
          aria-label="运行输出"
          aria-live="polite"
        >
          {entries.length === 0 ? (
            <p className="lab-console-placeholder">
              {activeRun
                ? '暂无输出。使用 console.log 查看结果。'
                : '运行后，日志与错误会显示在这里。'}
            </p>
          ) : (
            entries.map((entry, index) => (
              <div
                className={`lab-console-entry lab-console-${entry.level}`}
                key={index}
              >
                <span className="lab-console-level">{entry.level}</span>
                <pre>{entry.text}</pre>
              </div>
            ))
          )}
          {limited && (
            <p className="lab-console-limit">
              输出已达到 {MAX_PREVIEW_MESSAGES} 条上限，后续消息已忽略。
            </p>
          )}
        </div>
      </div>

      <details className="lab-boundary">
        <summary>执行范围与安全边界</summary>
        <p>
          点击运行会执行当前 JavaScript。HTML
          内的脚本和内联事件不执行；请把脚本写在 JavaScript 标签页。预览使用独立
          sandbox iframe，不开放宿主 DOM、存储、弹窗、下载或顶层导航权限。CSP
          阻止常见网络请求和外部资源，仅支持内嵌 data 图片。
        </p>
        <p>
          仅支持浏览器原生 HTML / CSS / JavaScript，不解析 npm 依赖。iframe
          自身导航未必能被浏览器完全阻止，因此不保证彻底断网；死循环和大量资源消耗仍可能影响整个页面，请仅运行你信任的代码。清空会移除预览，不会修改已保存的源码。
        </p>
      </details>
    </section>
  )
}

export default CodeLab
