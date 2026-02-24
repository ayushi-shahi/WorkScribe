# Design Document
## UI/UX Specification
**Version:** 1.0.0 | **Status:** Approved | **Last Updated:** February 2026

---

## 1. Design Philosophy

| Principle | Description |
|-----------|-------------|
| **Density over whitespace** | Developers work in dense environments. The UI is information-rich without feeling cluttered. |
| **Context over navigation** | Users rarely leave their current view. Task details open as slide-in panels. Linked docs appear inline. |
| **Speed as UX** | Every mutation has an optimistic update. No spinners for common actions — UI moves first, API confirms. |
| **Progressive disclosure** | Simple by default. Advanced filters and sprint config are one level deep, not hidden. |

---

## 2. Design System

### 2.1 Color Palette

```css
:root {
  /* Backgrounds */
  --bg:           #F7F7F8;   /* App background */
  --surface:      #FFFFFF;   /* Cards, panels, sidebar */
  --surface2:     #F3F3F5;   /* Inputs, hover, alt rows */

  /* Borders */
  --border:       #E4E4E8;   /* Primary borders */
  --border2:      #EBEBEF;   /* Subtle dividers */

  /* Text */
  --text-primary:   #111118;
  --text-secondary: #5C5C6E;
  --text-muted:     #9898A8;

  /* Brand */
  --brand:        #5B4FE8;   /* Primary actions, active states */
  --brand-light:  #EEF0FD;   /* Hover, selected rows, chip bg */
  --brand-mid:    #C4C0F8;   /* Borders on brand elements */

  /* Semantic */
  --green:        #16A34A;
  --green-bg:     #DCFCE7;
  --amber:        #D97706;
  --amber-bg:     #FEF3C7;
  --red:          #DC2626;
  --red-bg:       #FEE2E2;
  --blue:         #2563EB;
  --blue-bg:      #DBEAFE;

  /* Priority */
  --p-urgent:     #DC2626;
  --p-high:       #F97316;
  --p-medium:     #EAB308;
  --p-low:        #9898A8;
}
```

### 2.2 Typography

| Role | Font | Weight | Size |
|------|------|--------|------|
| App font | Plus Jakarta Sans | 300–800 | — |
| Monospace | JetBrains Mono | 400–600 | — |
| Page/section titles | Plus Jakarta Sans | 700–800 | 18–26px |
| Body text | Plus Jakarta Sans | 400 | 13–14px |
| Task IDs, code | JetBrains Mono | 500–600 | 10–12px |
| Labels, captions | Plus Jakarta Sans | 600 | 10–11px |

```html
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
```

### 2.3 Spacing Scale
Base unit: 4px. Scale: `4, 8, 12, 16, 20, 24, 32, 40, 48, 64px`

### 2.4 Border Radius
| Name | Value | Usage |
|------|-------|-------|
| `--radius-sm` | `5px` | Chips, inputs, small buttons |
| `--radius` | `8px` | Cards, dropdowns, panels |
| `--radius-lg` | `12px` | Modals, large panels |
| `--radius-full` | `9999px` | Avatars, toggle pills |

### 2.5 Shadows
```css
--shadow-sm: 0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);
--shadow-md: 0 4px 12px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04);
--shadow-lg: 0 12px 32px rgba(0,0,0,0.12), 0 4px 8px rgba(0,0,0,0.06);
```

### 2.6 Icons
**Library:** Lucide React (`lucide-react`)
- Standard size: 16×16px, stroke-width: 2
- Sidebar icons: 15×15px
- Toolbar icons: 13×13px

---

## 3. Layout Architecture

### 3.1 Application Shell

```
┌─────────────────────────────────────────────────────────┐
│  TOPBAR  (height: 52px, fixed, z-index: 100)            │
│  [Logo] [Org switcher] [Search ⌘K] ... [Notif] [Avatar] │
├────────────────┬────────────────────────────────────────┤
│                │                                        │
│  LEFT SIDEBAR  │   MAIN CONTENT                         │
│  (width: 232px)│   (flex: 1, overflow: auto)            │
│  fixed         │                                        │
│                │   PAGE HEADER (48px)                   │
│  [Navigation]  │   ────────────────────                 │
│                │   CONTENT AREA (scrollable)            │
│                │                                        │
└────────────────┴────────────────────────────────────────┘
```

**Topbar:** `height: 52px` · `background: var(--surface)` · `border-bottom: 1px solid var(--border)` · `position: fixed` · `z-index: 100`

**Left Sidebar:** `width: 232px` · `background: var(--surface)` · `border-right: 1px solid var(--border)` · `position: fixed` · `height: calc(100vh - 52px)` · `overflow-y: auto`

**Main Content:** `margin-left: 232px` · `margin-top: 52px` · `min-height: calc(100vh - 52px)`

### 3.2 Sidebar Structure

```
┌──────────────────────┐
│  [Dashboard]         │
│  [My Work]      (5)  │
├──────────────────────┤
│  PROJECTS            │
│  ● Web App     (24)  │  ← active: brand bg + left border
│  ● Mobile App  (11)  │
│  ● Design Sys   (8)  │
│  + New Project       │
├──────────────────────┤
│  WIKI                │
│  ⚙️ Engineering      │
│  📋 Product          │
│  🎨 Design           │
│  + New Space         │
└──────────────────────┘
```

**Nav item states:**
- Default: `color: var(--text-secondary)`
- Hover: `background: var(--surface2)` · `color: var(--text-primary)`
- Active: `background: var(--brand-light)` · `color: var(--brand)` · `border-left: 2px solid var(--brand)`

### 3.3 Topbar Elements

**Logo mark:** 26×26px · `border-radius: 7px` · `background: var(--brand)` · white "W" · `font-weight: 800`

**Org switcher:** pill button with org color dot + name + chevron

**Search bar:** `max-width: 320px` · `background: var(--surface2)` · `border: 1px solid var(--border)` · shows `⌘K` kbd shortcut

**Notification bell:** icon button with red dot badge (when unread > 0)

**Avatar:** 28px circle · initials · `background: var(--brand)`

---

## 4. Key Screen Specifications

### 4.1 Kanban Board

**URL:** `/org/:slug/projects/:key/board`

**Page Header (48px):**
```
[Project Name]  [Board | Backlog tabs]  ...  [Filters ▾] [Sprint 3 ▾] [+ New Task]
```

**Board Layout:**
```
┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ ● To Do  (4) │  │ ● In Prog (3)│  │ ● In Rev (2) │  │ ● Done   (7) │
├──────────────┤  ├──────────────┤  ├──────────────┤  ├──────────────┤
│ ┌──────────┐ │  │ ┌──────────┐ │  │ ┌──────────┐ │  │ ┌──────────┐ │
│ │ WEB-45   │ │  │ │ WEB-42 ◀─┼─┼──┼─┼─ active  │ │  │ │ WEB-30   │ │
│ │ Add user │ │  │ │ Fix auth │ │  │ │ JWT flow │ │  │ │ CI/CD    │ │
│ │ avatar.. │ │  │ │ redirect │ │  │ │          │ │  │ │          │ │
│ │ 🔵 [SC]  │ │  │ │ 🔴 [SC]  │ │  │ │ 🟠 [SC]  │ │  │ │ ✅ [JL]  │ │
│ └──────────┘ │  │ └──────────┘ │  │ └──────────┘ │  │ └──────────┘ │
│              │  │              │  │              │  │              │
│ + Add task   │  │ + Add task   │  │ + Add task   │  │ + Add task   │
└──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘
```

**Column width:** 264px · **Gap:** 14px · **Overflow-x:** auto scroll

**Column header:** `padding: 12px 14px` · status dot (8px circle) + name + count chip

**Task Card anatomy:**
```css
.task-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px;
  box-shadow: var(--shadow-sm);
  cursor: pointer;
}
.task-card:hover {
  box-shadow: var(--shadow-md);
  transform: translateY(-1px);
  border-color: var(--brand-mid);
}
```

Card contents (top to bottom):
1. Row: priority dot (6px) + task ID (mono 10px muted)
2. Title: 13px · weight 500 · max 3 lines
3. Footer row: label chips (left) + assignee avatar (right, 20px)

**Drag state:** `opacity: 0.5` on dragged card · drop target column gets `border: 2px dashed var(--brand-mid)`

**Priority dots:** Urgent=`#DC2626` · High=`#F97316` · Medium=`#EAB308` · Low=`#9898A8` · None=transparent

---

### 4.2 Task Detail Panel

**Opens as right slide-in:** `width: 600px` · `animation: translateX(600px → 0)` · `duration: 250ms ease-out`

**Panel overlay:** `background: rgba(0,0,0,0.2)` · click to close

```
┌─────────────────────────────────────────────┐
│ [Story] WEB-42                      [✕ Close]│
├─────────────────────────────────────────────┤
│                                             │
│  Fix authentication redirect bug on login  │ ← 18px, weight 700, editable
│                                             │
├─────────────────────────────────────────────┤
│ Status    [● In Progress ▾]                 │
│ Assignee  [SC] Sam Chen  ▾                  │
│ Priority  [●] Urgent  ▾                     │
│ Sprint    Sprint 3  ▾                       │
│ Due Date  Feb 28, 2026  ▾                   │
│ Labels    [bug] [frontend] [+]              │
├─────────────────────────────────────────────┤
│ DESCRIPTION                                 │
│ [Tiptap rich text area]                     │
├─────────────────────────────────────────────┤
│ SUBTASKS (2)                                │
│  ☐ WEB-43-1 · Investigate router state     │
│  ☐ WEB-43-2 · Write redirect tests         │
│  [+ Add subtask]                            │
├─────────────────────────────────────────────┤
│ LINKED DOCS (1)                             │
│  📄 Auth Architecture · Engineering        │
│  [+ Link document]                          │
├─────────────────────────────────────────────┤
│ COMMENTS (2)                                │
│  [AK] Alex: issue is in ProtectedRoute...  │
│  [SC] Sam: @Alex good catch, fixing now... │
├─────────────────────────────────────────────┤
│ ACTIVITY                                    │
│  SC  Sam moved to In Progress · 9:28 AM    │
│  AK  Alex assigned to Sam · Yesterday      │
│  JL  Jordan created this task · Feb 18     │
├─────────────────────────────────────────────┤
│ [SC avatar] [comment textarea........] Send │
└─────────────────────────────────────────────┘
```

**All field values are inline-editable:** click → dropdown/datepicker/userpicker appears inline (no modal)

**Field row:** `label width: 90px` · value: `border: 1px solid transparent` → on hover: `border-color: var(--border)` + `background: var(--surface2)`

---

### 4.3 Backlog / Sprint Planning

**URL:** `/org/:slug/projects/:key/backlog`

**Three collapsible sections:**

```
▾ [Active] Sprint 3 · Feb 15–28  ████████░░ 7/12  [Complete Sprint]
  ☐ WEB-42  Fix auth redirect bug         🔴  [SC]  In Progress
  ☐ WEB-43  Build Kanban drag-drop        🟠  [AK]  In Progress
  ✓ WEB-30  Setup CI/CD                   ~~strikethrough~~

▾ [Planned] Sprint 4 · Mar 1–14  3 tasks  [Start Sprint]
  ☐ WEB-45  Add user avatar upload        🟠  [SC]
  ☐ WEB-46  Email verification            ⬜

▾ Backlog · 14 tasks              [+ Add to Sprint ▾]
  ☐ WEB-50  Dark mode toggle              ⬜
  ☐ WEB-51  Export to CSV                 ⬜
```

**Task row:** `height: 40px` · checkbox + task ID (mono) + title + label chip + priority dot + assignee avatar

**Completed tasks:** ID + title have `text-decoration: line-through` + `opacity: 0.6`

**Sprint progress bar:** `height: 5px` · active=`var(--brand)` · completed=`var(--green)`

---

### 4.4 Wiki Editor

**URL:** `/org/:slug/wiki/:spaceKey/:pageId`

**Three-column layout:**
```
┌──────────────┬────────────────────────────────┬──────────────┐
│ PAGE TREE    │ EDITOR                          │ LINKED TASKS │
│ (220px)      │ (flex: 1)                       │ (200px)      │
│              │                                 │              │
│ ⚙️ Engin.   │ 🍞 Engineering > Auth Arch      │ LINKED TASKS │
│  ▸ Auth Arch│ ─────────────────────────────   │              │
│  ▸ DB Schema│ # Auth Architecture       [Save]│ WEB-38 ──→   │
│  ▸ API Ref  │ SC · Feb 20 · v8                │ In Review    │
│             │ ─────────────────────────────   │              │
│ 📋 Product  │ [B][I][U][H1][H2][—][<>][⊞][/] │ WEB-42 ──→   │
│  ▸ PRD      │                                 │ In Progress  │
│  ▸ Roadmap  │ [Rich text content area]         │              │
│             │                                 │ [+ Link task]│
│ + New Page  │                                 │              │
└──────────────┴────────────────────────────────┴──────────────┘
```

**Page tree item:**
- Indent: 16px per level
- Active: `background: var(--brand-light)` · `color: var(--brand)`
- Hover: reveals `[···]` options menu (rename, new child, delete)

**Page header area:**
```
[emoji] # Page Title (font-size: 26px, font-weight: 800, editable)
────────────────────────────────────────────
[SC avatar] Sam Chen · Last edited Feb 20, 2026 · [v8] · [Save]
```

**Save button:** visible always · highlighted yellow when unsaved changes exist

**Toolbar buttons (26×26px, border-radius: 4px):**
B · I · U · | · H1 · H2 · | · List · Code · Table · | · /

---

### 4.5 Dashboard

**URL:** `/org/:slug/dashboard`

**Grid layout:** 3 columns × 2 rows

```
┌──────────────────┬──────────────────┬──────────────────┐
│ Sprint Summary   │ Active Sprints   │ Quick Actions    │
│ 12 total         │ Sprint 3 Web     │ [+ Create task]  │
│  7 done  3 inprog│ ████░░ 7/12      │ [+ New page]     │
│                  │ Sprint 2 Mobile  │ [View backlog]   │
│                  │ ████████ 8/10    │                  │
├──────────────────┴──────────────────┼──────────────────┤
│ My Tasks                            │ Recent Activity  │
│ WEB-42  Fix auth redirect  InProg   │ Alex created     │
│ WEB-38  JWT refresh        Review   │ WEB-47 5min ago  │
│ WEB-45  User avatar        To Do    │ Jordan moved     │
│ MOB-12  iOS dark mode      To Do    │ WEB-30 to Done   │
│ WEB-30  CI/CD setup        Done     │ ...              │
└─────────────────────────────────────┴──────────────────┘
```

---

### 4.6 Command Palette (⌘K)

**Full-screen overlay:** centered · `max-width: 560px` · `border-radius: var(--radius-lg)` · `box-shadow: var(--shadow-lg)`

```
┌──────────────────────────────────────┐
│ 🔍 Search tasks, docs, people...     │
├──────────────────────────────────────┤
│ RECENT                               │
│  📋 WEB-42 · Fix auth redirect bug   │
│  📄 Auth Architecture                │
│  📋 WEB-38 · JWT refresh token       │
├──────────────────────────────────────┤
│ TASKS                                │
│  📋 WEB-12 · Build navigation        │
├──────────────────────────────────────┤
│ DOCS                                 │
│  📄 DB Schema Reference              │
└──────────────────────────────────────┘
```

- Keyboard: arrows navigate · Enter selects · Esc closes
- Task result → opens task panel
- Doc result → navigates to page

---

### 4.7 Notification Panel

**Dropdown from bell icon:** `width: 360px` · `max-height: 480px` · appears below topbar

```
┌──────────────────────────────────────┐
│ Notifications (3)          [Mark all]│
├──────────────────────────────────────┤
│ ● Alex assigned WEB-42 to you        │  ← brand-light bg = unread
│   2 minutes ago                      │
├──────────────────────────────────────┤
│ ● Jordan mentioned you in WEB-38     │
│   15 minutes ago                     │
├──────────────────────────────────────┤
│ ○ WEB-30 moved to Done               │  ← white bg = read
│   1 hour ago                         │
└──────────────────────────────────────┘
```

Unread: `background: var(--brand-light)` · left border `2px solid var(--brand)`

---

## 5. Component Specifications

### 5.1 Buttons

| Variant | Background | Text | Hover |
|---------|------------|------|-------|
| Primary | `var(--brand)` | white | darken 8% (`#4a40d4`) |
| Secondary | `var(--surface2)` | `var(--text-secondary)` | `var(--border2)` bg |
| Ghost | transparent | `var(--text-secondary)` | `var(--surface2)` bg |
| Danger | `var(--red)` | white | darken 8% |

Sizes:
- `sm`: `height: 28px` · `padding: 0 10px` · `font-size: 11px`
- `md` (default): `height: 32px` · `padding: 0 12px` · `font-size: 12px`
- `lg`: `height: 40px` · `padding: 0 16px` · `font-size: 13px`

All buttons: `border-radius: var(--radius-sm)` · `font-weight: 600` · `transition: all 0.15s`

### 5.2 Inputs

```css
.input {
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  font-size: 13px;
  font-family: var(--font);
  color: var(--text-primary);
  outline: none;
  transition: border-color 0.12s;
}
.input:focus {
  border-color: var(--brand);
  box-shadow: 0 0 0 3px rgba(91,79,232,0.12);
}
.input:disabled {
  background: var(--surface2);
  color: var(--text-muted);
}
.input.error { border-color: var(--red); }
```

### 5.3 Status Chips

```css
.status-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
}
/* Variants */
.s-todo     { background: var(--surface2); color: var(--text-muted); }
.s-inprog   { background: var(--blue-bg);  color: var(--blue); }
.s-review   { background: var(--amber-bg); color: var(--amber); }
.s-done     { background: var(--green-bg); color: var(--green); }
```

### 5.4 Label Chips

```css
.label-chip {
  padding: 2px 7px;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 600;
}
/* Color variants: purple, blue, green, orange, red, gray */
```

### 5.5 Avatars

| Size | Dimension | Font |
|------|-----------|------|
| xs | 20×20px | 9px |
| sm | 24×24px | 10px |
| md | 28×28px | 11px |
| lg | 32×32px | 13px |

Fallback: initials on `var(--brand)` background. `border-radius: 9999px`

### 5.6 Toast Notifications

- Position: bottom-right · `margin: 16px`
- Stack upward, newest on top
- Auto-dismiss: 4s (errors: 6s, pause on hover)
- Width: 320px
- Variants: success (green left border) · error (red) · info (blue) · warning (amber)

---

## 6. Motion & Interactions

| Interaction | Animation | Duration |
|-------------|-----------|----------|
| Task panel slide in | `translateX(600px → 0)` | 250ms ease-out |
| Task panel slide out | `translateX(0 → 600px)` | 200ms ease-in |
| Modal appear | `scale(0.97→1) + opacity(0→1)` | 150ms ease-out |
| Dropdown open | `translateY(-4px→0) + opacity(0→1)` | 120ms ease-out |
| Toast enter | `translateX(100%→0) + opacity(0→1)` | 200ms ease-out |
| Dragging card | `rotate(1.5deg) + scale(1.02)` | immediate |
| Button click | `scale(0.97)` | 80ms |
| Page transition | `opacity(0→1)` | 100ms |

**Always respect `prefers-reduced-motion` — disable all transforms/transitions when set.**

---

## 7. Accessibility

- All interactive elements: `outline: 2px solid var(--brand); outline-offset: 2px` on focus
- Color is never the sole meaning indicator — always paired with text or icon
- All form fields have associated `<label>` or `aria-label`
- Modal traps focus; Esc closes; focus returns to trigger element
- Drag-and-drop board has keyboard alternative: status dropdown on task card
- Min touch target: 44×44px on mobile views
- `aria-live="polite"` region for toast notifications
