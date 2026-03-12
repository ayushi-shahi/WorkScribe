import { useState, useRef } from 'react'
import { NavLink, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ChevronDown,
  ChevronRight,
  FileText,
  MoreHorizontal,
  Plus,
  Trash2,
  FilePen,
} from 'lucide-react'
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  closestCenter,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import toast from 'react-hot-toast'
import { deletePageApi } from '@/api/endpoints/wiki'
import type { PageTreeNode } from '@/api/endpoints/wiki'

// ── Props ──────────────────────────────────────────────────────────────────────

interface PageTreeProps {
  nodes: PageTreeNode[]
  spaceId: string
  onNewPage: (parentPageId: string | null) => void
  onRenamePage: (pageId: string, currentTitle: string) => void
}

// ── PageTree (root — owns the single DndContext) ───────────────────────────────

export default function PageTree({
  nodes,
  spaceId,
  onNewPage,
  onRenamePage,
}: PageTreeProps) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const { slug } = useParams<{ slug: string }>()

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  function findNode(id: string, list: PageTreeNode[]): PageTreeNode | null {
    for (const n of list) {
      if (n.id === id) return n
      const found = findNode(id, n.children)
      if (found) return found
    }
    return null
  }

  const activeNode = activeId ? findNode(activeId, nodes) : null

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string)
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null)
    const { active, over } = event
    if (!over || active.id === over.id) return
    // Reorder within same parent — invalidate to re-fetch correct order
    queryClient.invalidateQueries({ queryKey: ['page-tree', spaceId] })
  }

  if (!Array.isArray(nodes) || nodes.length === 0) return null

  return (
    // Single DndContext at root — no nested DndContexts in children
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      {/* Single flat SortableContext for root-level nodes */}
      <SortableContext
        items={nodes.map((n) => n.id)}
        strategy={verticalListSortingStrategy}
      >
        <PageTreeList
          nodes={nodes}
          spaceId={spaceId}
          slug={slug ?? ''}
          depth={0}
          onNewPage={onNewPage}
          onRenamePage={onRenamePage}
        />
      </SortableContext>

      <DragOverlay dropAnimation={null}>
        {activeNode ? (
          <div className="wiki-tree-drag-ghost">
            <FileText size={12} />
            <span>{activeNode.title}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

// ── PageTreeList (recursive — NO DndContext, uses parent's context) ────────────

function PageTreeList({
  nodes,
  spaceId,
  slug,
  depth,
  onNewPage,
  onRenamePage,
}: {
  nodes: PageTreeNode[]
  spaceId: string
  slug: string
  depth: number
  onNewPage: (parentPageId: string | null) => void
  onRenamePage: (pageId: string, currentTitle: string) => void
}) {
  if (!Array.isArray(nodes) || nodes.length === 0) return null

  return (
    <>
      {nodes.map((node) => (
        <PageTreeItem
          key={node.id}
          node={node}
          spaceId={spaceId}
          slug={slug}
          depth={depth}
          onNewPage={onNewPage}
          onRenamePage={onRenamePage}
        />
      ))}
    </>
  )
}

// ── PageTreeItem ───────────────────────────────────────────────────────────────

function PageTreeItem({
  node,
  spaceId,
  slug,
  depth,
  onNewPage,
  onRenamePage,
}: {
  node: PageTreeNode
  spaceId: string
  slug: string
  depth: number
  onNewPage: (parentPageId: string | null) => void
  onRenamePage: (pageId: string, currentTitle: string) => void
}) {
  const [expanded, setExpanded] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const hasChildren = Array.isArray(node.children) && node.children.length > 0
  const indentPx = 12 + depth * 16

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: node.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  const deleteMutation = useMutation({
    mutationFn: () => deletePageApi(node.id),
    onSuccess: () => {
      toast.success('Page deleted')
      queryClient.invalidateQueries({ queryKey: ['page-tree', spaceId] })
      navigate(`/org/${slug}/wiki/${spaceId}`)
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      const msg = err?.response?.data?.message ?? 'Failed to delete page'
      toast.error(msg)
    },
  })

  function handleDelete(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setMenuOpen(false)
    if (hasChildren) {
      toast.error('Delete child pages first before deleting this page.')
      return
    }
    if (confirm(`Delete "${node.title}"? This cannot be undone.`)) {
      deleteMutation.mutate()
    }
  }

  function handleMenuToggle(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setMenuOpen((v) => !v)
  }

  return (
    <div ref={setNodeRef} style={style} className="wiki-tree-item-wrap" {...attributes}>
      {/* Row */}
      <div className={`wiki-tree-item-row${menuOpen ? ' wiki-tree-item-row--menu-open' : ''}`}>
        <NavLink
          to={`/org/${slug}/wiki/${spaceId}/${node.id}`}
          className={({ isActive }) =>
            `wiki-tree-item${isActive ? ' active' : ''}`
          }
          style={{ paddingLeft: `${indentPx}px` }}
        >
          {/* Drag handle */}
          <span
            className="wiki-tree-drag-handle"
            {...listeners}
            onClick={(e) => e.preventDefault()}
          />

          {/* Expand/collapse */}
          <button
            className="wiki-tree-chevron"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              if (hasChildren) setExpanded((v) => !v)
            }}
            tabIndex={-1}
          >
            {hasChildren ? (
              expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />
            ) : (
              <span className="wiki-tree-leaf-dot" />
            )}
          </button>

          <FileText size={12} className="wiki-tree-page-icon" />
          <span className="wiki-tree-item-title">{node.title}</span>
        </NavLink>

        {/* ··· button — outside NavLink to avoid navigation on click */}
        <button
          className="wiki-tree-action-btn"
          onClick={handleMenuToggle}
          title="Options"
          tabIndex={-1}
        >
          <MoreHorizontal size={12} />
        </button>
      </div>

      {/* Options dropdown */}
      {menuOpen && (
        <>
          <div
            className="wiki-menu-backdrop"
            onClick={(e) => {
              e.stopPropagation()
              setMenuOpen(false)
            }}
          />
          <div className="wiki-options-menu" style={{ left: `${indentPx + 8}px` }}>
            <button
              className="wiki-options-item"
              onClick={(e) => {
                e.stopPropagation()
                setMenuOpen(false)
                onRenamePage(node.id, node.title)
              }}
            >
              <FilePen size={12} />
              <span>Rename</span>
            </button>
            <button
              className="wiki-options-item"
              onClick={(e) => {
                e.stopPropagation()
                setMenuOpen(false)
                onNewPage(node.id)
              }}
            >
              <Plus size={12} />
              <span>New child page</span>
            </button>
            <div className="wiki-options-divider" />
            <button
              className="wiki-options-item wiki-options-item--danger"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              <Trash2 size={12} />
              <span>{deleteMutation.isPending ? 'Deleting…' : 'Delete'}</span>
            </button>
          </div>
        </>
      )}

      {/* Children */}
      {hasChildren && expanded && (
        // No nested DndContext — children participate in parent's SortableContext
        <PageTreeList
          nodes={node.children}
          spaceId={spaceId}
          slug={slug}
          depth={depth + 1}
          onNewPage={onNewPage}
          onRenamePage={onRenamePage}
        />
      )}
    </div>
  )
}