import { useCallback, useEffect, useRef, useState } from 'react'
import { liveQuery } from 'dexie'
import { db, loadCards, saveCard } from './db'
import type { Card } from './types'

export function useKnowledge() {
  const [cards, setCards] = useState<Card[]>([])
  const cardsRef = useRef<Card[]>([])
  const dirty = useRef(new Map<string, number>())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [status, setStatus] = useState<'saved' | 'saving' | 'error'>('saved')
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const inFlight = useRef<Promise<boolean> | null>(null)
  const errorRef = useRef('')
  const replace = useCallback((next: Card[]) => {
    cardsRef.current = next
    setCards(next)
  }, [])

  const flush = useCallback((): Promise<boolean> => {
    clearTimeout(timer.current)
    if (inFlight.current) return inFlight.current
    const work = async () => {
      if (!dirty.current.size) return true
      setStatus('saving')
      setError('')
      errorRef.current = ''
      while (dirty.current.size) {
        const [id, generation] = dirty.current.entries().next().value!
        const snapshot = cardsRef.current.find((card) => card.id === id)
        if (!snapshot) {
          dirty.current.delete(id)
          continue
        }
        try {
          const saved = await saveCard(snapshot)
          const unchanged = dirty.current.get(id) === generation
          if (unchanged) dirty.current.delete(id)
          replace(
            cardsRef.current.map((card) =>
              card.id !== id
                ? card
                : unchanged
                  ? saved
                  : { ...card, revision: saved.revision },
            ),
          )
        } catch (cause) {
          const message =
            cause instanceof Error
              ? cause.message
              : '无法保存到浏览器，请导出备份后重试。'
          setError(message)
          errorRef.current = message
          setStatus('error')
          return false
        }
      }
      setStatus('saved')
      return true
    }
    inFlight.current = work().finally(() => {
      inFlight.current = null
    })
    return inFlight.current
  }, [replace])

  const update = useCallback(
    (id: string, patch: Partial<Card>) => {
      dirty.current.set(id, (dirty.current.get(id) ?? 0) + 1)
      replace(
        cardsRef.current.map((card) =>
          card.id === id
            ? { ...card, ...patch, updatedAt: new Date().toISOString() }
            : card,
        ),
      )
      setStatus('saving')
      clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        void flush()
      }, 450)
    },
    [flush, replace],
  )

  const discard = useCallback(async () => {
    clearTimeout(timer.current)
    if (inFlight.current) await inFlight.current
    const latest = await loadCards()
    dirty.current.clear()
    replace(latest)
    setError('')
    errorRef.current = ''
    setStatus('saved')
  }, [replace])

  useEffect(() => {
    let active = true
    let subscription: { unsubscribe(): void } | undefined
    if (typeof indexedDB === 'undefined') {
      setError('浏览器未提供 IndexedDB。请允许此站点使用本地存储。')
      setLoading(false)
      setStatus('error')
      return
    }
    void loadCards()
      .then((initial) => {
        if (!active) return
        replace(initial)
        setLoading(false)
        subscription = liveQuery(() => db.cards.toArray()).subscribe({
          next(persisted) {
            if (!active) return
            const merged = persisted.map((card) =>
              dirty.current.has(card.id)
                ? (cardsRef.current.find((local) => local.id === card.id) ??
                  card)
                : card,
            )
            for (const local of cardsRef.current)
              if (
                dirty.current.has(local.id) &&
                !persisted.some((card) => card.id === local.id)
              )
                merged.push(local)
            replace(merged)
          },
          error(cause) {
            setError(String(cause))
            setStatus('error')
          },
        })
      })
      .catch((cause) => {
        if (active) {
          setError(cause instanceof Error ? cause.message : '浏览器存储不可用')
          setLoading(false)
          setStatus('error')
        }
      })
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty.current.size) {
        void flush()
        event.preventDefault()
        event.returnValue = ''
      }
    }
    const visibility = () => {
      if (
        document.visibilityState === 'hidden' &&
        dirty.current.size &&
        !errorRef.current
      )
        void flush()
    }
    window.addEventListener('beforeunload', beforeUnload)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      active = false
      subscription?.unsubscribe()
      clearTimeout(timer.current)
      window.removeEventListener('beforeunload', beforeUnload)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [flush, replace])

  return {
    cards,
    cardsRef,
    loading,
    error,
    status,
    update,
    flush,
    discard,
    replace,
  }
}
