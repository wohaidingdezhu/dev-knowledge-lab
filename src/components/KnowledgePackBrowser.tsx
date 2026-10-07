import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { Card } from '../lib/types'
import { Markdown } from './Markdown'

export function KnowledgePackBrowser({
  lessons,
  existingIds,
  busy,
  onAdd,
  onClose,
}: {
  lessons: readonly Card[]
  existingIds: readonly string[]
  busy: boolean
  onAdd: (ids: string[]) => Promise<string | undefined>
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [topic, setTopic] = useState('')
  const [selected, setSelected] = useState(
    () =>
      new Set(
        lessons
          .filter((card) => !existingIds.includes(card.id))
          .map((card) => card.id),
      ),
  )
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const inFlight = useRef(false)
  const previewHeading = useRef<HTMLHeadingElement>(null)
  const previewTrigger = useRef<HTMLButtonElement | null>(null)
  const searchInput = useRef<HTMLInputElement>(null)
  const regionId = useId()
  const existing = new Set(existingIds)
  const topics = useMemo(
    () => [...new Set(lessons.flatMap((card) => card.tags))].sort(),
    [lessons],
  )
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  const visible = lessons.filter((card) => {
    const text = [card.title, ...card.tags, card.body]
      .join('\n')
      .toLocaleLowerCase()
    return (
      (!topic || card.tags.includes(topic)) &&
      words.every((word) => text.includes(word))
    )
  })
  const available = visible.filter((card) => !existing.has(card.id))
  const chosen = lessons.filter(
    (card) => selected.has(card.id) && !existing.has(card.id),
  )
  const missing = lessons.filter((card) => !existing.has(card.id))
  const preview = lessons.find((card) => card.id === previewId)
  const disabled = busy || pending

  useEffect(() => {
    if (previewId) {
      previewHeading.current?.focus({ preventScroll: true })
      previewHeading.current?.scrollIntoView({ block: 'nearest' })
    }
  }, [previewId])

  const changeVisible = (check: boolean) => {
    setSelected((previous) => {
      const next = new Set(previous)
      for (const card of available) {
        if (check) next.add(card.id)
        else next.delete(card.id)
      }
      return next
    })
  }
  const add = async () => {
    if (disabled || inFlight.current || !chosen.length) return
    inFlight.current = true
    setPending(true)
    setError('')
    try {
      const message = await onAdd(chosen.map((card) => card.id))
      if (message) setError(message)
    } catch {
      setError('添加失败，请稍后重试。')
    } finally {
      inFlight.current = false
      setPending(false)
    }
  }

  return (
    <>
      <div className="knowledge-pack-filters">
        <label>
          搜索知识内容
          <input
            ref={searchInput}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="标题、标签或正文关键词"
          />
        </label>
        <label>
          筛选知识主题
          <select
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
          >
            <option value="">全部主题</option>
            {topics.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="knowledge-pack-note" role="status">
        显示 {visible.length} / {lessons.length} 张 · 已选 {chosen.length}{' '}
        张待添加
      </p>
      <div className="knowledge-pack-selection">
        <button
          className="secondary-button"
          disabled={disabled || !available.length}
          onClick={() => changeVisible(true)}
        >
          选择当前结果
        </button>
        <button
          className="secondary-button"
          disabled={
            disabled || !available.some((card) => selected.has(card.id))
          }
          onClick={() => changeVisible(false)}
        >
          取消当前结果
        </button>
        <button
          className="secondary-button"
          disabled={disabled || !chosen.length}
          onClick={() => setSelected(new Set())}
        >
          清空选择
        </button>
      </div>
      {!visible.length && (
        <p className="knowledge-pack-note">
          没有匹配的知识卡片，请调整关键词或主题。筛选不会清除已选卡片。
        </p>
      )}
      <ul className="knowledge-pack-list" aria-label="内容包知识卡片">
        {visible.map((card) => (
          <li key={card.id}>
            <label className="knowledge-pack-choice">
              <input
                type="checkbox"
                checked={!existing.has(card.id) && selected.has(card.id)}
                disabled={disabled || existing.has(card.id)}
                onChange={(event) => {
                  const checked = event.target.checked
                  setSelected((previous) => {
                    const next = new Set(previous)
                    if (checked) next.add(card.id)
                    else next.delete(card.id)
                    return next
                  })
                }}
              />
              <span>
                {card.title}
                <small>
                  {existing.has(card.id)
                    ? '已在工作区 · 保留已有修改'
                    : card.tags.join(' · ')}
                </small>
              </span>
            </label>
            <button
              className="secondary-button"
              aria-label={`预览：${card.title}`}
              aria-expanded={previewId === card.id}
              aria-controls={previewId === card.id ? regionId : undefined}
              onClick={(event) => {
                previewTrigger.current = event.currentTarget
                setPreviewId(previewId === card.id ? null : card.id)
              }}
            >
              预览
            </button>
          </li>
        ))}
      </ul>
      {preview && (
        <section
          className="knowledge-pack-preview"
          id={regionId}
          aria-labelledby={`${regionId}-heading`}
        >
          <h3 id={`${regionId}-heading`} tabIndex={-1} ref={previewHeading}>
            {preview.title}
          </h3>
          <p className="knowledge-pack-note">
            内容包原版预览；添加后可在代码实验室主动运行示例。
          </p>
          <div className="knowledge-pack-preview-body">
            <Markdown key={preview.id} body={preview.body} />
          </div>
          <a href={preview.source} target="_blank" rel="noopener noreferrer">
            查看 MDN 参考来源
          </a>
          <button
            className="secondary-button"
            onClick={() => {
              setPreviewId(null)
              if (previewTrigger.current?.isConnected)
                previewTrigger.current.focus()
              else searchInput.current?.focus()
            }}
          >
            关闭笔记预览
          </button>
        </section>
      )}
      <p className="knowledge-pack-note">
        默认勾选全部缺少的卡片。筛选不会清除已选项，添加按钮会加入全部已选卡片，包括以前删除过的包内卡片。
      </p>
      {error && (
        <p role="alert" className="knowledge-pack-error">
          {error}
        </p>
      )}
      <div className="dialog-actions">
        <button
          className="secondary-button"
          disabled={disabled}
          onClick={onClose}
        >
          取消
        </button>
        <button
          className="primary-button"
          disabled={disabled || !chosen.length}
          onClick={() => void add()}
        >
          {pending
            ? '正在添加…'
            : !missing.length
              ? '已全部加入'
              : chosen.length
                ? `添加 ${chosen.length} 张知识卡片`
                : '请先选择知识卡片'}
        </button>
      </div>
    </>
  )
}
