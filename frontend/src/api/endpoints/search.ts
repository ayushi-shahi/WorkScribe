import apiClient from '@/api/client'

export interface SearchResult {
  type: 'task' | 'page'
  id: string
  title: string
  subtitle: string
  updated_at: string
}

interface SearchResponse {
  results: SearchResult[]
  total: number
  q: string
}

export async function searchApi(slug: string, q: string, type?: 'task' | 'page'): Promise<SearchResult[]> {
  const params = new URLSearchParams({ q })
  if (type) params.set('type', type)
  const res = await apiClient.get<SearchResponse>(
    `/organizations/${slug}/search?${params.toString()}`
  )
  return res.data.results
}