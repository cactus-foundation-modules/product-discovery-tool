'use client'

import { useCallback, useState } from 'react'

// Shapes and plumbing the four Product Discovery sub-tabs share, so they cannot
// drift into four slightly different ideas of what a filter group looks like or
// four slightly different ways of reporting a failed save.

export const PDT_API = '/api/m/product-discovery-tool/admin'

export type PdtVocabFilter = { id: string; label: string; slug: string; swatch: string | null }
export type PdtVocabGroup = {
  id: string
  name: string
  slug: string
  kind: 'VALUES' | 'PRICE'
  controlType: string
  /** The query-string key this group is read under on a flow page - its own
   *  slug, unless that collides with `pick`, `sort` or `page`. */
  param: string
  collides: boolean
  filters: PdtVocabFilter[]
}
export type PdtScopeOption = { name: string; slug: string }

export type PdtVocabulary = {
  groups: PdtVocabGroup[]
  categories: PdtScopeOption[]
  collections: PdtScopeOption[]
  tags: PdtScopeOption[]
}

export const EMPTY_VOCABULARY: PdtVocabulary = { groups: [], categories: [], collections: [], tags: [] }

export const CARD: React.CSSProperties = {
  border: '1px solid var(--color-border)',
  borderRadius: 12,
  padding: '1rem 1.25rem',
  background: 'var(--color-surface)',
}

export const LABEL: React.CSSProperties = {
  display: 'block',
  fontSize: '0.8125rem',
  fontWeight: 600,
  color: 'var(--color-text-secondary)',
  marginBottom: '0.3rem',
}

/** The small grey line under a field, for the cases where the label alone
 *  cannot carry the rule - a placeholder token, a unit, a consequence. */
export const HINT: React.CSSProperties = {
  display: 'block',
  marginTop: '0.3rem',
  fontSize: '0.75rem',
  color: 'var(--color-text-muted)',
  lineHeight: 1.4,
}

export function scopeOptions(vocab: PdtVocabulary, type: string): PdtScopeOption[] {
  if (type === 'CATEGORY') return vocab.categories
  if (type === 'COLLECTION') return vocab.collections
  if (type === 'TAG') return vocab.tags
  return []
}

/** One place for "send this, tell me if it went wrong, then reload". Every
 *  screen uses it, so a failed save reads the same everywhere and nothing is
 *  left looking saved when it is not. */
export function useSender(reload: () => Promise<void>) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const send = useCallback(
    async (url: string, method: string, body?: unknown): Promise<Record<string, unknown> | null> => {
      setBusy(true)
      setError(null)
      try {
        const res = await fetch(url, {
          method,
          headers: body ? { 'Content-Type': 'application/json' } : undefined,
          body: body ? JSON.stringify(body) : undefined,
        })
        const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
        if (!res.ok) {
          setError(typeof data.error === 'string' ? data.error : 'Something went wrong.')
          return null
        }
        await reload()
        return data
      } catch {
        setError('Something went wrong.')
        return null
      } finally {
        setBusy(false)
      }
    },
    [reload],
  )

  return { send, busy, error, setError }
}
