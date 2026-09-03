'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { buildNodeTree, type PdtTreeNode } from '@/modules/product-discovery-tool/lib/flow'
import type { PdtFlow, PdtNode, PdtStatRow } from '@/modules/product-discovery-tool/lib/types'
import { CARD, PDT_API, type PdtVocabulary } from '@/modules/product-discovery-tool/components/admin/shared'

// What the counters are for.
//
// Two questions, and only two: which options does nobody pick, and where do
// people leave. Everything here is an aggregate - a count per day, per step, per
// choice - with no visitor row, no identifier and no cookie behind it, which is
// why the flow needs no consent banner entry to collect any of it.

export function InsightsScreen({ flow, nodes, vocab }: { flow: PdtFlow; nodes: PdtNode[]; vocab: PdtVocabulary }) {
  const [stats, setStats] = useState<PdtStatRow[]>([])
  const [loaded, setLoaded] = useState(false)
  const [days, setDays] = useState(30)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${PDT_API}/flows/${flow.id}/stats?days=${days}`)
      const data = await res.json()
      setStats(Array.isArray(data.stats) ? (data.stats as PdtStatRow[]) : [])
    } catch {
      setStats([])
    } finally {
      setLoaded(true)
    }
  }, [flow.id, days])

  // eslint-disable-next-line react-hooks/set-state-in-effect -- delegating to an async helper; every setState is after an await
  useEffect(() => { void load() }, [load])

  // Names for the keys the beacon sends. A key naming something since deleted is
  // shown as the key itself rather than dropped - the count happened, and hiding
  // it would quietly change the totals.
  const labels = useMemo(() => {
    const out = new Map<string, string>()
    const walk = (list: PdtTreeNode[], prefix: string[], crumb: string[]) => {
      for (const node of list) {
        const path = [...prefix, node.slug]
        const trail = [...crumb, node.label]
        out.set(node.slug, node.label)
        out.set(path.join('/'), trail.join(' › '))
        walk(node.children, path, trail)
      }
    }
    walk(buildNodeTree(nodes), [], [])
    for (const group of vocab.groups) {
      for (const filter of group.filters) {
        out.set(`${group.slug}:${filter.slug}`, `${group.name}: ${filter.label}`)
        out.set(`${group.param}:${filter.slug}`, `${group.name}: ${filter.label}`)
      }
    }
    out.set('-', 'No particular choice')
    return out
  }, [nodes, vocab.groups])

  const totals = useMemo(() => {
    const out = new Map<string, Map<string, number>>()
    for (const row of stats) {
      const perKind = out.get(row.kind) ?? new Map<string, number>()
      const key = `${row.stepKey}|${row.choiceKey}`
      perKind.set(key, (perKind.get(key) ?? 0) + row.count)
      out.set(row.kind, perKind)
    }
    return out
  }, [stats])

  const table = (kind: string, title: string, blurb: string, ascending = false) => {
    const rows = [...(totals.get(kind) ?? new Map<string, number>())]
      .map(([key, count]) => {
        const [stepKey = '', choiceKey = ''] = key.split('|')
        return { stepKey, choiceKey, count }
      })
      .sort((a, b) => (ascending ? a.count - b.count : b.count - a.count))
      .slice(0, 20)
    return (
      <div style={CARD}>
        <h4 style={{ fontSize: '0.9375rem', margin: '0 0 0.2rem' }}>{title}</h4>
        <p style={{ margin: '0 0 0.6rem', fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>{blurb}</p>
        {rows.length === 0 ? (
          <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>Nothing yet.</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'grid', gap: '0.3rem' }}>
            {rows.map((row) => (
              <li key={`${row.stepKey}|${row.choiceKey}`} style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', fontSize: '0.875rem' }}>
                <span>{labels.get(row.choiceKey) ?? row.choiceKey}</span>
                <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{row.count}</strong>
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  const reached = [...(totals.get('REACH') ?? new Map<string, number>())].reduce((n, [, count]) => n + count, 0)
  const finished = [...(totals.get('FINISH') ?? new Map<string, number>())].reduce((n, [, count]) => n + count, 0)

  if (!loaded) return <p style={{ color: 'var(--color-text-secondary)' }}>Loading…</p>

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div>
        <h3 style={{ fontSize: '1rem', margin: '0 0 0.25rem' }}>How it is going</h3>
        <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: '0.875rem', maxWidth: '62ch' }}>
          Counts only - how many times a step was reached and an option chosen. Nobody is followed about, nothing is
          stored against a person, and there is nothing here a shopper could be identified from.
        </p>
      </div>

      <label style={{ fontSize: '0.875rem' }}>
        Last{' '}
        <select className="form-control" style={{ display: 'inline-block', width: 'auto' }} value={days} onChange={(e) => setDays(Number(e.target.value) || 30)}>
          <option value={7}>7 days</option>
          <option value={30}>30 days</option>
          <option value={90}>90 days</option>
        </select>
      </label>

      <div style={{ ...CARD, display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
        <span><strong style={{ fontSize: '1.25rem' }}>{reached}</strong><br /><span style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>steps reached</span></span>
        <span><strong style={{ fontSize: '1.25rem' }}>{finished}</strong><br /><span style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>got to the products</span></span>
      </div>

      <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 20rem), 1fr))' }}>
        {table('PICK', 'What people choose', 'The most-picked answers, whichever step they are on.')}
        {table('PICK', 'What nobody chooses', 'The least-picked answers. An option nobody has ever chosen is usually one nobody understands.', true)}
        {table('REACH', 'Where people get to', 'How often each step was arrived at. A big drop between two of these is where the flow loses people.')}
        {table('DEAD_END', 'Answers that leave nothing', 'Options that keep turning up in combinations with no products behind them. Often a gap in the catalogue rather than a gap in the flow.')}
        {table('RELAXED', 'What people give up', 'The answers shoppers dropped when we offered them a way out of a dead end.')}
      </div>
    </div>
  )
}
