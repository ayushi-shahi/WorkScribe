import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Search, FileText, CheckSquare, Clock, X } from 'lucide-react'
import { searchApi, type SearchResult } from '@/api/endpoints/search'
import { useUIStore } from '@/stores/uiStore'

const RECENTS_KEY = 'cmd-palette-recents'
const MAX_RECENTS = 8

interface RecentItem {
  id: string
  type: 'task' | 'page'
  title: string
  subtitle: string
}

function getRecents(): RecentItem[] {
  try {
    return JSON.parse(localStorage.getItem(RECENTS_KEY) ?? '[]') as RecentItem[]
  } catch {
    return []
  }
}

function addRecent(item: RecentItem): void {
  try {
    const existing = getRecents().filter((r) => r.id !== item.id)
    const updated = [item, ...existing].slice(0, MAX_RECENTS)
    localStorage.setItem(RECENTS_KEY, JSON.stringify(updated))
  } catch {
    // ignore
  }
}

// ── CommandPalette ─────────────────────────────────────────────────────────────
export default function CommandPalette() {
  const { slug } = useParams<{ slug: string }>()
  const navigate  = useNavigate()
  const isOpen    = useUIStore((s) => s.isCommandPaletteOpen)
  const close     = useUIStore((s) => s.closeCommandPalette)

  const [query, setQuery]         = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const [recents, setRecents]     = useState<RecentItem[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef  = useRef<HTMLDivElement>(null)

  // Load recents from localStorage whenever palette opens
  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setActiveIdx(0)
      setRecents(getRecents())
      setTimeout(() => inputRef.current?.focus(), 10)
    }
  }, [isOpen])

  // Search query
  const trimmed = query.trim()

  const { data: rawSearch, isFetching } = useQuery({
    queryKey: ['cmd-search', slug, trimmed],
    queryFn: () => searchApi(slug ?? '', trimmed),
    enabled: !!slug && trimmed.length >= 1,
    staleTime: 10_000,
  })

  // Search API returns { data: SearchResult[], total: number } — same as links API
  const searchResults: SearchResult[] = (() => {
    if (!rawSearch) return []
    if (Array.isArray(rawSearch)) return rawSearch as SearchResult[]
    const r = rawSearch as { data?: SearchResult[]; results?: SearchResult[] }
    return r.data ?? r.results ?? []
  })()

  // Items list for keyboard nav: recents when empty, search results when typing
  const showRecents = trimmed.length === 0
  const items: (SearchResult | RecentItem)[] = showRecents ? recents : searchResults

  // Reset active index when items change
  useEffect(() => {
    setActiveIdx(0)
  }, [items.length, trimmed])

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${activeIdx}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIdx])

  function navigateToItem(item: SearchResult | RecentItem) {
    if (!slug) return

    const recent: RecentItem = {
      id: item.id,
      type: item.type,
      title: item.title,
      subtitle: item.subtitle,
    }
    addRecent(recent)
    setRecents(getRecents())

    if (item.type === 'task') {
      // subtitle is like "APP-5 · In Progress" — extract task_id
      const taskId = item.subtitle.split('·')[0].trim()
      navigate(`/org/${slug}/projects/APP/board?task=${taskId}`)
    } else {
      // page — navigate to wiki root (space_id not returned by search API)
      navigate(`/org/${slug}/wiki`)
    }
    close()
  }

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIdx((i) => Math.min(i + 1, items.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIdx((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const item = items[activeIdx]
        if (item) navigateToItem(item)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        close()
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, activeIdx, slug]
  )

  function handleOverlayClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) close()
  }

  if (!isOpen) return null

  const taskResults = searchResults.filter((r) => r.type === 'task')
  const pageResults = searchResults.filter((r) => r.type === 'page')
  const hasResults  = searchResults.length > 0
  const hasRecents  = recents.length > 0

  return (
    <div className="cp-overlay" onMouseDown={handleOverlayClick}>
      <div className="cp-modal" role="dialog" aria-label="Command palette" aria-modal="true">

        {/* ── Search input ───────────────────────────────────────────── */}
        <div className="cp-input-wrap">
          <Search size={15} className="cp-search-icon" />
          <input
            ref={inputRef}
            className="cp-input"
            placeholder="Search tasks, docs, people…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            autoComplete="off"
            spellCheck={false}
          />
          {query.length > 0 && (
            <button className="cp-clear" onClick={() => setQuery('')} aria-label="Clear">
              <X size={13} />
            </button>
          )}
          <kbd className="cp-esc-hint">esc</kbd>
        </div>

        {/* ── Results ───────────────────────────────────────────────── */}
        <div className="cp-body" ref={listRef}>

          {isFetching && trimmed.length > 0 && (
            <div className="cp-loading">Searching…</div>
          )}

          {!isFetching && trimmed.length > 0 && !hasResults && (
            <div className="cp-empty">No results for "{trimmed}"</div>
          )}

          {showRecents && hasRecents && (
            <div className="cp-group">
              <div className="cp-group-label">
                <Clock size={11} />
                Recent
              </div>
              {recents.map((item, i) => (
                <CPItem
                  key={item.id}
                  item={item}
                  idx={i}
                  isActive={activeIdx === i}
                  onSelect={navigateToItem}
                  onHover={setActiveIdx}
                />
              ))}
            </div>
          )}

          {showRecents && !hasRecents && (
            <div className="cp-empty">Type to search tasks and docs…</div>
          )}

          {!showRecents && !isFetching && taskResults.length > 0 && (
            <div className="cp-group">
              <div className="cp-group-label">
                <CheckSquare size={11} />
                Tasks
              </div>
              {taskResults.map((item, i) => (
                <CPItem
                  key={item.id}
                  item={item}
                  idx={i}
                  isActive={activeIdx === i}
                  onSelect={navigateToItem}
                  onHover={setActiveIdx}
                />
              ))}
            </div>
          )}

          {!showRecents && !isFetching && pageResults.length > 0 && (
            <div className="cp-group">
              <div className="cp-group-label">
                <FileText size={11} />
                Docs
              </div>
              {pageResults.map((item, i) => (
                <CPItem
                  key={item.id}
                  item={item}
                  idx={taskResults.length + i}
                  isActive={activeIdx === taskResults.length + i}
                  onSelect={navigateToItem}
                  onHover={setActiveIdx}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── Footer hint ───────────────────────────────────────────── */}
        <div className="cp-footer">
          <span><kbd>↑↓</kbd> navigate</span>
          <span><kbd>↵</kbd> select</span>
          <span><kbd>esc</kbd> close</span>
        </div>
      </div>
    </div>
  )
}

// ── CPItem ─────────────────────────────────────────────────────────────────────
interface CPItemProps {
  item: SearchResult | RecentItem
  idx: number
  isActive: boolean
  onSelect: (item: SearchResult | RecentItem) => void
  onHover: (idx: number) => void
}

function CPItem({ item, idx, isActive, onSelect, onHover }: CPItemProps) {
  return (
    <button
      className={`cp-item${isActive ? ' cp-item--active' : ''}`}
      data-idx={idx}
      onClick={() => onSelect(item)}
      onMouseEnter={() => onHover(idx)}
    >
      <span className="cp-item-icon">
        {item.type === 'task' ? <CheckSquare size={13} /> : <FileText size={13} />}
      </span>
      <span className="cp-item-content">
        <span className="cp-item-title">{item.title}</span>
        <span className="cp-item-subtitle">{item.subtitle}</span>
      </span>
    </button>
  )
}