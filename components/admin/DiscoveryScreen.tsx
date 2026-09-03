'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { PdtFlow, PdtNode, PdtOptionNote, PdtQuestion } from '@/modules/product-discovery-tool/lib/types'
import { EMPTY_VOCABULARY, PDT_API, useSender, type PdtVocabulary } from '@/modules/product-discovery-tool/components/admin/shared'
import { FlowScreen } from '@/modules/product-discovery-tool/components/admin/FlowScreen'
import { QuestionsScreen } from '@/modules/product-discovery-tool/components/admin/QuestionsScreen'
import { GuidanceScreen } from '@/modules/product-discovery-tool/components/admin/GuidanceScreen'
import { InsightsScreen } from '@/modules/product-discovery-tool/components/admin/InsightsScreen'

// Product Discovery, as one screen with four sub-tabs - not four sidebar links.
//
// Everything below hangs off ONE flow at a time, because that is how the work
// actually goes: a flow's tree, its questions and its explanations are three
// views of the same configuration, and switching between them should not mean
// re-finding which flow you were on.

type SubTab = 'flow' | 'questions' | 'guidance' | 'insights'

const TABS: { id: SubTab; label: string }[] = [
  { id: 'flow', label: 'Flow' },
  { id: 'questions', label: 'Questions' },
  { id: 'guidance', label: 'Guidance' },
  { id: 'insights', label: 'Insights' },
]

type Counts = { total: number; counts: Record<string, number>; missingScope: string[]; flowScopeMissing: boolean }
const EMPTY_COUNTS: Counts = { total: 0, counts: {}, missingScope: [], flowScopeMissing: false }

export function DiscoveryScreen({ adminPath }: { adminPath: string }) {
  const [flows, setFlows] = useState<PdtFlow[]>([])
  const [vocab, setVocab] = useState<PdtVocabulary>(EMPTY_VOCABULARY)
  const [notes, setNotes] = useState<PdtOptionNote[]>([])
  const [nodes, setNodes] = useState<PdtNode[]>([])
  const [questions, setQuestions] = useState<PdtQuestion[]>([])
  const [counts, setCounts] = useState<Counts>(EMPTY_COUNTS)
  const [flowId, setFlowId] = useState<string | null>(null)
  // Which flow is on screen, as a ref as well as state. `reload` must not depend
  // on it: the effect below re-runs whenever `reload` changes identity, so a
  // dependency on the selected flow would make choosing one reload the screen,
  // which would choose one, which would reload the screen.
  const flowIdRef = useRef<string | null>(null)
  const [tab, setTab] = useState<SubTab>('flow')
  const [loaded, setLoaded] = useState(false)
  const [newName, setNewName] = useState('')

  const loadShared = useCallback(async () => {
    const [flowRes, vocabRes, noteRes] = await Promise.all([
      fetch(`${PDT_API}/flows`),
      fetch(`${PDT_API}/vocabulary`),
      fetch(`${PDT_API}/notes`),
    ])
    const flowData = await flowRes.json().catch(() => ({}))
    const vocabData = await vocabRes.json().catch(() => ({}))
    const noteData = await noteRes.json().catch(() => ({}))
    const list = (flowData.flows ?? []) as PdtFlow[]
    setFlows(list)
    setVocab({
      groups: vocabData.groups ?? [],
      categories: vocabData.categories ?? [],
      collections: vocabData.collections ?? [],
      tags: vocabData.tags ?? [],
    })
    setNotes((noteData.notes ?? []) as PdtOptionNote[])
    return list
  }, [])

  const loadFlow = useCallback(async (id: string) => {
    const [nodeRes, questionRes, countRes] = await Promise.all([
      fetch(`${PDT_API}/nodes?flowId=${encodeURIComponent(id)}`),
      fetch(`${PDT_API}/questions?flowId=${encodeURIComponent(id)}`),
      fetch(`${PDT_API}/flows/${id}/counts`),
    ])
    const nodeData = await nodeRes.json().catch(() => ({}))
    const questionData = await questionRes.json().catch(() => ({}))
    const countData = await countRes.json().catch(() => ({}))
    setNodes((nodeData.nodes ?? []) as PdtNode[])
    setQuestions((questionData.questions ?? []) as PdtQuestion[])
    setCounts({
      total: Number(countData.total ?? 0),
      counts: (countData.counts ?? {}) as Record<string, number>,
      missingScope: (countData.missingScope ?? []) as string[],
      flowScopeMissing: countData.flowScopeMissing === true,
    })
  }, [])

  const selectFlow = useCallback((id: string | null) => {
    flowIdRef.current = id
    setFlowId(id)
  }, [])

  const reload = useCallback(async () => {
    const list = await loadShared()
    // The flow on screen may have just been deleted, or this may be the first
    // load; either way, land on something real rather than an empty panel.
    const wanted = flowIdRef.current
    const current = wanted && list.some((flow) => flow.id === wanted) ? wanted : list[0]?.id ?? null
    selectFlow(current)
    if (current) await loadFlow(current)
    else {
      setNodes([])
      setQuestions([])
      setCounts(EMPTY_COUNTS)
    }
    setLoaded(true)
  }, [loadFlow, loadShared, selectFlow])

  // eslint-disable-next-line react-hooks/set-state-in-effect -- delegating to an async helper; every setState is after an await
  useEffect(() => { void reload() }, [reload])

  const { send, busy, error } = useSender(reload)

  async function addFlow() {
    const name = newName.trim()
    if (!name) return
    const created = await send(`${PDT_API}/flows`, 'POST', { name })
    if (created) {
      setNewName('')
      if (typeof created.id === 'string') {
        selectFlow(created.id)
        await loadFlow(created.id)
      }
    }
  }

  if (!loaded) return <p style={{ color: 'var(--color-text-secondary)' }}>Loading…</p>

  const flow = flows.find((entry) => entry.id === flowId) ?? null

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div>
        <h1 style={{ fontSize: '1.25rem', margin: '0 0 0.25rem' }}>Product Discovery</h1>
        <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: '0.875rem', maxWidth: '62ch' }}>
          A few plain questions that end with the right products on screen. Shoppers pick what sort of thing they are
          after, then what sort of that, then what matters to them - and every option along the way says what it means
          and how it differs from the one next to it.
        </p>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        {flows.length > 0 && (
          <select
            className="form-control"
            style={{ width: 'auto' }}
            value={flowId ?? ''}
            onChange={(e) => { selectFlow(e.target.value); void loadFlow(e.target.value) }}
          >
            {flows.map((entry) => (
              <option key={entry.id} value={entry.id}>{entry.name}{entry.status === 'DRAFT' ? ' (draft)' : ''}</option>
            ))}
          </select>
        )}
        <input
          className="form-control"
          style={{ width: 'auto', minWidth: '14rem' }}
          value={newName}
          placeholder="Name a new flow, e.g. Find your desk"
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void addFlow() } }}
        />
        <button type="button" className="btn btn-primary" disabled={busy || !newName.trim()} onClick={addFlow}>Add flow</button>
        {flow && (
          <button
            type="button"
            className="btn btn-danger"
            disabled={busy}
            onClick={async () => {
              if (!window.confirm(`Delete “${flow.name}” and everything in it?`)) return
              selectFlow(null)
              await send(`${PDT_API}/flows/${flow.id}`, 'DELETE')
            }}
          >
            Delete flow
          </button>
        )}
      </div>

      {!flow ? (
        <p style={{ color: 'var(--color-text-secondary)' }}>
          No flows yet. Name one above and you will have something to build.
        </p>
      ) : (
        <>
          <div style={{ display: 'flex', gap: '0.25rem', borderBottom: '1px solid var(--color-border)' }} role="tablist">
            {TABS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={tab === entry.id}
                className="btn btn-sm"
                style={{
                  borderRadius: '8px 8px 0 0',
                  borderBottom: tab === entry.id ? '2px solid var(--color-primary)' : '2px solid transparent',
                  background: 'none',
                }}
                onClick={() => setTab(entry.id)}
              >
                {entry.label}
              </button>
            ))}
          </div>

          {tab === 'flow' && (
            <FlowScreen
              key={flow.id}
              flow={flow}
              nodes={nodes}
              vocab={vocab}
              counts={counts.counts}
              missingScope={counts.missingScope}
              flowScopeMissing={counts.flowScopeMissing}
              adminPath={adminPath}
              send={send}
              busy={busy}
            />
          )}
          {tab === 'questions' && (
            <QuestionsScreen key={flow.id} flow={flow} nodes={nodes} questions={questions} vocab={vocab} send={send} busy={busy} />
          )}
          {tab === 'guidance' && (
            <GuidanceScreen key={flow.id} flow={flow} notes={notes} vocab={vocab} send={send} busy={busy} reload={reload} />
          )}
          {tab === 'insights' && <InsightsScreen key={flow.id} flow={flow} nodes={nodes} vocab={vocab} />}
        </>
      )}
    </div>
  )
}
