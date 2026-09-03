'use client'

import { useEffect, useState } from 'react'
import { PDT_API } from '@/modules/product-discovery-tool/components/admin/shared'

// The "which flow?" field, for the Guided Flow block dropped on an ordinary
// page - a homepage, a category page, a landing page.
//
// A flow is named by its SLUG and not its id, exactly as the launcher names one
// and as the import file does: the slug is what the admin screens show, what
// the address carries, and what survives a flow being rebuilt on another site.
// The picker only spares somebody typing it.
//
// On a flow's OWN page the field stays empty and the route injects the slug,
// which is why "the page's own flow" is a real answer here rather than an empty
// state to be corrected.

type FlowRow = { id: string; slug: string; name: string; status: string }

export function FlowPickerField({ value, onChange }: {
  value: string | null | undefined
  onChange: (value: string) => void
}) {
  const [flows, setFlows] = useState<FlowRow[]>([])
  const [failed, setFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const current = (value ?? '').trim()

  useEffect(() => {
    let live = true
    fetch(`${PDT_API}/flows`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        if (!live) return
        setFlows(Array.isArray(d.flows) ? d.flows : [])
      })
      .catch(() => live && setFailed(true))
      .finally(() => live && setLoaded(true))
    return () => {
      live = false
    }
  }, [])

  const field: React.CSSProperties = {
    width: '100%',
    padding: '0.5rem',
    borderRadius: 6,
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg)',
    color: 'var(--color-text)',
    fontSize: '0.875rem',
  }

  // The list could not be fetched, or the block is pointed at a flow that has
  // since been renamed or deleted. Either way the answer is the same: show what
  // is actually stored, editable, rather than a picker that would silently
  // replace it with something else on the next save.
  const orphaned = loaded && !failed && current !== '' && !flows.some((flow) => flow.slug === current)
  if (failed || orphaned) {
    return (
      <>
        <input style={field} value={current} placeholder="find-your-desk" onChange={(e) => onChange(e.target.value.trim())} />
        <p style={{ margin: '6px 0 0', fontSize: '0.75rem', color: 'var(--color-warning)' }}>
          {failed
            ? 'The list of flows could not be loaded, so type the address instead.'
            : `Nothing answers at "${current}" any more. Type another address, or clear it to use the page’s own flow.`}
        </p>
      </>
    )
  }

  return (
    <>
      <select style={field} value={current} onChange={(e) => onChange(e.target.value)}>
        <option value="">The page’s own flow</option>
        {flows.map((flow) => (
          <option key={flow.id} value={flow.slug}>
            {flow.name} (/{flow.slug}){flow.status === 'PUBLISHED' ? '' : ' — draft'}
          </option>
        ))}
      </select>
      {loaded && flows.length === 0 && (
        <p style={{ margin: '6px 0 0', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
          No flows yet. Build one under Shop &gt; Products &gt; Product Discovery.
        </p>
      )}
      {current === '' && (
        <p style={{ margin: '6px 0 0', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
          Right on a flow’s own page, which fills this in for itself. Anywhere else - a homepage, a category page - pick the flow to run.
        </p>
      )}
    </>
  )
}
