import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useImperativeHandle,
  forwardRef,
} from 'react'
import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Code,
  Code2,
  List,
  ListOrdered,
  Quote,
  Minus,
  Link as LinkIcon,
  Table as TableIcon,
  Heading1,
  Heading2,
  Heading3,
  Undo2,
  Redo2,
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface WikiEditorHandle {
  getJSON: () => Record<string, unknown>
  isEmpty: () => boolean
  focus: () => void
}

interface WikiEditorProps {
  pageId: string
  initialContent: Record<string, unknown> | null
  onChange?: (json: Record<string, unknown>) => void
  onReady?: (editor: Editor) => void
}

// ── localStorage helpers ───────────────────────────────────────────────────────

export function draftKey(pageId: string) {
  return `page:${pageId}`
}

function loadDraft(pageId: string): Record<string, unknown> | null {
  try {
    const raw = localStorage.getItem(draftKey(pageId))
    if (!raw) return null
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return null
  }
}

export function saveDraft(pageId: string, json: Record<string, unknown>) {
  try {
    localStorage.setItem(draftKey(pageId), JSON.stringify(json))
  } catch {
    // storage quota — silently ignore
  }
}

export function clearDraft(pageId: string) {
  try {
    localStorage.removeItem(draftKey(pageId))
  } catch {
    // ignore
  }
}

// ── Toolbar button ─────────────────────────────────────────────────────────────

interface TBProps {
  onClick: () => void
  active?: boolean
  disabled?: boolean
  title: string
  children: React.ReactNode
}

function TB({ onClick, active, disabled, title, children }: TBProps) {
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault()
        if (!disabled) onClick()
      }}
      className={[
        'wiki-tb-btn',
        active ? 'wiki-tb-btn--active' : '',
        disabled ? 'wiki-tb-btn--disabled' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      title={title}
      aria-label={title}
    >
      {children}
    </button>
  )
}

function TBDivider() {
  return <div className="wiki-tb-divider" />
}

// ── Link popover ───────────────────────────────────────────────────────────────

function LinkPopover({
  defaultHref,
  onConfirm,
  onCancel,
}: {
  defaultHref: string
  onConfirm: (url: string) => void
  onCancel: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      onConfirm(inputRef.current?.value ?? '')
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
    }
  }

  return (
    <div className="wiki-link-popover">
      <input
        ref={inputRef}
        className="wiki-link-popover-input"
        defaultValue={defaultHref}
        placeholder="https://…"
        onKeyDown={handleKey}
        spellCheck={false}
      />
      <button
        type="button"
        className="wiki-link-popover-confirm"
        onMouseDown={(e) => {
          e.preventDefault()
          onConfirm(inputRef.current?.value ?? '')
        }}
      >
        Apply
      </button>
      {defaultHref && (
        <button
          type="button"
          className="wiki-link-popover-remove"
          onMouseDown={(e) => {
            e.preventDefault()
            onConfirm('')
          }}
        >
          Remove
        </button>
      )}
    </div>
  )
}

// ── Slash command menu ─────────────────────────────────────────────────────────

interface SlashItem {
  label: string
  description: string
  icon: React.ReactNode
  action: (editor: Editor) => void
}

function getSlashItems(editor: Editor): SlashItem[] {
  return [
    {
      label: 'Heading 1',
      description: 'Large section heading',
      icon: <Heading1 size={14} />,
      action: (e) => e.chain().focus().toggleHeading({ level: 1 }).run(),
    },
    {
      label: 'Heading 2',
      description: 'Medium section heading',
      icon: <Heading2 size={14} />,
      action: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      label: 'Heading 3',
      description: 'Small section heading',
      icon: <Heading3 size={14} />,
      action: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(),
    },
    {
      label: 'Bullet List',
      description: 'Unordered list of items',
      icon: <List size={14} />,
      action: (e) => e.chain().focus().toggleBulletList().run(),
    },
    {
      label: 'Numbered List',
      description: 'Ordered list of items',
      icon: <ListOrdered size={14} />,
      action: (e) => e.chain().focus().toggleOrderedList().run(),
    },
    {
      label: 'Blockquote',
      description: 'Highlighted quote or callout',
      icon: <Quote size={14} />,
      action: (e) => e.chain().focus().toggleBlockquote().run(),
    },
    {
      label: 'Code Block',
      description: 'Monospace code block',
      icon: <Code2 size={14} />,
      action: (e) => e.chain().focus().toggleCodeBlock().run(),
    },
    {
      label: 'Divider',
      description: 'Horizontal rule separator',
      icon: <Minus size={14} />,
      action: (e) => e.chain().focus().setHorizontalRule().run(),
    },
    {
      label: 'Table',
      description: '3×3 table to start',
      icon: <TableIcon size={14} />,
      action: (e) =>
        e
          .chain()
          .focus()
          .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
          .run(),
    },
  ]
}

function SlashMenu({
  editor,
  query,
  onSelect,
  onClose,
}: {
  editor: Editor
  query: string
  onSelect: (item: SlashItem) => void
  onClose: () => void
}) {
  const [activeIdx, setActiveIdx] = useState(0)
  const allItems = getSlashItems(editor)
  const items = allItems.filter(
    (i) =>
      query === '' || i.label.toLowerCase().includes(query.toLowerCase())
  )

  useEffect(() => {
    setActiveIdx(0)
  }, [query])

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        e.stopPropagation()
        setActiveIdx((i) => (i + 1) % Math.max(items.length, 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        e.stopPropagation()
        setActiveIdx((i) => (i - 1 + Math.max(items.length, 1)) % Math.max(items.length, 1))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        e.stopPropagation()
        const item = items[activeIdx]
        if (item) onSelect(item)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKey, true)
    return () => window.removeEventListener('keydown', handleKey, true)
  }, [activeIdx, items, onSelect, onClose])

  if (items.length === 0) return null

  return (
    <div className="wiki-slash-menu" onMouseDown={(e) => e.preventDefault()}>
      <div className="wiki-slash-menu-hint">Commands</div>
      {items.map((item, idx) => (
        <button
          key={item.label}
          type="button"
          className={`wiki-slash-item${
            idx === activeIdx ? ' wiki-slash-item--active' : ''
          }`}
          onMouseDown={(e) => {
            e.preventDefault()
            onSelect(item)
          }}
        >
          <span className="wiki-slash-item-icon">{item.icon}</span>
          <span className="wiki-slash-item-text">
            <span className="wiki-slash-item-label">{item.label}</span>
            <span className="wiki-slash-item-desc">{item.description}</span>
          </span>
        </button>
      ))}
    </div>
  )
}

// ── WikiEditor ─────────────────────────────────────────────────────────────────

const WikiEditor = forwardRef<WikiEditorHandle, WikiEditorProps>(
  function WikiEditor({ pageId, initialContent, onChange, onReady }, ref) {
    const [showLinkPopover, setShowLinkPopover] = useState(false)
    const [showSlashMenu, setShowSlashMenu] = useState(false)
    const [slashQuery, setSlashQuery] = useState('')
    const onReadyFired = useRef(false)
    const prevPageId = useRef(pageId)

    // Determine start content once: draft > server > empty
    const getStartContent = useCallback(() => {
      const draft = loadDraft(pageId)
      return draft ?? initialContent
    }, [pageId, initialContent])

    const editor = useEditor({
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3] },
        }),
        Placeholder.configure({
          placeholder: ({ node }) => {
            if (node.type.name === 'heading') return 'Heading'
            return "Write something, or type '/' for commands…"
          },
          emptyNodeClass: 'wiki-editor-empty-node',
        }),
        Underline,
        Link.configure({
          openOnClick: false,
          HTMLAttributes: {
            class: 'wiki-editor-link',
            rel: 'noopener noreferrer',
          },
        }),
        Table.configure({ resizable: false }),
        TableRow,
        TableHeader,
        TableCell,
      ],
      content: getStartContent() ?? '',
      onUpdate({ editor: e }) {
        const json = e.getJSON() as Record<string, unknown>
        saveDraft(pageId, json)
        onChange?.(json)
      },
    })

    // Fire onReady once
    useEffect(() => {
      if (editor && !onReadyFired.current) {
        onReadyFired.current = true
        onReady?.(editor)
      }
    }, [editor, onReady])

    // Expose handle
    useImperativeHandle(
      ref,
      () => ({
        getJSON: () => (editor?.getJSON() as Record<string, unknown>) ?? {},
        isEmpty: () => editor?.isEmpty ?? true,
        focus: () => {
          editor?.commands.focus()
        },
      }),
      [editor]
    )

    // When pageId changes, reload content
    useEffect(() => {
      if (!editor) return
      if (prevPageId.current === pageId) return
      prevPageId.current = pageId
      const content = loadDraft(pageId) ?? initialContent
      editor.commands.setContent(content ?? '')
      setShowSlashMenu(false)
      setShowLinkPopover(false)
      setSlashQuery('')
    }, [pageId, initialContent, editor])

    // Detect '/' on an empty line to open slash menu
    useEffect(() => {
      if (!editor || !editor.isEditable) return

      let dom: Element
      try {
        dom = editor.view.dom
      } catch {
        return
      }

      function handleKeyDown(e: KeyboardEvent) {
        if (!editor) return

        if (showSlashMenu) {
          if (e.key === 'Backspace') {
            setSlashQuery((prev) => {
              if (prev.length === 0) {
                setShowSlashMenu(false)
                return prev
              }
              return prev.slice(0, -1)
            })
            return
          }
          if (
            e.key.length === 1 &&
            !e.ctrlKey &&
            !e.metaKey &&
            e.key !== 'Enter' &&
            e.key !== 'ArrowUp' &&
            e.key !== 'ArrowDown'
          ) {
            setSlashQuery((prev) => prev + e.key)
          }
          return
        }

        if (e.key === '/') {
          const { $from } = editor.state.selection
          const isEmpty =
            $from.parent.textContent === '' && $from.parentOffset === 0
          if (isEmpty) {
            setTimeout(() => {
              setShowSlashMenu(true)
              setSlashQuery('')
            }, 10)
          }
        }
      }

  dom.addEventListener('keydown', handleKeyDown as EventListener)
  return () => dom.removeEventListener('keydown', handleKeyDown as EventListener)
}, [editor, editor?.isEditable, showSlashMenu])
    

    // ── Link helpers ────────────────────────────────────────────
    function handleLinkConfirm(url: string) {
      if (!editor) return
      if (!url) {
        editor.chain().focus().unsetLink().run()
      } else {
        const href = url.startsWith('http') ? url : `https://${url}`
        editor.chain().focus().setLink({ href }).run()
      }
      setShowLinkPopover(false)
    }

    function handleSlashSelect(item: SlashItem) {
      if (!editor) return
      const { from } = editor.state.selection
      editor
        .chain()
        .focus()
        .deleteRange({ from: from - 1, to: from })
        .run()
      item.action(editor)
      setShowSlashMenu(false)
      setSlashQuery('')
    }

    if (!editor) return null

    const currentHref =
      (editor.getAttributes('link').href as string | undefined) ?? ''

    return (
      <div className="wiki-editor-wrap">
        {/* ── Toolbar ──────────────────────────────────── */}
        <div className="wiki-toolbar">
          <TB
            title="Undo (⌘Z)"
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
          >
            <Undo2 size={13} />
          </TB>
          <TB
            title="Redo (⌘⇧Z)"
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
          >
            <Redo2 size={13} />
          </TB>

          <TBDivider />

          <TB
            title="Heading 1"
            active={editor.isActive('heading', { level: 1 })}
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 1 }).run()
            }
          >
            <Heading1 size={13} />
          </TB>
          <TB
            title="Heading 2"
            active={editor.isActive('heading', { level: 2 })}
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 2 }).run()
            }
          >
            <Heading2 size={13} />
          </TB>
          <TB
            title="Heading 3"
            active={editor.isActive('heading', { level: 3 })}
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 3 }).run()
            }
          >
            <Heading3 size={13} />
          </TB>

          <TBDivider />

          <TB
            title="Bold (⌘B)"
            active={editor.isActive('bold')}
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            <Bold size={13} />
          </TB>
          <TB
            title="Italic (⌘I)"
            active={editor.isActive('italic')}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            <Italic size={13} />
          </TB>
          <TB
            title="Underline (⌘U)"
            active={editor.isActive('underline')}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
          >
            <UnderlineIcon size={13} />
          </TB>
          <TB
            title="Strikethrough"
            active={editor.isActive('strike')}
            onClick={() => editor.chain().focus().toggleStrike().run()}
          >
            <Strikethrough size={13} />
          </TB>
          <TB
            title="Inline code"
            active={editor.isActive('code')}
            onClick={() => editor.chain().focus().toggleCode().run()}
          >
            <Code size={13} />
          </TB>

          <TBDivider />

          <TB
            title="Bullet list"
            active={editor.isActive('bulletList')}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          >
            <List size={13} />
          </TB>
          <TB
            title="Numbered list"
            active={editor.isActive('orderedList')}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          >
            <ListOrdered size={13} />
          </TB>
          <TB
            title="Blockquote"
            active={editor.isActive('blockquote')}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
          >
            <Quote size={13} />
          </TB>
          <TB
            title="Code block"
            active={editor.isActive('codeBlock')}
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          >
            <Code2 size={13} />
          </TB>

          <TBDivider />

          <div className="wiki-tb-link-wrap">
            <TB
              title="Link (⌘K)"
              active={editor.isActive('link')}
              onClick={() => setShowLinkPopover((v) => !v)}
            >
              <LinkIcon size={13} />
            </TB>
            {showLinkPopover && (
              <LinkPopover
                defaultHref={currentHref}
                onConfirm={handleLinkConfirm}
                onCancel={() => setShowLinkPopover(false)}
              />
            )}
          </div>

          <TB
            title="Insert table"
            active={editor.isActive('table')}
            onClick={() =>
              editor
                .chain()
                .focus()
                .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
                .run()
            }
          >
            <TableIcon size={13} />
          </TB>

          <TB
            title="Horizontal divider"
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
          >
            <Minus size={13} />
          </TB>
        </div>

        {/* ── Editor content ─────────────────────────── */}
        <div className="wiki-editor-content-wrap">
          <EditorContent editor={editor} className="wiki-editor-content" />

          {showSlashMenu && (
            <>
              <div
                className="wiki-slash-backdrop"
                onMouseDown={() => {
                  setShowSlashMenu(false)
                  setSlashQuery('')
                }}
              />
              <SlashMenu
                editor={editor}
                query={slashQuery}
                onSelect={handleSlashSelect}
                onClose={() => {
                  setShowSlashMenu(false)
                  setSlashQuery('')
                }}
              />
            </>
          )}
        </div>
      </div>
    )
  }
)

export default WikiEditor