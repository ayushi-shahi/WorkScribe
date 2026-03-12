import { useEffect } from 'react'
import { useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { BookOpen } from 'lucide-react'
import type { WikiSpace } from '@/types'
import type { PageTreeNode } from '@/api/endpoints/wiki'
import '@/styles/wiki.css'

interface WikiOutletContext {
  spaces: WikiSpace[]
  pageTree: PageTreeNode[]
  activeSpace: WikiSpace | null
}

export default function WikiHomePage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()

  // useOutletContext must be called unconditionally — not inside try/catch
  const ctx = useOutletContext<WikiOutletContext | null>()
  const spaces = ctx?.spaces ?? []

  // Auto-navigate to first space via useEffect (not inline during render)
  useEffect(() => {
    if (spaces.length > 0 && spaces[0]) {
      navigate(`/org/${slug}/wiki/${spaces[0].id}`, { replace: true })
    }
  }, [spaces, slug, navigate])

  // While redirect is pending (spaces loaded but effect hasn't run yet), show nothing
  if (spaces.length > 0) return null

  return (
    <div className="wiki-home">
      <BookOpen size={48} strokeWidth={1.2} className="wiki-home-icon" />
      <h2 className="wiki-home-title">Welcome to your Wiki</h2>
      <p className="wiki-home-sub">
        Create a space to start organizing your team&apos;s knowledge. Spaces
        group related pages together — think of them as folders for your docs.
      </p>
      <button
        className="wiki-new-page-btn"
        style={{ fontSize: 13, padding: '8px 20px' }}
        onClick={() => window.dispatchEvent(new CustomEvent('wiki:new-space'))}
      >
        Create your first space
      </button>
    </div>
  )
}