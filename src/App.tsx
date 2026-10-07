import {
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from 'react'
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BookOpen,
  Check,
  ChevronRight,
  CircleHelp,
  Code2,
  Copy,
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
  Pin,
  Plus,
  History,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { liveQuery } from 'dexie'
import {
  batchDelete,
  batchPin,
  batchTag,
  createCard,
  db,
  deleteCard,
  demoMode,
  duplicateCard,
  exportFullSnapshot,
  exportWorkspace,
  getLastBackup,
  getWorkspaceMarker,
  importCards,
  listHistory,
  listTrash,
  purgeDeletedCard,
  recordBackup,
  renameTag,
  replaceFullSnapshot,
  resetDemoCards,
  replaceWorkspace,
  restoreBackupCards,
  restoreCard,
  restoreDeletedCard,
  restoreVersion,
  togglePin,
} from './lib/db'
import type { CardSelection } from './lib/db'
import {
  BACKUP_LIMITS,
  createBackupFile,
  createDraftFile,
  validateSource,
} from './lib/backup'
import { createFullBackupFile } from './lib/fullBackup'
import { readAnyBackupFile } from './lib/portableBackup'
import { createWorkspaceBackupFile } from './lib/workspaceBackup'

import { makeKnowledgePackCards } from './lib/knowledgePack'
import { searchCards } from './lib/search'
import { summarizeCards } from './lib/cardSummary'
import { cardContents } from './lib/cardComparison'
import { createCardExport, type CardExportFormat } from './lib/cardExport'
import { useKnowledge } from './lib/useKnowledge'
import {
  readViewPreferences,
  writeViewPreferences,
  rememberedLanguage,
  rememberLanguage,
  type SortMode,
} from './lib/viewPreferences'
import { useRegisterSW } from 'virtual:pwa-register/react'
import type {
  Card,
  CardHistoryEntry,
  DeletedCard,
  FullSnapshot,
  RestoreChoice,
  RestoreDecision,
  WorkspaceData,
} from './lib/types'
import { CodeLab } from './components/CodeLab'
import { CardComparison } from './components/CardComparison'
import { SourceEditor } from './components/LazySourceEditor'
import { Highlight, Markdown } from './components/Markdown'
import { KnowledgePackBrowser } from './components/KnowledgePackBrowser'

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
const storageSize = (value?: number) =>
  value === undefined ? '未知' : `${(value / 1024 / 1024).toFixed(1)} MiB`

type ListCursor = { id: string | null; index: number; scope: string }
const resolveListCursor = (
  ids: string[],
  current: ListCursor,
  scope: string,
) => {
  if (current.scope !== scope) return 0
  const index = current.id === null ? -1 : ids.indexOf(current.id)
  return Math.max(
    0,
    Math.min(ids.length - 1, index < 0 ? current.index : index),
  )
}

const sortNames: Record<SortMode, string> = {
  'updated-desc': '最近更新',
  'updated-asc': '最早更新',
  'created-desc': '最近创建',
  title: '按标题',
}

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

type TagsHandle = {
  commit: () => boolean
  focus: () => void
  reset: () => void
}
function Tags({
  tags,
  onChange,
  ref,
}: {
  tags: string[]
  onChange: (tags: string[]) => void
  ref: Ref<TagsHandle>
}) {
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const errorId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const add = () => {
    const additions = value
      .split(/[,，\n]/)
      .map((tag) => tag.trim())
      .filter(Boolean)
    if (additions.some((tag) => tag.length > BACKUP_LIMITS.tag)) {
      setError(`单个标签最多 ${BACKUP_LIMITS.tag} 个字符，请缩短后添加。`)
      return false
    }
    const next = [...new Set([...tags, ...additions])]
    if (next.length > BACKUP_LIMITS.tags) {
      setError(
        `每张卡片最多 ${BACKUP_LIMITS.tags} 个标签，请先移除一些标签再添加。`,
      )
      return false
    }
    if (next.length > tags.length) onChange(next)
    setValue('')
    setError('')
    return true
  }
  useImperativeHandle(ref, () => ({
    commit: add,
    focus: () => inputRef.current?.focus(),
    reset: () => {
      setValue('')
      setError('')
    },
  }))
  const pending = Boolean(value.trim())
  useEffect(() => {
    if (!pending) return
    const protect = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', protect)
    return () => window.removeEventListener('beforeunload', protect)
  }, [pending])
  return (
    <>
      <div className="tags-editor">
        {tags.map((tag) => (
          <span className="tag editable-tag" key={tag}>
            {tag}
            <button
              aria-label={`移除标签 ${tag}`}
              onClick={() => {
                onChange(tags.filter((item) => item !== tag))
                setError('')
              }}
            >
              <X size={11} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          aria-label="添加标签"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          placeholder="+ 添加标签"
          value={value}
          onChange={(event) => {
            setValue(event.target.value)
            setError('')
          }}
          onBlur={add}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing || event.keyCode === 229) return
            if (event.key === 'Escape') {
              setValue('')
              setError('')
              return
            }
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
      {error && (
        <p className="field-error" id={errorId} role="alert">
          {error}
        </p>
      )}
    </>
  )
}

export default function App() {
  const {
    cards,
    cardsRef,
    loading,
    error,
    status,
    update,
    flush: saveChanges,
    discard,
    workspaceGeneration,
  } = useKnowledge()
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW()
  const [initialPreferences] = useState(() => readViewPreferences(demoMode))
  const [selectedId, setSelectedId] = useState<string | null>(
    initialPreferences.selectedId,
  )
  const [codeLanguages, setCodeLanguages] = useState(
    initialPreferences.languages,
  )
  const preferencesRestored = useRef(false)
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
    | 'knowledge-pack'
    | 'replace-workspace'
    | 'tags'
    | 'restore-full'
    | 'batch-tag'
    | 'batch-delete'
    | 'card-export'
    | null
  >(null)
  const [imported, setImported] = useState<Card[] | null>(null)
  const [fullBackup, setFullBackup] = useState<WorkspaceData | null>(null)
  const [importBaseline, setImportBaseline] = useState<string | null>(null)
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
  const [historyError, setHistoryError] = useState('')
  const [trashPreviewId, setTrashPreviewId] = useState<string | null>(null)
  const [trashError, setTrashError] = useState('')
  const [busy, setBusy] = useState(false)
  const backupInFlight = useRef(false)
  const [notice, setNotice] = useState('')
  const [deleted, setDeleted] = useState<Card | null>(null)
  const [listCursor, setListCursor] = useState<ListCursor>({
    id: null,
    index: 0,
    scope: '',
  })
  const [searchFocused, setSearchFocused] = useState(false)
  const [visibleCount, setVisibleCount] = useState(100)
  const [sortMode, setSortMode] = useState<SortMode>(
    initialPreferences.sortMode,
  )
  const [batchMode, setBatchMode] = useState(false)
  const [batchSelection, setBatchSelection] = useState<
    (CardSelection & { generation: string })[]
  >([])
  const [batchAction, setBatchAction] = useState<'add' | 'remove'>('add')
  const [batchTagValue, setBatchTagValue] = useState('')
  const [batchError, setBatchError] = useState('')
  const batchIdSet = useMemo(
    () => new Set(batchSelection.map(({ id }) => id)),
    [batchSelection],
  )
  const [pinnedIds, setPinnedIds] = useState<string[]>([])
  const [tagFrom, setTagFrom] = useState('')
  const [tagTo, setTagTo] = useState('')
  const [fullImport, setFullImport] = useState<FullSnapshot | null>(null)
  const [fullImportBaseline, setFullImportBaseline] = useState<string | null>(
    null,
  )
  const [lastBackup, setLastBackup] = useState<string | null>(null)
  const [backupReady, setBackupReady] = useState(false)
  const [reminderDismissed, setReminderDismissed] = useState(false)
  const [storageInfo, setStorageInfo] = useState<{
    usage?: number
    quota?: number
    persisted?: boolean
  } | null>(null)
  const knowledgePack = useMemo(() => makeKnowledgePackCards(), [])
  const searchRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  const tagsRef = useRef<TagsHandle>(null)
  const cardExportInFlight = useRef(false)
  const { tags, tagCounts, codeCards } = useMemo(
    () => summarizeCards(cards),
    [cards],
  )
  const results = useMemo(() => {
    const matches = searchCards(
      collection === 'code' ? codeCards : cards,
      query,
      tag,
    )
    if (query.trim()) return matches
    const pins = new Set(pinnedIds)
    return matches.sort((left, right) => {
      const pinOrder =
        Number(pins.has(right.card.id)) - Number(pins.has(left.card.id))
      if (pinOrder) return pinOrder
      if (sortMode === 'title')
        return left.card.title.localeCompare(right.card.title, 'zh-CN')
      const field = sortMode === 'created-desc' ? 'createdAt' : 'updatedAt'
      const direction = sortMode === 'updated-asc' ? 1 : -1
      return direction * left.card[field].localeCompare(right.card[field])
    })
  }, [cards, codeCards, query, tag, collection, pinnedIds, sortMode])
  const resultIds = useMemo(() => results.map(({ card }) => card.id), [results])
  const cursorScope = JSON.stringify([query, tag, collection])
  const cursor = resolveListCursor(resultIds, listCursor, cursorScope)
  const activeResultId = resultIds[cursor]
  const renderedCount = Math.max(visibleCount, cursor + 1)
  const rememberCursor = (index: number) => {
    setListCursor({ id: resultIds[index] ?? null, index, scope: cursorScope })
  }
  const selected = cards.find((card) => card.id === selectedId)
  const batchCards = cards.filter((card) => batchIdSet.has(card.id))
  const batchTags = [...new Set(batchCards.flatMap((card) => card.tags))].sort(
    (left, right) => left.localeCompare(right, 'zh-CN'),
  )
  const importConflicts =
    imported?.filter((card) => Object.hasOwn(importExisting, card.id)) ?? []
  const knowledgePackMissing = knowledgePack.filter(
    (card) => !cards.some((existing) => existing.id === card.id),
  )
  const needsBackup =
    backupReady &&
    !demoMode &&
    cards.length > 3 &&
    (!lastBackup ||
      Date.now() - Date.parse(lastBackup) > 30 * 24 * 60 * 60 * 1000)

  useEffect(() => {
    const subscription = liveQuery(() => db.pins.toArray()).subscribe({
      next: (pins) => setPinnedIds(pins.map(({ id }) => id)),
      error: (cause) => setNotice(errorText(cause)),
    })
    void getLastBackup()
      .then(setLastBackup)
      .catch((cause) => setNotice(errorText(cause)))
      .finally(() => setBackupReady(true))
    void refreshStorage()
    return () => subscription.unsubscribe()
  }, [])

  async function refreshStorage() {
    try {
      if (!navigator.storage) return
      const [estimate, persisted] = await Promise.all([
        navigator.storage.estimate?.(),
        navigator.storage.persisted?.(),
      ])
      setStorageInfo({
        usage: estimate?.usage,
        quota: estimate?.quota,
        persisted,
      })
    } catch {
      setStorageInfo(null)
    }
  }

  useEffect(() => {
    if (loading) return
    const restoring = !preferencesRestored.current
    preferencesRestored.current = true
    if (
      cards.length &&
      (!selectedId || (restoring && !cards.some(({ id }) => id === selectedId)))
    )
      setSelectedId(searchCards(cards, '', null)[0].card.id)
  }, [cards, loading, selectedId])
  useEffect(() => {
    if (!loading)
      writeViewPreferences(demoMode, {
        selectedId: selected?.id ?? null,
        sortMode,
        languages: codeLanguages,
      })
  }, [loading, selected?.id, sortMode, codeLanguages])
  useEffect(() => {
    setVisibleCount(100)
  }, [query, tag, collection])
  useEffect(() => {
    setBatchError('')
  }, [modal])
  useEffect(() => {
    setListCursor((current) => {
      const index = resolveListCursor(resultIds, current, cursorScope)
      const id = resultIds[index] ?? null
      return current.id === id &&
        current.index === index &&
        current.scope === cursorScope
        ? current
        : { id, index, scope: cursorScope }
    })
  }, [resultIds, cursorScope])
  useEffect(() => {
    setVisibleCount(renderedCount)
  }, [renderedCount])
  useEffect(() => {
    if (
      searchFocused &&
      document.activeElement === searchRef.current &&
      activeResultId
    )
      listRef.current?.children
        .item(cursor)
        ?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [activeResultId, cursor, renderedCount, resultIds, searchFocused])
  useEffect(() => {
    if (loading) return
    setBatchSelection((selection) => {
      if (!selection.length) return selection
      const existing = new Set(cards.map(({ id }) => id))
      const remaining = selection.filter(({ id }) => existing.has(id))
      return remaining.length === selection.length ? selection : remaining
    })
  }, [cards, loading])
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

  const commitPendingTags = () => {
    if (tagsRef.current?.commit() !== false) return true
    setModal(null)
    setSidebarOpen(false)
    setMobileDetail(true)
    setNotice(
      '待添加的标签还需要修正；请修正后添加，或按 Esc 清空，再继续操作。',
    )
    requestAnimationFrame(() => tagsRef.current?.focus())
    return false
  }
  const flush = async () => commitPendingTags() && (await saveChanges())
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
        const active = document.activeElement
        if (
          active instanceof HTMLInputElement ||
          active instanceof HTMLTextAreaElement ||
          (active instanceof HTMLElement && active.isContentEditable)
        )
          return
        titleRef.current?.focus()
        titleRef.current?.select()
      }, 80)
    } catch (cause) {
      setNotice(errorText(cause))
    } finally {
      setBusy(false)
    }
  }
  const addKnowledgePack = async (ids: string[]) => {
    setBusy(true)
    try {
      if (!(await flush())) {
        const message = '当前修改尚未保存，请先解决保存问题再添加知识卡片。'
        setNotice(message)
        return message
      }
      const requested = new Set(ids)
      const additions = makeKnowledgePackCards().filter((card) =>
        requested.has(card.id),
      )
      if (!additions.length) return '请先选择知识卡片。'
      const firstMissing = additions.find(
        (card) => !cardsRef.current.some((existing) => existing.id === card.id),
      )
      const result = await importCards(additions, 'skip')
      setModal(null)
      setSidebarOpen(false)
      setDeleted(null)
      setQuery('')
      setTag(null)
      setCollection('all')
      if (firstMissing && result.added) {
        setSelectedId(firstMissing.id)
        setTab('note')
        setEditing(false)
        setMobileDetail(true)
      }
      setNotice(
        result.added
          ? `已加入 ${result.added} 张知识卡片；已有 ${result.skipped} 张保持原样。`
          : '所选卡片已在工作区，现有卡片和修改保持原样。',
      )
    } catch (cause) {
      return errorText(cause)
    } finally {
      setBusy(false)
    }
  }
  const exportBackup = async () => {
    if (busy || backupInFlight.current) return
    if (!commitPendingTags()) return
    backupInFlight.current = true
    setBusy(true)
    try {
      const saved = await flush()
      const snapshot = structuredClone(cardsRef.current)
      let backup: { data: Blob; extension: string }
      let draft = false
      try {
        const workspace = await exportWorkspace()
        workspace.cards = snapshot
        backup = await createWorkspaceBackupFile(workspace)
      } catch (cause) {
        if (saved) throw cause
        backup = { data: createDraftFile(snapshot), extension: 'draft.json' }
        draft = true
      }
      const url = URL.createObjectURL(backup.data)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `pianduan-backup-${new Date().toISOString().slice(0, 10)}.${backup.extension}`
      anchor.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      if (!draft) {
        const now = new Date().toISOString()
        await recordBackup(now)
        setLastBackup(now)
      }
      setNotice(
        draft
          ? '已导出未校验草稿，保留全部原始内容。请修正文件中的无效字段或超限内容后再导入；浏览器内的修改仍未保存。'
          : saved
            ? `已导出 ${snapshot.length} 张卡片，以及历史版本和回收站。`
            : '已导出当前内存中的卡片、历史版本和回收站；浏览器内的修改仍未保存。',
      )
    } catch (cause) {
      setNotice(errorText(cause))
    } finally {
      backupInFlight.current = false
      setBusy(false)
    }
  }
  const exportFullBackup = async () => {
    if (!(await flush())) {
      setNotice('请先解决未保存的修改，再导出完整归档。')
      return
    }
    setBusy(true)
    try {
      const snapshot = await exportFullSnapshot()
      const file = await createFullBackupFile(snapshot)
      const url = URL.createObjectURL(file)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `pianduan-full-${new Date().toISOString().slice(0, 10)}.zip`
      anchor.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      await recordBackup(snapshot.exportedAt)
      setLastBackup(snapshot.exportedAt)
      setReminderDismissed(true)
      setNotice(
        `完整归档已导出：${snapshot.cards.length} 张卡片、${snapshot.history.length} 个历史版本、${snapshot.trash.length} 张回收站卡片。`,
      )
      void refreshStorage()
    } catch (cause) {
      setNotice(errorText(cause))
    } finally {
      setBusy(false)
    }
  }
  const copySelected = async () => {
    if (!selected || !(await flush())) return
    setBusy(true)
    try {
      const copy = await duplicateCard(selected.id)
      setSelectedId(copy.id)
      setTag(null)
      setQuery('')
      setCollection('all')
      setTab('note')
      setNotice('已创建独立副本，可以放心修改。')
    } catch (cause) {
      setNotice(errorText(cause))
    } finally {
      setBusy(false)
    }
  }
  const exportSelected = async (format: CardExportFormat) => {
    if (busy || cardExportInFlight.current || !selected) return
    if (!commitPendingTags()) return
    const current = cardsRef.current.find(({ id }) => id === selected.id)
    if (!current) {
      setModal(null)
      setNotice('这张卡片已变化，请重新选择后导出。')
      return
    }
    const snapshot = structuredClone(current)
    cardExportInFlight.current = true
    setBusy(true)
    try {
      const file = await createCardExport(snapshot, format)
      const url = URL.createObjectURL(file.data)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = file.filename
      anchor.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setModal(null)
      setNotice(
        '已导出此卡片当前内容。单卡导出不包含历史或回收站，请另外保留完整归档。',
      )
    } catch (cause) {
      setNotice(errorText(cause))
    } finally {
      cardExportInFlight.current = false
      setBusy(false)
    }
  }
  const changePin = async () => {
    if (!selected) return
    try {
      const pinned = await togglePin(selected.id)
      setNotice(pinned ? '卡片已置顶。' : '已取消置顶。')
    } catch (cause) {
      setNotice(errorText(cause))
    }
  }
  const toggleBatchCard = (id: string) => {
    const card = cardsRef.current.find((item) => item.id === id)
    if (!card) return
    const baseline = {
      id,
      revision: card.revision,
      generation: workspaceGeneration(),
    }
    setBatchSelection((selection) => {
      if (selection.some((item) => item.id === id))
        return selection.filter((item) => item.id !== id)
      if (selection.length >= 5000) {
        setNotice('一次最多整理 5000 张卡片。')
        return selection
      }
      return [...selection, baseline]
    })
  }
  const currentBatch = (): {
    cards: Card[]
    selection: CardSelection[]
    generation: string
  } => {
    const byId = new Map(cardsRef.current.map((card) => [card.id, card]))
    const chosen = batchSelection.map(({ id }) => byId.get(id))
    if (!chosen.length || chosen.some((card) => !card))
      throw new Error('选择的卡片已变化，请重新选择。')
    const generation = batchSelection[0].generation
    if (
      generation !== workspaceGeneration() ||
      batchSelection.some((entry) => entry.generation !== generation)
    )
      throw new Error('工作区已恢复或重置，请清空选择后重新选择卡片。')
    if (
      chosen.some(
        (card, index) => card!.revision !== batchSelection[index].revision,
      )
    )
      throw new Error('选中的卡片已发生修改，请清空选择后重新选择。')
    const current = chosen as Card[]
    return {
      cards: current,
      selection: batchSelection.map(({ id, revision }) => ({ id, revision })),
      generation,
    }
  }
  const applyBatchTag = async () => {
    if (!(await flush())) return
    setBusy(true)
    try {
      const { selection, generation } = currentBatch()
      const count = await batchTag(
        selection,
        batchAction,
        batchTagValue,
        generation,
      )
      setBatchSelection([])
      setModal(null)
      setNotice(
        `已为 ${count} 张卡片${batchAction === 'add' ? '添加' : '移除'}标签。`,
      )
    } catch (cause) {
      setBatchError(errorText(cause))
    } finally {
      setBusy(false)
    }
  }
  const applyBatchPin = async (pin: boolean) => {
    if (!(await flush())) return
    setBusy(true)
    try {
      const { selection, generation } = currentBatch()
      const count = await batchPin(selection, pin, generation)
      setBatchSelection([])
      setNotice(`已${pin ? '置顶' : '取消置顶'} ${count} 张卡片。`)
    } catch (cause) {
      setNotice(errorText(cause))
    } finally {
      setBusy(false)
    }
  }
  const applyBatchDelete = async () => {
    if (!(await flush())) return
    setBusy(true)
    try {
      const { selection, generation } = currentBatch()
      const count = await batchDelete(selection, generation)
      setBatchSelection([])
      setBatchMode(false)
      setDeleted(null)
      setSelectedId(null)
      setModal(null)
      setMobileDetail(false)
      setNotice(`已将 ${count} 张卡片移入回收站，可逐张恢复。`)
    } catch (cause) {
      setBatchError(errorText(cause))
    } finally {
      setBusy(false)
    }
  }
  const exportBatch = async () => {
    if (!(await flush())) return
    setBusy(true)
    try {
      const { cards: chosen } = currentBatch()
      const backup = await createBackupFile(chosen)
      const url = URL.createObjectURL(backup.data)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `pianduan-selected-${new Date().toISOString().slice(0, 10)}.${backup.extension}`
      anchor.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setNotice(`已导出选中的 ${chosen.length} 张卡片。`)
    } catch (cause) {
      setNotice(errorText(cause))
    } finally {
      setBusy(false)
    }
  }
  const applyTagRename = async () => {
    if (!(await flush())) return
    setBusy(true)
    try {
      const count = await renameTag(tagFrom, tagTo)
      if (tag === tagFrom) setTag(tagTo.trim())
      setModal(null)
      setNotice(`已更新 ${count} 张卡片的标签。`)
    } catch (cause) {
      setNotice(errorText(cause))
    } finally {
      setBusy(false)
    }
  }
  const applyFullRestore = async () => {
    if (!fullImport || !fullImportBaseline || !(await flush())) return
    setBusy(true)
    try {
      await replaceFullSnapshot(fullImport, fullImportBaseline)
      await discard()
      setSelectedId(null)
      setTag(null)
      setQuery('')
      setCollection('all')
      setMobileDetail(false)
      setEditing(false)
      setDeleted(null)
      setImported(null)
      setBatchMode(false)
      setBatchSelection([])
      setLastBackup(fullImport.exportedAt)
      setFullImport(null)
      setFullImportBaseline(null)
      setModal(null)
      setNotice('完整归档已恢复，卡片、历史、回收站和置顶状态均已载入。')
      void refreshStorage()
    } catch (cause) {
      setImportError(errorText(cause))
      setFullImport(null)
      setFullImportBaseline(null)
      setModal('backup')
    } finally {
      setBusy(false)
    }
  }
  const performImport = async () => {
    if (!imported || busy || backupInFlight.current) return
    backupInFlight.current = true
    setBusy(true)
    setImportError('')
    try {
      if (!(await flush())) return
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
      backupInFlight.current = false
      setBusy(false)
    }
  }
  const performFullRestore = async () => {
    if (!fullBackup || !importBaseline || busy || backupInFlight.current) return
    backupInFlight.current = true
    setBusy(true)
    setImportError('')
    try {
      if (!(await flush()))
        throw new Error('当前修改尚未保存，请先解决保存问题。')
      await replaceWorkspace(fullBackup, importBaseline)
      await discard()
      setSelectedId(fullBackup.cards[0]?.id ?? null)
      setDeleted(null)
      setModal(null)
      setFullBackup(null)
      setImported(null)
      setQuery('')
      setTag(null)
      setNotice(
        `完整恢复完成：${fullBackup.cards.length} 张卡片、${fullBackup.history.length} 条历史、${fullBackup.trash.length} 张回收站卡片。`,
      )
    } catch (cause) {
      setImportError(errorText(cause))
      setModal('backup')
    } finally {
      backupInFlight.current = false
      setBusy(false)
    }
  }
  const remove = async () => {
    if (!selected || !(await flush())) return
    setBusy(true)
    try {
      const latest = cardsRef.current.find((card) => card.id === selected.id)!
      await deleteCard(latest, workspaceGeneration())
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
    if (!selected || !commitPendingTags()) return
    setBusy(true)
    try {
      const copy = {
        ...cardsRef.current.find(({ id }) => id === selected.id)!,
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
    setBusy(true)
    try {
      setHistoryEntries(await listHistory(selected.id))
      setHistoryPreviewId(null)
      setHistoryError('')
      setModal('history')
    } catch (cause) {
      setNotice(errorText(cause))
      setHistoryError(errorText(cause))
    } finally {
      setBusy(false)
    }
  }
  const openTrash = async () => {
    setBusy(true)
    try {
      setDeletedEntries(await listTrash())
      setTrashPreviewId(null)
      setPendingPurge(null)
      setTrashError('')
      setModal('trash')
    } catch (cause) {
      setNotice(errorText(cause))
      setTrashError(errorText(cause))
    } finally {
      setBusy(false)
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
            <span className="nav-count">{codeCards.length}</span>
          </button>
        </nav>
        <div className="nav-caption tags-caption">
          标签
          <span>
            {tags.length}
            {!!tags.length && (
              <button
                className="tag-manage"
                onClick={() => {
                  setTagFrom(tags[0])
                  setTagTo('')
                  setModal('tags')
                }}
              >
                整理
              </button>
            )}
          </span>
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
              <span className="nav-count">{tagCounts.get(item)}</span>
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
        <button
          className="template-card knowledge-pack-card"
          onClick={() => setModal('knowledge-pack')}
          disabled={busy || loading}
        >
          <span className="template-icon">
            <BookOpen size={16} />
          </span>
          <strong>前端知识内容包</strong>
          <span>{knowledgePackMissing.length} 张可添加 · 附运行示例</span>
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
              setFullBackup(null)
              setImportBaseline(null)
              setImportName('')
              setImportExisting(Object.create(null))
              setImportChoices({})
              setFullImport(null)
              setFullImportBaseline(null)
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
        {needsBackup && !reminderDismissed && (
          <div className="backup-reminder" role="status">
            <span>
              {lastBackup
                ? `上次备份于 ${dateTime(lastBackup)}，建议更新备份。`
                : '这里已有你的笔记，建议导出一份备份。'}
            </span>
            <button onClick={() => setModal('backup')}>去备份</button>
            <button
              className="icon-button"
              aria-label="暂时关闭备份提醒"
              onClick={() => setReminderDismissed(true)}
            >
              <X size={14} />
            </button>
          </div>
        )}
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
                  searchFocused && activeResultId
                    ? `result-${activeResultId}`
                    : undefined
                }
                placeholder="搜索任何片段…"
                value={query}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.nativeEvent.isComposing || event.keyCode === 229)
                    return
                  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                    event.preventDefault()
                    if (results.length) {
                      const next = Math.max(
                        0,
                        Math.min(
                          results.length - 1,
                          cursor + (event.key === 'ArrowDown' ? 1 : -1),
                        ),
                      )
                      rememberCursor(next)
                    }
                  }
                  if (event.key === 'Enter' && results[cursor]) {
                    event.preventDefault()
                    if (batchMode) toggleBatchCard(results[cursor].card.id)
                    else void select(results[cursor].card)
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
                {query ? `${results.length} 个匹配结果` : sortNames[sortMode]}
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
              {query ? (
                <span>按相关度</span>
              ) : (
                <select
                  className="sort-select"
                  aria-label="卡片排序"
                  value={sortMode}
                  onChange={(event) =>
                    setSortMode(event.target.value as typeof sortMode)
                  }
                >
                  <option value="updated-desc">最近更新</option>
                  <option value="updated-asc">最早更新</option>
                  <option value="created-desc">最近创建</option>
                  <option value="title">按标题</option>
                </select>
              )}
            </div>
            {(results.length > 0 || batchMode) && (
              <div className="batch-controls">
                <button
                  className="text-button"
                  onClick={() => {
                    setBatchMode((value) => !value)
                    setBatchSelection([])
                  }}
                >
                  {batchMode ? '完成整理' : '批量整理'}
                </button>
                {batchMode && (
                  <span>已选 {batchCards.length} 张 · 点击卡片可选择</span>
                )}
              </div>
            )}
            {batchMode && (
              <div className="batch-toolbar" aria-label="批量操作">
                <div>
                  <button
                    onClick={() => {
                      const visible = results
                        .slice(0, renderedCount)
                        .map(({ card }) => ({
                          id: card.id,
                          revision: card.revision,
                          generation: workspaceGeneration(),
                        }))
                      setBatchSelection((selection) => {
                        const existing = new Set(selection.map(({ id }) => id))
                        return [
                          ...selection,
                          ...visible.filter(({ id }) => !existing.has(id)),
                        ].slice(0, 5000)
                      })
                    }}
                    disabled={!results.length || busy}
                  >
                    选中当前显示
                  </button>
                  <button
                    onClick={() => setBatchSelection([])}
                    disabled={!batchCards.length || busy}
                  >
                    清空选择
                  </button>
                </div>
                <div>
                  <button
                    disabled={!batchCards.length || busy}
                    onClick={() => {
                      setBatchAction('add')
                      setBatchTagValue('')
                      setModal('batch-tag')
                    }}
                  >
                    加标签
                  </button>
                  <button
                    disabled={!batchTags.length || busy}
                    onClick={() => {
                      setBatchAction('remove')
                      setBatchTagValue(batchTags[0])
                      setModal('batch-tag')
                    }}
                  >
                    移标签
                  </button>
                  <button
                    disabled={!batchCards.length || busy}
                    onClick={() => void applyBatchPin(true)}
                  >
                    置顶
                  </button>
                  <button
                    disabled={!batchCards.length || busy}
                    onClick={() => void applyBatchPin(false)}
                  >
                    取消置顶
                  </button>
                  <button
                    disabled={!batchCards.length || busy}
                    onClick={() => void exportBatch()}
                  >
                    导出选中
                  </button>
                  <button
                    className="batch-delete-trigger"
                    disabled={!batchCards.length || busy}
                    onClick={() => setModal('batch-delete')}
                  >
                    移入回收站
                  </button>
                </div>
              </div>
            )}
            <div
              id="search-results"
              ref={listRef}
              className="card-list"
              role="listbox"
              aria-multiselectable={batchMode}
              aria-label="知识卡片搜索结果"
            >
              {loading ? (
                <div className="list-empty">
                  <LoaderCircle className="spin" />
                  <p>正在打开知识库…</p>
                </div>
              ) : results.length ? (
                results
                  .slice(0, renderedCount)
                  .map(({ card, matchField, snippet }, index) => (
                    <button
                      id={`result-${card.id}`}
                      role="option"
                      tabIndex={index === cursor ? 0 : -1}
                      aria-selected={
                        batchMode
                          ? batchIdSet.has(card.id)
                          : card.id === selectedId
                      }
                      className={`card-item ${batchMode ? (batchIdSet.has(card.id) ? 'batch-selected' : '') : card.id === selectedId ? 'selected' : ''} ${searchFocused && index === cursor ? 'keyboard-current' : ''}`}
                      key={card.id}
                      onFocus={() => rememberCursor(index)}
                      onClick={() => {
                        rememberCursor(index)
                        if (batchMode) toggleBatchCard(card.id)
                        else void select(card)
                      }}
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
                          rememberCursor(next)
                          requestAnimationFrame(() =>
                            document
                              .getElementById(`result-${results[next].card.id}`)
                              ?.focus(),
                          )
                        }
                      }}
                    >
                      <div className="card-item-heading">
                        {batchMode && (
                          <span className="batch-check" aria-hidden="true">
                            {batchIdSet.has(card.id) && <Check size={12} />}
                          </span>
                        )}
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
                          {pinnedIds.includes(card.id) && (
                            <Pin size={11} aria-label="已置顶" />
                          )}
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
            {results.length > renderedCount && (
              <button
                className="load-more"
                onClick={() =>
                  setVisibleCount(
                    (count) => Math.max(count, renderedCount) + 100,
                  )
                }
              >
                加载更多（已显示 {renderedCount} / {results.length}）
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
                      aria-label={
                        pinnedIds.includes(selected.id)
                          ? '取消置顶卡片'
                          : '置顶卡片'
                      }
                      title={
                        pinnedIds.includes(selected.id) ? '取消置顶' : '置顶'
                      }
                      onClick={() => void changePin()}
                    >
                      <Pin
                        size={16}
                        fill={
                          pinnedIds.includes(selected.id)
                            ? 'currentColor'
                            : 'none'
                        }
                      />
                    </button>
                    <button
                      className="icon-button"
                      aria-label="复制当前卡片"
                      title="复制为新卡片"
                      onClick={() => void copySelected()}
                      disabled={busy}
                    >
                      <Copy size={16} />
                    </button>
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
                      <button
                        disabled={busy}
                        onClick={() => void exportBackup()}
                      >
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
                    <div className="note-tag-row">
                      <div className="note-tags">
                        <Tags
                          key={selected.id}
                          ref={tagsRef}
                          tags={selected.tags}
                          onChange={(value) =>
                            update(selected.id, { tags: value })
                          }
                        />
                      </div>
                      <button
                        className="text-button card-export-button"
                        onPointerDown={(event) => {
                          // Commit pending tags after the click; blur can otherwise move this button.
                          event.preventDefault()
                        }}
                        onClick={() => setModal('card-export')}
                        disabled={busy}
                      >
                        <Download size={13} /> 导出此卡片
                      </button>
                    </div>
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
                            key={selected.id}
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
                        <Markdown key={selected.id} body={selected.body} />
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
                      initialLanguage={rememberedLanguage(
                        codeLanguages,
                        selected.id,
                      )}
                      onLanguageChange={(language) =>
                        setCodeLanguages((current) =>
                          rememberLanguage(current, selected.id, language),
                        )
                      }
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
                <p>从列表选择卡片，或开始记录一个新的发现。</p>
                {error && (
                  <p className="field-error" role="alert">
                    {error}
                  </p>
                )}
                {mobileDetail && (
                  <button
                    className="text-button"
                    onClick={() => setMobileDetail(false)}
                  >
                    <ArrowLeft size={16} />
                    返回卡片列表
                  </button>
                )}
                <button
                  className="primary-button"
                  onClick={() => void addCard()}
                  disabled={loading || busy}
                >
                  <Plus size={16} />
                  {cards.length ? '新建卡片' : '新建第一张卡片'}
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
              disabled={busy}
              onClick={async () => {
                if (busy) return
                setBusy(true)
                try {
                  if (!(await flush())) {
                    setNotice('当前修改尚未保存，请先解决保存问题再撤销删除。')
                    return
                  }
                  const restored = await restoreCard(deleted)
                  setDeleted(null)
                  setSelectedId(restored.id)
                  setNotice('卡片已恢复。')
                } catch (cause) {
                  setNotice(errorText(cause))
                } finally {
                  setBusy(false)
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
                  tagsRef.current?.reset()
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
      {modal === 'knowledge-pack' && (
        <Dialog
          title="前端知识内容包"
          description={`包含 ${knowledgePack.length} 张专题笔记，每张都有可运行示例和参考来源。只添加当前工作区缺少的卡片，已有卡片及其修改会保留。`}
          onClose={() => {
            if (!busy) setModal(null)
          }}
        >
          <KnowledgePackBrowser
            lessons={knowledgePack}
            existingIds={cards.map((card) => card.id)}
            busy={busy}
            onAdd={addKnowledgePack}
            onClose={() => setModal(null)}
          />
        </Dialog>
      )}
      {modal === 'batch-tag' && (
        <Dialog
          title={batchAction === 'add' ? '批量添加标签' : '批量移除标签'}
          description={`已选 ${batchCards.length} 张卡片。只修改需要变化的卡片，并为每张变更保留历史版本。`}
          onClose={() => setModal(null)}
        >
          <div className="tag-rename-form">
            {batchAction === 'add' ? (
              <label>
                标签名称
                <input
                  value={batchTagValue}
                  maxLength={48}
                  placeholder="输入新标签或已有标签"
                  onChange={(event) => setBatchTagValue(event.target.value)}
                />
              </label>
            ) : (
              <label>
                要移除的标签
                <select
                  value={batchTagValue}
                  onChange={(event) => setBatchTagValue(event.target.value)}
                >
                  {batchTags.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          {batchError && (
            <p className="field-error" role="alert">
              {batchError}
            </p>
          )}
          <div className="dialog-actions">
            <button className="secondary-button" onClick={() => setModal(null)}>
              取消
            </button>
            <button
              className="primary-button"
              disabled={busy || !batchCards.length || !batchTagValue.trim()}
              onClick={() => void applyBatchTag()}
            >
              确认{batchAction === 'add' ? '添加' : '移除'}
            </button>
          </div>
        </Dialog>
      )}
      {modal === 'batch-delete' && (
        <Dialog
          title={`将 ${batchCards.length} 张卡片移入回收站？`}
          description="会同时移除这些卡片的置顶状态；卡片和历史版本仍可从回收站逐张恢复。若有卡片在其他页面发生变化，本次操作会整体停止。"
          onClose={() => setModal(null)}
        >
          {batchError && (
            <p className="field-error" role="alert">
              {batchError}
            </p>
          )}
          <div className="dialog-actions">
            <button className="secondary-button" onClick={() => setModal(null)}>
              取消
            </button>
            <button
              className="danger-button"
              disabled={busy || !batchCards.length}
              onClick={() => void applyBatchDelete()}
            >
              确认移入回收站
            </button>
          </div>
        </Dialog>
      )}
      {modal === 'tags' && (
        <Dialog
          title="整理标签"
          description="把一个标签改名，或填写已有标签名将两者合并。当前卡片会一起更新；历史版本保留当时的标签。"
          onClose={() => setModal(null)}
        >
          <div className="tag-rename-form">
            <label>
              原标签
              <select
                value={tagFrom}
                onChange={(event) => setTagFrom(event.target.value)}
              >
                {tags.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label>
              改为
              <input
                value={tagTo}
                maxLength={48}
                placeholder="输入新标签或已有标签"
                onChange={(event) => setTagTo(event.target.value)}
              />
            </label>
            <p>
              将更新{' '}
              {cards.filter((card) => card.tags.includes(tagFrom)).length}{' '}
              张卡片。
            </p>
          </div>
          <div className="dialog-actions">
            <button className="secondary-button" onClick={() => setModal(null)}>
              取消
            </button>
            <button
              className="primary-button"
              disabled={busy || !tagTo.trim() || tagTo.trim() === tagFrom}
              onClick={() => void applyTagRename()}
            >
              更新标签
            </button>
          </div>
        </Dialog>
      )}
      {modal === 'backup' && (
        <Dialog
          wide
          title="让每个片段，都有备份。"
          description="数据保存在当前浏览器中。推荐导出完整归档，包含卡片、历史、回收站和置顶状态；导入时会自动识别旧版备份。"
          onClose={() => {
            if (!busy) setModal(null)
          }}
        >
          <div className="backup-export">
            <span className="backup-icon">
              <Download size={22} />
            </span>
            <div>
              <strong>导出完整归档</strong>
              <p>{cards.length} 张卡片 · 正文、源码、历史、回收站与置顶状态</p>
            </div>
            <button
              className="primary-button"
              onClick={() => void exportFullBackup()}
              disabled={busy}
            >
              <Download size={14} />
              {busy ? '正在准备…' : '导出完整归档'}
            </button>
          </div>
          <div className="compat-backup-section">
            <div>
              <strong>需要兼容格式？</strong>
              <p>
                兼容备份包含卡片、历史和回收站，不包含置顶状态；适合与旧版本交换数据。
              </p>
            </div>
            <button
              className="text-button"
              onClick={() => void exportBackup()}
              disabled={busy}
            >
              <Download size={14} /> 导出兼容备份
            </button>
          </div>
          <div className="storage-summary">
            <strong>本地存储</strong>
            <span>
              上次备份：{lastBackup ? dateTime(lastBackup) : '尚无记录'} ·
              本站已用估计 {storageSize(storageInfo?.usage)} / 总配额估计{' '}
              {storageSize(storageInfo?.quota)}
            </span>
            {(!lastBackup ||
              Date.now() - Date.parse(lastBackup) >
                30 * 24 * 60 * 60 * 1000) && <span>建议现在导出备份。</span>}
            <span>
              {storageInfo?.persisted === true
                ? '浏览器已允许持久存储。'
                : storageInfo?.persisted === false
                  ? '当前未启用持久存储；清理站点数据仍可能删除笔记。'
                  : '浏览器未提供持久存储状态；请继续定期导出备份。'}
            </span>
            {storageInfo?.persisted === false && navigator.storage?.persist && (
              <button
                className="text-button"
                onClick={async () => {
                  try {
                    const granted = await navigator.storage.persist()
                    await refreshStorage()
                    if (granted)
                      setStorageInfo((current) => ({
                        ...current,
                        persisted: true,
                      }))
                    setNotice(
                      granted
                        ? '浏览器已允许持久存储，请继续定期导出备份。'
                        : '浏览器未授予持久存储，请继续定期导出备份。',
                    )
                  } catch (cause) {
                    setNotice(errorText(cause))
                  }
                }}
              >
                申请持久存储
              </button>
            )}
            <small>导出时间只记录本机发起下载，请确认文件已保存。</small>
          </div>
          <div className="import-section">
            <h3>
              <Upload size={16} /> 从备份导入
            </h3>
            <label className="file-drop">
              <Upload size={22} />
              <strong>{importName || '选择备份文件（JSON / ZIP）'}</strong>
              <span>
                自动识别完整归档和旧版备份 · 导入前校验 · ZIP 最大 100 MiB
              </span>
              <input
                aria-label="选择 JSON 或 ZIP 备份文件"
                type="file"
                accept=".json,.zip,application/json,application/zip"
                disabled={busy}
                onChange={async (event) => {
                  const input = event.currentTarget
                  const file = input.files?.[0]
                  if (!file || busy || backupInFlight.current) return
                  backupInFlight.current = true
                  setFullImport(null)
                  setFullImportBaseline(null)

                  setImported(null)
                  setFullBackup(null)
                  setImportBaseline(null)
                  setImportExisting(Object.create(null))
                  setImportChoices({})
                  setBackupPreviewId(null)
                  setImportVisible(30)
                  setImportName(file.name)
                  setImportError('')
                  setBusy(true)
                  try {
                    const parsed = await readAnyBackupFile(file)
                    if (!(await flush()))
                      throw new Error(
                        '当前修改尚未保存，请先解决保存问题后再导入。',
                      )
                    if (parsed.kind === 'full') {
                      setFullImport(parsed.snapshot)
                      setFullImportBaseline(await getWorkspaceMarker())
                      return
                    }
                    const byId = new Map(
                      cardsRef.current.map((card) => [card.id, card]),
                    )
                    const existing: Record<string, Card> = Object.create(null)
                    for (const card of parsed.workspace.cards) {
                      const current = byId.get(card.id)
                      if (current) existing[card.id] = current
                    }
                    const baseline = parsed.complete
                      ? await getWorkspaceMarker()
                      : null
                    setImportExisting(existing)
                    setImported(parsed.workspace.cards)
                    setFullBackup(parsed.complete ? parsed.workspace : null)
                    setImportBaseline(baseline)
                  } catch (cause) {
                    setImportError(errorText(cause))
                  } finally {
                    input.value = ''
                    backupInFlight.current = false
                    setBusy(false)
                  }
                }}
              />
            </label>
            {importError && (
              <p className="field-error" role="alert">
                {importError}
              </p>
            )}
            {fullImport && (
              <div className="full-backup-preview">
                <span>
                  校验通过：{fullImport.cards.length} 张卡片、
                  {fullImport.history.length} 个历史版本、
                  {fullImport.trash.length} 张回收站卡片、
                  {fullImport.pins.length} 张置顶卡片。
                </span>
                <button
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => setModal('restore-full')}
                >
                  恢复完整归档…
                </button>
              </div>
            )}
            {imported && (
              <div className="import-preview">
                <p>
                  <Check size={16} />
                  校验通过，共 {imported.length} 张卡片，
                  {importConflicts.length} 张 ID 与现有卡片相同。
                </p>
                {fullBackup && (
                  <div className="full-backup-choice">
                    <strong>
                      此备份还包含 {fullBackup.history.length} 条历史版本、
                      {fullBackup.trash.length} 张回收站卡片
                    </strong>
                    <p>
                      下方“仅导入卡片”沿用逐张冲突选择，不恢复历史和回收站。要连同这些数据一起恢复，请使用完整恢复；它会替换当前工作区的全部数据。
                    </p>
                    <button
                      className="secondary-button"
                      disabled={busy}
                      onClick={() => setModal('replace-workspace')}
                    >
                      恢复完整工作区
                    </button>
                  </div>
                )}
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
                                <pre tabIndex={0}>{cardContents(current)}</pre>
                              </div>
                              <div>
                                <strong>备份内容</strong>
                                <pre tabIndex={0}>{cardContents(card)}</pre>
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
                  {fullBackup ? '仅导入卡片' : '确认导入备份'}
                </button>
              </div>
            )}
          </div>
          <p className="backup-footnote">
            <ShieldCheck size={14} />{' '}
            逐张导入仅替换你明确选择的卡片；完整恢复需再次确认。备份文件不会上传到服务器。
          </p>
        </Dialog>
      )}
      {modal === 'replace-workspace' && fullBackup && (
        <Dialog
          title="恢复完整工作区？"
          description={`备份包含 ${fullBackup.cards.length} 张卡片、${fullBackup.history.length} 条历史版本和 ${fullBackup.trash.length} 张回收站卡片。当前工作区的卡片、历史、回收站和置顶状态都会被替换。`}
          onClose={() => {
            if (!busy) setModal('backup')
          }}
        >
          <p className="dialog-description">
            如需保留当前数据，请先取消并导出当前工作区。恢复期间若其他页面修改了本地数据，操作会停止。
          </p>
          <div className="dialog-actions">
            <button
              className="secondary-button"
              onClick={() => setModal('backup')}
            >
              取消
            </button>
            <button
              className="primary-button"
              disabled={busy}
              onClick={() => void performFullRestore()}
            >
              确认替换并完整恢复
            </button>
          </div>
        </Dialog>
      )}
      {modal === 'restore-full' && fullImport && (
        <Dialog
          title="替换当前工作区？"
          description={`将从 ${dateTime(fullImport.exportedAt)} 的完整归档恢复。当前 ${cards.length} 张卡片及其历史、回收站、置顶状态会被替换；建议先导出当前工作区的完整归档。若其他页面在预览后修改数据，恢复会停止。`}
          onClose={() => setModal('backup')}
        >
          <div className="dialog-actions">
            <button
              className="secondary-button"
              onClick={() => setModal('backup')}
            >
              返回检查
            </button>
            <button
              className="danger-button"
              disabled={busy}
              onClick={() => void applyFullRestore()}
            >
              确认替换并恢复
            </button>
          </div>
        </Dialog>
      )}
      {modal === 'card-export' && selected && (
        <Dialog
          title="导出此卡片"
          description="下载当前笔记或源码，也可带走尚未保存的草稿。此导出不包含历史、回收站或置顶状态；完整备份请使用“导入与备份”。"
          onClose={() => setModal(null)}
        >
          <div className="compat-backup-section">
            <div>
              <strong>Markdown 笔记</strong>
              <p>包含标题、正文、标签与来源，适合在其他笔记工具中阅读。</p>
            </div>
            <button
              className="secondary-button"
              onClick={() => void exportSelected('markdown')}
              disabled={busy}
            >
              导出 Markdown
            </button>
          </div>
          <div className="compat-backup-section">
            <div>
              <strong>源码 ZIP</strong>
              <p>
                包含笔记和 HTML、CSS、JavaScript
                原文件，保留空文件与原始换行，不会自动运行或拼接源码。
              </p>
            </div>
            <button
              className="secondary-button"
              onClick={() => void exportSelected('source')}
              disabled={busy}
            >
              导出源码 ZIP
            </button>
          </div>
        </Dialog>
      )}
      {modal === 'history' && selected && (
        <Dialog
          wide
          title="历史版本"
          description="连续编辑会按时间保留快照，最多 20 个；删除或恢复前也会保存当前版本。"
          onClose={() => setModal(null)}
        >
          <div className="recovery-toolbar">
            <button
              className="secondary-button"
              disabled={busy}
              onClick={() => void openHistory()}
            >
              刷新历史版本
            </button>
          </div>
          {historyError && (
            <p className="field-error" role="alert">
              {historyError}
            </p>
          )}
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
                      aria-expanded={historyPreviewId === entry.id}
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
                            entry,
                            selected.revision,
                          )
                          await discard()
                          setModal(null)
                          setNotice(
                            '已恢复所选历史版本；原内容已保留在历史记录中。',
                          )
                        } catch (cause) {
                          setHistoryError(errorText(cause))
                        } finally {
                          setBusy(false)
                        }
                      }}
                    >
                      恢复此版本
                    </button>
                  </div>
                  {historyPreviewId === entry.id && (
                    <CardComparison before={entry.card} after={selected} />
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
          wide
          title="回收站"
          description="删除的卡片会留在当前浏览器，恢复后重新出现在知识库。"
          onClose={() => setModal(null)}
        >
          <div className="recovery-toolbar">
            <button
              className="secondary-button"
              disabled={busy}
              onClick={() => void openTrash()}
            >
              刷新回收站
            </button>
          </div>
          {trashError && (
            <p className="field-error" role="alert">
              {trashError}
            </p>
          )}
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
                      className="secondary-button"
                      aria-expanded={trashPreviewId === entry.id}
                      onClick={() =>
                        setTrashPreviewId(
                          trashPreviewId === entry.id ? null : entry.id,
                        )
                      }
                    >
                      {trashPreviewId === entry.id ? '收起' : '查看内容'}
                    </button>
                    <button
                      className="primary-button"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true)
                        try {
                          if (!(await flush())) {
                            setModal(null)
                            setSidebarOpen(false)
                            setMobileDetail(true)
                            setNotice(
                              '当前修改尚未保存，请先解决保存问题再恢复卡片。',
                            )
                            return
                          }
                          const restored = await restoreDeletedCard(entry)
                          await discard()
                          setDeleted(null)
                          setSelectedId(restored.id)
                          setSidebarOpen(false)
                          setMobileDetail(true)
                          setModal(null)
                          setNotice('卡片已从回收站恢复。')
                        } catch (cause) {
                          setTrashError(errorText(cause))
                        } finally {
                          setBusy(false)
                        }
                      }}
                    >
                      恢复卡片
                    </button>
                    <button
                      className="secondary-button"
                      disabled={busy}
                      onClick={() => {
                        setTrashError('')
                        setPendingPurge(entry)
                        setModal('purge')
                      }}
                    >
                      永久删除
                    </button>
                  </div>
                  {trashPreviewId === entry.id && (
                    <section aria-label="已删除卡片内容">
                      <pre className="recovery-preview" tabIndex={0}>
                        {cardContents(entry.card)}
                      </pre>
                    </section>
                  )}
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
          {trashError && (
            <p className="field-error" role="alert">
              {trashError}
            </p>
          )}
          <div className="dialog-actions">
            <button
              className="secondary-button"
              onClick={() => setModal('trash')}
            >
              取消
            </button>
            {trashError && (
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() => void openTrash()}
              >
                刷新回收站
              </button>
            )}
            <button
              className="danger-button"
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                try {
                  await purgeDeletedCard(pendingPurge)
                  setDeletedEntries(await listTrash())
                  setDeleted(null)
                  setPendingPurge(null)
                  setTrashPreviewId(null)
                  setTrashError('')
                  setModal('trash')
                  setNotice('卡片已永久删除。')
                } catch (cause) {
                  setTrashError(errorText(cause))
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
