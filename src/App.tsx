import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Code2,
  Download,
  FileCode2,
  FileText,
  FolderOpen,
  HardDrive,
  Hash,
  LayoutGrid,
  Link2,
  LoaderCircle,
  Menu,
  Pencil,
  Plus,
  History,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import {
  createCard,
  deleteCard,
  demoMode,
  listHistory,
  listTrash,
  purgeDeletedCard,
  resetDemoCards,
  restoreBackupCards,
  restoreCard,
  restoreDeletedCard,
  restoreVersion,
} from './lib/db'
import { createBackupFile, parseBackupFile, validateSource } from './lib/backup'
import { searchCards } from './lib/search'
import { useKnowledge } from './lib/useKnowledge'
import { useRegisterSW } from 'virtual:pwa-register/react'
import type {
  Card,
  CardHistoryEntry,
  DeletedCard,
  RestoreChoice,
  RestoreDecision,
} from './lib/types'
import { CodeLab } from './components/CodeLab'
import { SourceEditor } from './components/LazySourceEditor'
import { Highlight, Markdown } from './components/Markdown'

const date = (value: string) =>
  new Date(value).toLocaleDateString('zh-CN', {
    month: 'short',
    day: 'numeric',
  })
const hasCode = (card: Card) =>
  Boolean(card.html.trim() || card.css.trim() || card.js.trim())
const errorText = (cause: unknown) =>
  cause instanceof Error ? cause.message : '操作失败，请重试。'
const dateTime = (value: string) => new Date(value).toLocaleString('zh-CN')
const cardContents = (card: Card) =>
  `标题：${card.title}\n标签：${card.tags.join('、') || '无'}\n来源：${card.source || '无'}\n\n正文：\n${card.body}\n\nHTML：\n${card.html}\n\nCSS：\n${card.css}\n\nJavaScript：\n${card.js}`

function Dialog({
  title,
  description,
  children,
  onClose,
  wide = false,
}: {
  title: string
  description?: string
  children: ReactNode
  onClose: () => void
  wide?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const descriptionId = useId()
  useEffect(() => {
    const dialog = ref.current
    const previousFocus = document.activeElement
    dialog?.showModal()
    dialog?.querySelector<HTMLButtonElement>('.dialog-heading button')?.focus()
    return () => {
      dialog?.close()
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected)
        previousFocus.focus()
    }
  }, [])
  return (
    <dialog
      ref={ref}
      className={`dialog ${wide ? 'dialog-wide' : ''}`}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="dialog-heading">
        <h2 id={titleId}>{title}</h2>
        <button className="icon-button" aria-label="关闭弹窗" onClick={onClose}>
          <X size={19} />
        </button>
      </div>
      {description && (
        <p id={descriptionId} className="dialog-description">
          {description}
        </p>
      )}
      {children}
    </dialog>
  )
}

function Tags({
  tags,
  onChange,
}: {
  tags: string[]
  onChange: (tags: string[]) => void
}) {
  const [value, setValue] = useState('')
  const add = () => {
    const additions = value
      .split(/[,，\n]/)
      .map((tag) => tag.trim())
      .filter(Boolean)
    if (additions.length)
      onChange([...new Set([...tags, ...additions])].slice(0, 24))
    setValue('')
  }
  return (
    <div className="tags-editor">
      {tags.map((tag) => (
        <span className="tag editable-tag" key={tag}>
          {tag}
          <button
            aria-label={`移除标签 ${tag}`}
            onClick={() => onChange(tags.filter((item) => item !== tag))}
          >
            <X size={11} />
          </button>
        </span>
      ))}
      <input
        aria-label="添加标签"
        placeholder="+ 添加标签"
        value={value}
        maxLength={48}
        onChange={(event) => setValue(event.target.value)}
        onBlur={add}
        onKeyDown={(event) => {
          if (
            event.key === 'Enter' ||
            event.key === ',' ||
            event.key === '，'
          ) {
            event.preventDefault()
            add()
          }
        }}
      />
    </div>
  )
}

export default function App() {
  const { cards, cardsRef, loading, error, status, update, flush, discard } =
    useKnowledge()
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [tag, setTag] = useState<string | null>(null)
  const [collection, setCollection] = useState<'all' | 'code'>('all')
  const [tab, setTab] = useState<'note' | 'lab'>('note')
  const [editing, setEditing] = useState(false)
  const [mobileDetail, setMobileDetail] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [modal, setModal] = useState<
    | 'backup'
    | 'delete'
    | 'help'
    | 'discard'
    | 'reset-demo'
    | 'history'
    | 'trash'
    | 'purge'
    | null
  >(null)
  const [imported, setImported] = useState<Card[] | null>(null)
  const [importName, setImportName] = useState('')
  const [importError, setImportError] = useState('')
  const [importExisting, setImportExisting] = useState<Record<string, Card>>(
    () => Object.create(null),
  )
  const [importChoices, setImportChoices] = useState<
    Record<string, RestoreChoice>
  >({})
  const [importVisible, setImportVisible] = useState(30)
  const [backupPreviewId, setBackupPreviewId] = useState<string | null>(null)
  const [historyEntries, setHistoryEntries] = useState<CardHistoryEntry[]>([])
  const [deletedEntries, setDeletedEntries] = useState<DeletedCard[]>([])
  const [pendingPurge, setPendingPurge] = useState<DeletedCard | null>(null)
  const [historyPreviewId, setHistoryPreviewId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [deleted, setDeleted] = useState<Card | null>(null)
  const [cursor, setCursor] = useState(0)
  const [visibleCount, setVisibleCount] = useState(100)
  const searchRef = useRef<HTMLInputElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  const results = useMemo(
    () =>
      searchCards(
        collection === 'code' ? cards.filter(hasCode) : cards,
        query,
        tag,
      ),
    [cards, query, tag, collection],
  )
  const selected = cards.find((card) => card.id === selectedId)
  const tags = useMemo(
    () =>
      [...new Set(cards.flatMap((card) => card.tags))].sort((a, b) =>
        a.localeCompare(b),
      ),
    [cards],
  )
  const importConflicts =
    imported?.filter((card) => Object.hasOwn(importExisting, card.id)) ?? []

  useEffect(() => {
    if (!loading && !selectedId && cards.length)
      setSelectedId(searchCards(cards, '', null)[0].card.id)
  }, [cards, loading, selectedId])
  useEffect(() => {
    setCursor(0)
    setVisibleCount(100)
  }, [query, tag, collection])
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setMobileDetail(false)
        requestAnimationFrame(() => {
          searchRef.current?.focus()
          searchRef.current?.select()
        })
      }
    }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [])
  useEffect(() => {
    if (notice) {
      const timer = setTimeout(() => setNotice(''), 7000)
      return () => clearTimeout(timer)
    }
  }, [notice])

  const select = async (card: Card) => {
    if (!(await flush())) return
    setSelectedId(card.id)
    setMobileDetail(true)
    setTab('note')
    setEditing(false)
  }
  const addCard = async (template = false) => {
    if (!(await flush())) return
    setBusy(true)
    try {
      const card = await createCard(template)
      setQuery('')
      setTag(null)
      setCollection('all')
      setSelectedId(card.id)
      setTab('note')
      setEditing(true)
      setMobileDetail(true)
      setSidebarOpen(false)
      setTimeout(() => {
        titleRef.current?.focus()
        titleRef.current?.select()
      }, 80)
    } catch (cause) {
      setNotice(errorText(cause))
    } finally {
      setBusy(false)
    }
  }
  const exportBackup = async () => {
    const saved = await flush()
    setBusy(true)
    try {
      const backup = await createBackupFile(cardsRef.current)
      const url = URL.createObjectURL(backup.data)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `pianduan-backup-${new Date().toISOString().slice(0, 10)}.${backup.extension}`
      anchor.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setNotice(
        saved
          ? `已导出 ${cardsRef.current.length} 张卡片，包含全部源码。`
          : '已导出当前内存中的内容；浏览器内的修改仍未保存。',
      )
    } catch (cause) {
      setNotice(errorText(cause))
    } finally {
      setBusy(false)
    }
  }
  const performImport = async () => {
    if (!imported || !(await flush())) return
    setBusy(true)
    setImportError('')
    try {
      const decisions: Record<string, RestoreDecision> = Object.create(null)
      for (const card of importConflicts)
        decisions[card.id] = {
          choice: Object.hasOwn(importChoices, card.id)
            ? importChoices[card.id]
            : 'skip',
          expectedRevision: importExisting[card.id].revision,
        }
      const result = await restoreBackupCards(imported, decisions)
      setModal(null)
      setImported(null)
      setDeleted(null)
      setNotice(
        `导入完成：新增 ${result.added} 张，恢复 ${result.replaced} 张，跳过 ${result.skipped} 张。`,
      )
      setQuery('')
      setTag(null)
    } catch (cause) {
      setImportError(errorText(cause))
    } finally {
      setBusy(false)
    }
  }
  const remove = async () => {
    if (!selected || !(await flush())) return
    setBusy(true)
    try {
      const latest = cardsRef.current.find((card) => card.id === selected.id)!
      await deleteCard(latest)
      setDeleted(latest)
      setSelectedId(null)
      setModal(null)
      setMobileDetail(false)
      setNotice('卡片已删除。可以撤销这次操作。')
    } catch (cause) {
      setNotice(errorText(cause))
      setModal(null)
    } finally {
      setBusy(false)
    }
  }
  const recoverCopy = async () => {
    if (!selected) return
    setBusy(true)
    try {
      const copy = {
        ...selected,
        id: crypto.randomUUID(),
        title: `${(selected.title || '未命名卡片').slice(0, 194)}（恢复副本）`,
      }
      const result = await restoreBackupCards([copy], {})
      await discard()
      setNotice(`已保留 ${result.added} 张本地修改副本，并重新载入数据库。`)
    } catch (cause) {
      setNotice(errorText(cause))
    } finally {
      setBusy(false)
    }
  }
  const openHistory = async () => {
    if (!selected || !(await flush())) return
    try {
      setHistoryEntries(await listHistory(selected.id))
      setHistoryPreviewId(null)
      setModal('history')
    } catch (cause) {
      setNotice(errorText(cause))
    }
  }
  const openTrash = async () => {
    try {
      setDeletedEntries(await listTrash())
      setModal('trash')
    } catch (cause) {
      setNotice(errorText(cause))
    }
  }
  const changeCollection = (
    value: 'all' | 'code',
    filter: string | null = null,
  ) => {
    setCollection(value)
    setTag(filter)
    setMobileDetail(false)
    setSidebarOpen(false)
  }

  return (
    <div className={`app ${mobileDetail ? 'show-detail' : ''}`}>
      {sidebarOpen && (
        <button
          className="sidebar-backdrop"
          aria-label="关闭导航"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside className={`sidebar ${sidebarOpen ? 'is-open' : ''}`}>
        <a
          className="brand"
          href="#"
          onClick={(event) => {
            event.preventDefault()
            changeCollection('all')
            setQuery('')
          }}
        >
          <span className="brand-symbol">
            <Code2 size={23} strokeWidth={2.2} />
          </span>
          <span>
            片段<span className="brand-caption">DEV NOTEBOOK</span>
          </span>
        </a>
        <button
          className="new-button"
          onClick={() => void addCard()}
          disabled={busy || loading}
        >
          <Plus size={17} /> 新建卡片 <span>＋</span>
        </button>
        <div className="nav-caption">工作空间</div>
        <nav aria-label="知识库导航">
          <button
            className={`nav-item ${collection === 'all' && !tag ? 'active' : ''}`}
            onClick={() => changeCollection('all')}
          >
            <LayoutGrid size={17} />
            <span>全部卡片</span>
            <span className="nav-count">{cards.length}</span>
          </button>
          <button
            className={`nav-item ${collection === 'code' ? 'active' : ''}`}
            onClick={() => changeCollection('code')}
          >
            <Code2 size={17} />
            <span>代码实验</span>
            <span className="nav-count">{cards.filter(hasCode).length}</span>
          </button>
        </nav>
        <div className="nav-caption tags-caption">
          标签 <span>{tags.length}</span>
        </div>
        <nav className="tag-nav" aria-label="标签筛选">
          {tags.map((item) => (
            <button
              className={`nav-item ${tag === item ? 'active' : ''}`}
              key={item}
              onClick={() =>
                changeCollection('all', tag === item ? null : item)
              }
            >
              <Hash size={15} />
              <span>{item}</span>
              <span className="nav-count">
                {cards.filter((card) => card.tags.includes(item)).length}
              </span>
            </button>
          ))}
          {!tags.length && (
            <p className="nav-empty">给卡片加个标签，方便下次找回。</p>
          )}
        </nav>
        <button
          className="template-card"
          onClick={() => void addCard(true)}
          disabled={busy || loading}
        >
          <span className="template-icon">
            <Sparkles size={16} />
          </span>
          <strong>踩坑记录模板</strong>
          <span>现象 → 原因 → 解决方法</span>
          <ArrowRight className="template-arrow" size={16} />
        </button>
        <div className="sidebar-bottom">
          <button className="nav-item" onClick={() => void openTrash()}>
            <Trash2 size={17} />
            <span>回收站</span>
          </button>
          <button
            className="nav-item"
            onClick={() => {
              setModal('backup')
              setImportError('')
              setImported(null)
              setImportName('')
              setImportExisting(Object.create(null))
              setImportChoices({})
            }}
          >
            <HardDrive size={17} />
            <span>导入与备份</span>
          </button>
          <button className="local-workspace" onClick={() => setModal('help')}>
            <span className="workspace-avatar">P</span>
            <span>
              <strong>我的本地工作区</strong>
              <small>
                <i /> 数据保存在此浏览器
              </small>
            </span>
            <CircleHelp size={15} />
          </button>
        </div>
      </aside>
      <main className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button menu-button"
              aria-label="打开导航"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={19} />
            </button>
            <BookOpen size={16} />
            <span>我的知识库</span>
            <ChevronRight size={13} />
            <strong>
              {tag
                ? `# ${tag}`
                : collection === 'code'
                  ? '代码实验'
                  : '全部卡片'}
            </strong>
          </div>
          <div className="topbar-right">
            <span className="local-badge">
              <span /> {demoMode ? '独立演示空间' : '本地优先'}
            </span>
            <button
              className="icon-button"
              aria-label="使用帮助"
              onClick={() => setModal('help')}
            >
              <CircleHelp size={17} />
            </button>
          </div>
        </header>
        <div className="workspace">
          <section className="collection-panel" aria-label="卡片列表">
            {error && !selected && (
              <div className="storage-error" role="alert">
                <strong>浏览器存储不可用</strong>
                <span>{error}</span>
                <span>请检查浏览器的站点存储权限，然后重新打开页面。</span>
              </div>
            )}
            <div className="collection-heading">
              <div>
                <div className="eyebrow">YOUR SECOND BRAIN</div>
                <h1>
                  {tag
                    ? `# ${tag}`
                    : collection === 'code'
                      ? '代码实验'
                      : '全部卡片'}
                  <span>{results.length}</span>
                </h1>
              </div>
              <button
                className="icon-button"
                aria-label="新建知识卡片"
                onClick={() => void addCard()}
                disabled={busy || loading}
              >
                <Plus size={20} />
              </button>
            </div>
            <p className="collection-description">把经验留下，让想法运行。</p>
            <div className="search-box">
              <Search size={17} />
              <input
                ref={searchRef}
                aria-label="搜索知识卡片"
                aria-controls="search-results"
                aria-activedescendant={
                  query && results[cursor]
                    ? `result-${results[cursor].card.id}`
                    : undefined
                }
                placeholder="搜索任何片段…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                    event.preventDefault()
                    setCursor((value) => {
                      const next = Math.max(
                        0,
                        Math.min(
                          results.length - 1,
                          value + (event.key === 'ArrowDown' ? 1 : -1),
                        ),
                      )
                      setVisibleCount((count) => Math.max(count, next + 1))
                      return next
                    })
                  }
                  if (event.key === 'Enter' && results[cursor]) {
                    event.preventDefault()
                    void select(results[cursor].card)
                  }
                  if (event.key === 'Escape') setQuery('')
                }}
              />
              {query ? (
                <button
                  aria-label="清空搜索"
                  onClick={() => {
                    setQuery('')
                    searchRef.current?.focus()
                  }}
                >
                  <X size={14} />
                </button>
              ) : (
                <kbd>⌘ K</kbd>
              )}
            </div>
            <div className="list-toolbar">
              <span>
                {query ? `${results.length} 个匹配结果` : '最近更新'}
                {tag && (
                  <button
                    className="clear-filter"
                    aria-label="清除标签筛选"
                    onClick={() => setTag(null)}
                  >
                    <X size={12} />
                  </button>
                )}
              </span>
              <span>
                {query ? (
                  '标题 · 正文 · 代码'
                ) : (
                  <>
                    <span>由新到旧</span>
                    <ChevronDown size={12} />
                  </>
                )}
              </span>
            </div>
            <div
              id="search-results"
              className="card-list"
              role="listbox"
              aria-label="知识卡片搜索结果"
            >
              {loading ? (
                <div className="list-empty">
                  <LoaderCircle className="spin" />
                  <p>正在打开知识库…</p>
                </div>
              ) : results.length ? (
                results
                  .slice(0, visibleCount)
                  .map(({ card, matchField, snippet }, index) => (
                    <button
                      id={`result-${card.id}`}
                      role="option"
                      aria-selected={card.id === selectedId}
                      className={`card-item ${card.id === selectedId ? 'selected' : ''} ${query && index === cursor ? 'keyboard-current' : ''}`}
                      key={card.id}
                      onClick={() => void select(card)}
                      onKeyDown={(event) => {
                        if (
                          event.key === 'ArrowDown' ||
                          event.key === 'ArrowUp'
                        ) {
                          event.preventDefault()
                          const next = Math.max(
                            0,
                            Math.min(
                              results.length - 1,
                              index + (event.key === 'ArrowDown' ? 1 : -1),
                            ),
                          )
                          setVisibleCount((count) => Math.max(count, next + 1))
                          requestAnimationFrame(() =>
                            document
                              .getElementById(`result-${results[next].card.id}`)
                              ?.focus(),
                          )
                          setCursor(next)
                        }
                      }}
                    >
                      <div className="card-item-heading">
                        <span
                          className={`file-icon ${hasCode(card) ? 'with-code' : ''}`}
                        >
                          {hasCode(card) ? (
                            <FileCode2 size={17} />
                          ) : (
                            <FileText size={17} />
                          )}
                        </span>
                        <span className="card-date">
                          {date(card.updatedAt)}
                        </span>
                      </div>
                      <h2>
                        <Highlight
                          text={card.title || '未命名卡片'}
                          query={query}
                        />
                      </h2>
                      <p>
                        <Highlight
                          text={snippet || '一张空白卡片，等待你的下一个发现。'}
                          query={query}
                        />
                      </p>
                      <div className="card-item-footer">
                        <span className="card-tags">
                          {card.tags.slice(0, 3).map((item) => (
                            <span className="tag" key={item}>
                              <Highlight text={item} query={query} />
                            </span>
                          ))}
                        </span>
                        {query && matchField === 'code' ? (
                          <span className="code-match">代码匹配</span>
                        ) : hasCode(card) ? (
                          <Code2 size={14} />
                        ) : null}
                      </div>
                    </button>
                  ))
              ) : (
                <div className="list-empty">
                  <Search size={30} strokeWidth={1.3} />
                  <h3>
                    {query || tag ? '还没找到这个片段' : '从第一个片段开始'}
                  </h3>
                  <p>
                    {query || tag
                      ? '试试更短的关键词，或清除筛选条件。'
                      : '记录一个问题、一个答案，或者一个有趣的实验。'}
                  </p>
                  <button
                    className="text-button"
                    onClick={() => {
                      if (query || tag) {
                        setQuery('')
                        setTag(null)
                      } else void addCard()
                    }}
                  >
                    {query || tag ? '清除搜索与筛选' : '新建卡片'}
                    <ArrowRight size={14} />
                  </button>
                </div>
              )}
            </div>
            {results.length > visibleCount && (
              <button
                className="load-more"
                onClick={() => setVisibleCount((count) => count + 100)}
              >
                加载更多（已显示 {visibleCount} / {results.length}）
              </button>
            )}
            <div className="list-bottom">
              <span>
                <ArrowUp size={11} />
                <ArrowDown size={11} /> 选择
              </span>
              <span>↵ 打开</span>
              <span>{cards.length} 张卡片 · 只属于你</span>
            </div>
          </section>
          <section className="detail-panel" aria-label="卡片详情">
            {selected ? (
              <>
                <div className="detail-toolbar">
                  <div className="detail-tabs">
                    <button
                      className="icon-button back-button"
                      aria-label="返回卡片列表"
                      onClick={() => setMobileDetail(false)}
                    >
                      <ArrowLeft size={17} />
                    </button>
                    <button
                      className={tab === 'note' ? 'active' : ''}
                      onClick={() => setTab('note')}
                    >
                      <FileText size={15} />
                      知识笔记
                    </button>
                    <button
                      className={tab === 'lab' ? 'active' : ''}
                      onClick={() => setTab('lab')}
                    >
                      <Code2 size={16} />
                      代码实验室
                      {hasCode(selected) && <span className="tab-dot" />}
                    </button>
                  </div>
                  <div className="detail-actions">
                    <span className={`save-status ${status}`} role="status">
                      {status === 'saved' ? (
                        <Check size={13} />
                      ) : status === 'saving' ? (
                        <LoaderCircle className="spin" size={13} />
                      ) : (
                        <span>!</span>
                      )}
                      {status === 'saved'
                        ? '已保存'
                        : status === 'saving'
                          ? '保存中…'
                          : '未保存'}
                    </span>
                    <button
                      className="icon-button"
                      aria-label="查看卡片历史版本"
                      title="历史版本"
                      onClick={() => void openHistory()}
                    >
                      <History size={16} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label="删除当前卡片"
                      onClick={() => setModal('delete')}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
                {error && (
                  <div className="error-banner" role="alert">
                    <strong>修改尚未保存</strong>
                    <span>{error}</span>
                    <div>
                      <button onClick={() => void flush()}>重试保存</button>
                      <button
                        onClick={() => void recoverCopy()}
                        disabled={busy}
                      >
                        保留为副本
                      </button>
                      <button onClick={() => setModal('discard')}>
                        载入已存版本
                      </button>
                      <button onClick={() => void exportBackup()}>
                        导出当前内容
                      </button>
                    </div>
                  </div>
                )}
                <div
                  inert={busy}
                  className={`detail-scroll ${tab === 'lab' ? 'lab-mode' : ''}`}
                >
                  <div className="note-header">
                    <div className="note-eyebrow">
                      <span>
                        <span className="tiny-square" /> KNOWLEDGE CARD
                      </span>
                      <span>创建于 {date(selected.createdAt)}</span>
                    </div>
                    <input
                      ref={titleRef}
                      className="title-input"
                      aria-label="卡片标题"
                      value={selected.title}
                      placeholder="给这个片段起个名字"
                      maxLength={200}
                      onChange={(event) =>
                        update(selected.id, { title: event.target.value })
                      }
                    />
                    <Tags
                      key={selected.id}
                      tags={selected.tags}
                      onChange={(value) => update(selected.id, { tags: value })}
                    />
                  </div>
                  {tab === 'note' ? (
                    <div className="note-content">
                      <div className="content-toolbar">
                        <span>
                          <span className="content-rule" />
                          笔记内容
                        </span>
                        <div className="segmented">
                          <button
                            className={!editing ? 'active' : ''}
                            onClick={() => setEditing(false)}
                          >
                            <BookOpen size={13} />
                            阅读
                          </button>
                          <button
                            className={editing ? 'active' : ''}
                            onClick={() => setEditing(true)}
                          >
                            <Pencil size={13} />
                            编辑
                          </button>
                        </div>
                      </div>
                      {editing ? (
                        <>
                          <SourceEditor
                            className="markdown-editor"
                            maxLength={500000}
                            language="markdown"
                            label="Markdown 正文"
                            value={selected.body}
                            onChange={(value) =>
                              update(selected.id, { body: value })
                            }
                          />
                          <div className="editor-hint">
                            <span>支持 Markdown</span>
                            <span>{selected.body.length} 字符 · 自动保存</span>
                          </div>
                        </>
                      ) : (
                        <Markdown body={selected.body} />
                      )}
                      <div className="source-section">
                        <div className="source-label">
                          <Link2 size={15} />
                          <span>参考来源</span>
                        </div>
                        <div className="source-row">
                          <input
                            aria-label="来源链接"
                            type="url"
                            placeholder="添加文档或文章链接（https://…）"
                            value={selected.source}
                            maxLength={2048}
                            onChange={(event) =>
                              update(selected.id, {
                                source: event.target.value,
                              })
                            }
                          />
                          {selected.source &&
                            validateSource(selected.source) && (
                              <a
                                href={selected.source}
                                target="_blank"
                                rel="noreferrer noopener"
                                aria-label="打开来源链接"
                              >
                                <ArrowRight size={16} />
                              </a>
                            )}
                        </div>
                        {!validateSource(selected.source) && (
                          <p className="field-error">
                            请输入完整的 http:// 或 https:// 链接，或留空。
                          </p>
                        )}
                      </div>
                      <button
                        className="lab-invite"
                        onClick={() => setTab('lab')}
                      >
                        <span className="lab-invite-icon">
                          <Code2 size={22} />
                        </span>
                        <span>
                          <strong>
                            {hasCode(selected)
                              ? '不止记下来，运行看看。'
                              : '给这个想法，一个运行的机会。'}
                          </strong>
                          <small>
                            在代码实验室里编辑 HTML、CSS 与 JavaScript
                          </small>
                        </span>
                        <ArrowRight size={18} />
                      </button>
                    </div>
                  ) : (
                    <CodeLab
                      key={selected.id}
                      card={selected}
                      onChange={(patch) => update(selected.id, patch)}
                    />
                  )}
                </div>
                <footer className="detail-footer">
                  <span>
                    <ShieldCheck size={13} /> 本地保存，安心记录
                  </span>
                  <span>
                    {tab === 'note'
                      ? '好记性，也需要好片段。'
                      : '原生 HTML / CSS / JavaScript'}
                  </span>
                </footer>
              </>
            ) : (
              <div className="detail-empty">
                <span className="empty-symbol">
                  <FolderOpen size={38} strokeWidth={1.3} />
                </span>
                <h2>
                  {loading
                    ? '正在整理你的片段…'
                    : '每个问题，都值得留一个答案。'}
                </h2>
                <p>从左侧选择卡片，或开始记录一个新的发现。</p>
                {error && (
                  <p className="field-error" role="alert">
                    {error}
                  </p>
                )}
                <button
                  className="primary-button"
                  onClick={() => void addCard()}
                  disabled={loading || busy}
                >
                  <Plus size={16} />
                  新建第一张卡片
                </button>
              </div>
            )}
          </section>
        </div>
      </main>
      {needRefresh && (
        <div className="update-banner" role="status">
          <span>新版本已准备好。保存当前修改后可以更新。</span>
          <button
            onClick={async () => {
              if (await flush()) await updateServiceWorker(true)
              else setNotice('请先解决未保存的修改，再更新应用。')
            }}
          >
            保存并更新
          </button>
          <button aria-label="稍后更新" onClick={() => setNeedRefresh(false)}>
            <X size={14} />
          </button>
        </div>
      )}
      {offlineReady && !needRefresh && (
        <div className="update-banner" role="status">
          <span>离线资源已准备好，下次可离线重新打开。</span>
          <button onClick={() => setOfflineReady(false)}>知道了</button>
        </div>
      )}
      {(notice || deleted) && (
        <div className="toast" role="status">
          <Check size={17} />
          <span>{notice || '卡片已删除'}</span>
          {deleted && (
            <button
              onClick={async () => {
                try {
                  const restored = await restoreCard(deleted)
                  setDeleted(null)
                  setSelectedId(restored.id)
                  setNotice('卡片已恢复。')
                } catch (cause) {
                  setNotice(errorText(cause))
                }
              }}
            >
              撤销删除
            </button>
          )}
          <button
            className="icon-button"
            aria-label="关闭提示"
            onClick={() => {
              setNotice('')
              setDeleted(null)
            }}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {modal === 'delete' && (
        <Dialog
          title="删除这张卡片？"
          description={`「${selected?.title || '未命名卡片'}」及附属代码会从知识库移除。删除后可在底部提示中撤销。`}
          onClose={() => setModal(null)}
        >
          <div className="dialog-actions">
            <button className="secondary-button" onClick={() => setModal(null)}>
              保留卡片
            </button>
            <button
              className="danger-button"
              onClick={() => void remove()}
              disabled={busy}
            >
              确认删除
            </button>
          </div>
        </Dialog>
      )}
      {modal === 'discard' && (
        <Dialog
          title="重新载入已保存的版本？"
          description="这会丢弃当前尚未保存的修改。你可以先导出当前内容，或保留为副本。"
          onClose={() => setModal(null)}
        >
          <div className="dialog-actions">
            <button className="secondary-button" onClick={() => setModal(null)}>
              取消
            </button>
            <button
              className="danger-button"
              onClick={async () => {
                try {
                  await discard()
                  setModal(null)
                } catch (cause) {
                  setNotice(errorText(cause))
                }
              }}
            >
              丢弃修改并载入
            </button>
          </div>
        </Dialog>
      )}
      {modal === 'reset-demo' && (
        <Dialog
          title="重置演示空间？"
          description="这会清除演示空间中的卡片并恢复三张示例，不会影响普通工作区。需要保留的演示内容请先导出。"
          onClose={() => setModal(null)}
        >
          <div className="dialog-actions">
            <button className="secondary-button" onClick={() => setModal(null)}>
              取消
            </button>
            <button
              className="danger-button"
              disabled={busy}
              onClick={async () => {
                if (!(await flush())) {
                  setNotice('当前修改尚未保存；请先导出备份后重试。')
                  return
                }
                setBusy(true)
                try {
                  await resetDemoCards()
                  await discard()
                  setSelectedId(null)
                  setQuery('')
                  setTag(null)
                  setModal(null)
                  setNotice('演示空间已恢复三张示例卡片。')
                } catch (cause) {
                  setNotice(errorText(cause))
                } finally {
                  setBusy(false)
                }
              }}
            >
              确认重置演示空间
            </button>
          </div>
        </Dialog>
      )}
      {modal === 'backup' && (
        <Dialog
          wide
          title="让每个片段，都有备份。"
          description="数据保存在当前浏览器中。定期导出一份完整备份，换设备时也能把知识带走。"
          onClose={() => {
            if (!busy) setModal(null)
          }}
        >
          <div className="backup-export">
            <span className="backup-icon">
              <Download size={22} />
            </span>
            <div>
              <strong>导出知识库</strong>
              <p>{cards.length} 张卡片 · 正文、标签与全部源码</p>
            </div>
            <button
              className="secondary-button"
              onClick={() => void exportBackup()}
            >
              <Download size={14} />
              {busy ? '正在准备…' : '导出备份'}
            </button>
          </div>
          <div className="import-section">
            <h3>
              <Upload size={16} /> 从备份导入
            </h3>
            <label className="file-drop">
              <Upload size={22} />
              <strong>{importName || '选择 JSON / ZIP 备份文件'}</strong>
              <span>导入前检查全部卡片与校验值 · ZIP 最大 100 MiB</span>
              <input
                aria-label="选择 JSON 或 ZIP 备份文件"
                type="file"
                accept=".json,.zip,application/json,application/zip"
                onChange={async (event) => {
                  const file = event.target.files?.[0]
                  if (!file) return
                  setImported(null)
                  setImportExisting(Object.create(null))
                  setImportChoices({})
                  setBackupPreviewId(null)
                  setImportVisible(30)
                  setImportName(file.name)
                  setImportError('')
                  setBusy(true)
                  try {
                    const parsed = await parseBackupFile(file)
                    if (!(await flush()))
                      throw new Error(
                        '当前修改尚未保存，请先解决保存问题后再导入。',
                      )
                    const byId = new Map(
                      cardsRef.current.map((card) => [card.id, card]),
                    )
                    const existing: Record<string, Card> = Object.create(null)
                    for (const card of parsed) {
                      const current = byId.get(card.id)
                      if (current) existing[card.id] = current
                    }
                    setImportExisting(existing)
                    setImported(parsed)
                  } catch (cause) {
                    setImportError(errorText(cause))
                  } finally {
                    setBusy(false)
                  }
                  event.target.value = ''
                }}
              />
            </label>
            {importError && (
              <p className="field-error" role="alert">
                {importError}
              </p>
            )}
            {imported && (
              <div className="import-preview">
                <p>
                  <Check size={16} />
                  校验通过，共 {imported.length} 张卡片，
                  {importConflicts.length} 张 ID 与现有卡片相同。
                </p>
                {importConflicts.length > 0 && (
                  <div className="restore-conflicts">
                    <strong>逐张决定如何处理相同 ID 的卡片</strong>
                    <p>
                      默认保留现有内容。恢复备份前会把现有内容存入历史版本；导入期间有其他页面修改时会停止整个导入。
                    </p>
                    {importConflicts.slice(0, importVisible).map((card) => {
                      const current = importExisting[card.id]
                      return (
                        <div className="restore-conflict" key={card.id}>
                          <div>
                            <strong>
                              {current.title || card.title || '未命名卡片'}
                            </strong>
                            <small>
                              现有：{dateTime(current.updatedAt)} · 备份：
                              {dateTime(card.updatedAt)}
                            </small>
                          </div>
                          <div className="restore-conflict-actions">
                            <button
                              className="text-button"
                              onClick={() =>
                                setBackupPreviewId(
                                  backupPreviewId === card.id ? null : card.id,
                                )
                              }
                            >
                              {backupPreviewId === card.id
                                ? '收起内容'
                                : '对比内容'}
                            </button>
                            <select
                              aria-label={`处理 ${card.title || '未命名卡片'} 的备份冲突`}
                              value={
                                Object.hasOwn(importChoices, card.id)
                                  ? importChoices[card.id]
                                  : 'skip'
                              }
                              onChange={(event) =>
                                setImportChoices((choices) => ({
                                  ...choices,
                                  [card.id]: event.target
                                    .value as RestoreChoice,
                                }))
                              }
                            >
                              <option value="skip">保留现有</option>
                              <option value="copy">保留两份</option>
                              <option value="replace">恢复备份版本</option>
                            </select>
                          </div>
                          {backupPreviewId === card.id && (
                            <div className="restore-comparison">
                              <div>
                                <strong>现有内容</strong>
                                <pre>{cardContents(current)}</pre>
                              </div>
                              <div>
                                <strong>备份内容</strong>
                                <pre>{cardContents(card)}</pre>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                    {importConflicts.length > importVisible && (
                      <button
                        className="secondary-button"
                        onClick={() => setImportVisible((count) => count + 30)}
                      >
                        查看更多冲突（已显示 {importVisible} /{' '}
                        {importConflicts.length}）
                      </button>
                    )}
                  </div>
                )}
                <button
                  className="primary-button"
                  disabled={busy}
                  onClick={() => void performImport()}
                >
                  <Upload size={15} />
                  确认导入备份
                </button>
              </div>
            )}
          </div>
          <p className="backup-footnote">
            <ShieldCheck size={14} />{' '}
            只有明确选择“恢复备份版本”才会替换现有内容。备份文件不会上传到服务器。
          </p>
        </Dialog>
      )}
      {modal === 'history' && selected && (
        <Dialog
          wide
          title="历史版本"
          description="保存前的内容会保留最近 20 个版本。恢复后，当前版本也会进入历史记录。"
          onClose={() => setModal(null)}
        >
          <div className="recovery-list">
            {historyEntries.length ? (
              historyEntries.map((entry) => (
                <div className="recovery-item" key={entry.id}>
                  <div>
                    <strong>{entry.card.title || '未命名卡片'}</strong>
                    <small>
                      版本 {entry.card.revision} · 记录于{' '}
                      {dateTime(entry.recordedAt)}
                    </small>
                  </div>
                  <div className="recovery-actions">
                    <button
                      className="secondary-button"
                      onClick={() =>
                        setHistoryPreviewId(
                          historyPreviewId === entry.id ? null : entry.id,
                        )
                      }
                    >
                      {historyPreviewId === entry.id ? '收起' : '查看内容'}
                    </button>
                    <button
                      className="primary-button"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true)
                        try {
                          await restoreVersion(
                            selected.id,
                            entry.id,
                            selected.revision,
                          )
                          await discard()
                          setModal(null)
                          setNotice(
                            '已恢复所选历史版本；原内容已保留在历史记录中。',
                          )
                        } catch (cause) {
                          setNotice(errorText(cause))
                        } finally {
                          setBusy(false)
                        }
                      }}
                    >
                      恢复此版本
                    </button>
                  </div>
                  {historyPreviewId === entry.id && (
                    <pre className="recovery-preview">
                      {cardContents(entry.card)}
                    </pre>
                  )}
                </div>
              ))
            ) : (
              <p className="nav-empty">
                这张卡片还没有历史版本。保存修改后会自动记录。
              </p>
            )}
          </div>
        </Dialog>
      )}
      {modal === 'trash' && (
        <Dialog
          title="回收站"
          description="删除的卡片会留在当前浏览器，恢复后重新出现在知识库。"
          onClose={() => setModal(null)}
        >
          <div className="recovery-list">
            {deletedEntries.length ? (
              deletedEntries.map((entry) => (
                <div className="recovery-item" key={entry.id}>
                  <div>
                    <strong>{entry.card.title || '未命名卡片'}</strong>
                    <small>
                      删除于 {dateTime(entry.deletedAt)} ·{' '}
                      {entry.card.tags.join('、') || '无标签'}
                    </small>
                  </div>
                  <div className="recovery-actions">
                    <button
                      className="primary-button"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true)
                        try {
                          const restored = await restoreDeletedCard(entry.id)
                          await discard()
                          setDeleted(null)
                          setSelectedId(restored.id)
                          setMobileDetail(true)
                          setModal(null)
                          setNotice('卡片已从回收站恢复。')
                        } catch (cause) {
                          setNotice(errorText(cause))
                        } finally {
                          setBusy(false)
                        }
                      }}
                    >
                      恢复卡片
                    </button>
                    <button
                      className="secondary-button"
                      onClick={() => {
                        setPendingPurge(entry)
                        setModal('purge')
                      }}
                    >
                      永久删除
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <p className="nav-empty">回收站是空的。</p>
            )}
          </div>
        </Dialog>
      )}
      {modal === 'purge' && pendingPurge && (
        <Dialog
          title="永久删除这张卡片？"
          description={`「${pendingPurge.card.title || '未命名卡片'}」及其历史版本会从当前浏览器移除，只能从之前导出的备份恢复。`}
          onClose={() => setModal('trash')}
        >
          <div className="dialog-actions">
            <button
              className="secondary-button"
              onClick={() => setModal('trash')}
            >
              取消
            </button>
            <button
              className="danger-button"
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                try {
                  await purgeDeletedCard(pendingPurge.id)
                  setDeletedEntries(await listTrash())
                  setDeleted(null)
                  setPendingPurge(null)
                  setModal('trash')
                  setNotice('卡片已永久删除。')
                } catch (cause) {
                  setNotice(errorText(cause))
                } finally {
                  setBusy(false)
                }
              }}
            >
              永久删除
            </button>
          </div>
        </Dialog>
      )}
      {modal === 'help' && (
        <Dialog
          title="你的个人开发笔记本"
          description="片段，让踩过的坑成为经验，让灵感有地方落地。"
          onClose={() => setModal(null)}
        >
          <div className="help-grid">
            <div>
              <FileText size={20} />
              <strong>写下一个发现</strong>
              <p>编辑 Markdown，添加标签和来源。内容会自动保存到当前浏览器。</p>
            </div>
            <div>
              <Code2 size={20} />
              <strong>做一个小实验</strong>
              <p>
                切到代码实验室，点击运行才会执行。支持原生 HTML、CSS 和
                JavaScript。
              </p>
            </div>
            <div>
              <Search size={20} />
              <strong>轻松找回来</strong>
              <p>
                ⌘ / Ctrl + K 聚焦搜索；↑ ↓ 选择，Enter
                打开；多个关键词一起搜索。
              </p>
            </div>
            <div>
              <HardDrive size={20} />
              <strong>备份你的积累</strong>
              <p>
                同一浏览器、同一地址恢复内容。清理浏览器数据会删除记录，请定期导出。
              </p>
            </div>
          </div>
          <div className="help-note">
            实验预览与宿主页面分离，常见网络请求受限。请仅运行可信代码；死循环仍可能拖慢页面。当前版本不提供云同步。
          </div>
          {demoMode && (
            <div className="dialog-actions">
              <button
                className="secondary-button"
                onClick={() => setModal('reset-demo')}
              >
                重置演示卡片
              </button>
            </div>
          )}
        </Dialog>
      )}
    </div>
  )
}
