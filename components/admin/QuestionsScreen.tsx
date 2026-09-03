'use client'

import { useMemo, useState } from 'react'
import { buildNodeTree, type PdtTreeNode } from '@/modules/product-discovery-tool/lib/flow'
import { pickQuestionRow } from '@/modules/product-discovery-tool/lib/questions'
import type { PdtFlow, PdtNode, PdtQuestion } from '@/modules/product-discovery-tool/lib/types'
import { CARD, LABEL, PDT_API, type PdtVocabulary } from '@/modules/product-discovery-tool/components/admin/shared'

// Which filter groups the features step asks, in what order, with what wording.
//
// Every group in the shop's filter vocabulary is listed whether it has been
// curated or not, because an uncurated group IS asked - in the filters module's
// own order, with its own name, after the curated ones. This screen is where an
// owner improves that, never where they make it work at all.

type Sender = (url: string, method: string, body?: unknown) => Promise<Record<string, unknown> | null>

export function QuestionsScreen({ flow, nodes, questions, vocab, send, busy }: {
  flow: PdtFlow
  nodes: PdtNode[]
  questions: PdtQuestion[]
  vocab: PdtVocabulary
  send: Sender
  busy: boolean
}) {
  // Which node's questions are being edited. '' is the flow-wide set, which is
  // the ordinary case; a node is picked only where one type genuinely needs
  // different wording from its siblings.
  const [nodeId, setNodeId] = useState('')
  const roots = useMemo(() => buildNodeTree(nodes), [nodes])
  const scoped = nodeId || null

  const flatNodes = useMemo(() => {
    const out: { id: string; label: string }[] = []
    const walk = (list: PdtTreeNode[], prefix: string) => {
      for (const node of list) {
        const label = prefix ? `${prefix} › ${node.label}` : node.label
        out.push({ id: node.id, label })
        walk(node.children, label)
      }
    }
    walk(roots, '')
    return out
  }, [roots])

  // The chain from the root down to the node being edited, deepest last - the
  // same order the storefront resolves overrides in, so what this screen shows
  // as "in effect" is what a shopper would actually see.
  const chain = useMemo(() => {
    if (!scoped) return []
    const byId = new Map(nodes.map((node) => [node.id, node]))
    const out: string[] = []
    let at: string | null = scoped
    for (let guard = 0; at && guard < 10; guard++) {
      out.unshift(at)
      at = byId.get(at)?.parentId ?? null
    }
    return out
  }, [scoped, nodes])

  const collisions = vocab.groups.filter((group) => group.collides)

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div>
        <h3 style={{ fontSize: '1rem', margin: '0 0 0.25rem' }}>The features step</h3>
        <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: '0.875rem', maxWidth: '62ch' }}>
          Every filter group you have is asked here already. What you set below is the wording, the order, and whether a
          question is asked up front or tucked under &ldquo;More options&rdquo;. Anything you leave alone keeps its own
          name and its own place.
        </p>
      </div>

      {vocab.groups.length === 0 && (
        <p className="alert alert-warning">
          There are no filter groups yet, so the features step has nothing to ask. Set some up under Filters and they
          will appear here on their own.
        </p>
      )}

      {collisions.length > 0 && (
        <p className="alert alert-warning">
          {collisions.map((group) => `“${group.name}”`).join(', ')} {collisions.length === 1 ? 'uses a word' : 'use words'} the
          flow needs for its own address, so on a flow page {collisions.length === 1 ? 'it is' : 'they are'} read
          under {collisions.map((group) => `“${group.param}”`).join(', ')} instead. Nothing breaks; links just look
          slightly different from the ones on your filter pages.
        </p>
      )}

      <label style={{ maxWidth: '28rem' }}>
        <span style={LABEL}>Whose questions</span>
        <select className="form-control" value={nodeId} onChange={(e) => setNodeId(e.target.value)}>
          <option value="">Every choice in this flow</option>
          {flatNodes.map((node) => <option key={node.id} value={node.id}>Only under {node.label}</option>)}
        </select>
      </label>

      <div style={{ display: 'grid', gap: '0.5rem' }}>
        {vocab.groups.map((group, index) => (
          <QuestionRow
            key={group.id}
            flowId={flow.id}
            nodeId={scoped}
            group={group}
            questions={questions}
            chain={chain}
            index={index}
            total={vocab.groups.length}
            allQuestionIds={questions.map((q) => q.id)}
            send={send}
            busy={busy}
          />
        ))}
      </div>
    </div>
  )
}

function QuestionRow({ flowId, nodeId, group, questions, chain, index, total, allQuestionIds, send, busy }: {
  flowId: string
  nodeId: string | null
  group: PdtVocabulary['groups'][number]
  questions: PdtQuestion[]
  chain: string[]
  index: number
  total: number
  allQuestionIds: string[]
  send: Sender
  busy: boolean
}) {
  // The row for exactly this scope - not the one inherited from above, which is
  // shown separately so an owner can see what they are overriding.
  const own = questions.find((q) => q.groupId === group.id && q.nodeId === nodeId) ?? null
  const inherited = nodeId ? pickQuestionRow(questions, group.id, chain) : null
  const [open, setOpen] = useState(false)
  const [heading, setHeading] = useState(own?.heading ?? '')
  const [explainer, setExplainer] = useState(own?.explainer ?? '')
  const [importance, setImportance] = useState(own?.importance ?? inherited?.importance ?? 'PRIMARY')
  const [multi, setMulti] = useState(own?.multi ?? inherited?.multi ?? true)
  const [hidden, setHidden] = useState(own?.hidden ?? inherited?.hidden ?? false)

  const effectiveHeading = own?.heading || (nodeId ? inherited?.heading : null) || group.name

  return (
    <div style={CARD}>
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-sm" onClick={() => setOpen((on) => !on)} aria-expanded={open}>
          {open ? 'Close' : 'Edit'}
        </button>
        <strong style={{ flex: '1 1 auto', minWidth: 0 }}>{effectiveHeading}</strong>
        <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
          {group.filters.length} {group.filters.length === 1 ? 'option' : 'options'}
        </span>
        {hidden && <span style={{ fontSize: '0.8125rem', color: 'var(--color-warning)' }}>Not asked</span>}
        {!own && <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>Using its own name</span>}
      </div>

      {open && (
        <div style={{ marginTop: '0.9rem', paddingTop: '0.9rem', borderTop: '1px solid var(--color-border)', display: 'grid', gap: '0.75rem' }}>
          <label>
            <span style={LABEL}>Ask it like this</span>
            <input className="form-control" placeholder={group.name} value={heading} onChange={(e) => setHeading(e.target.value)} />
          </label>
          <label>
            <span style={LABEL}>What this feature is, before the options</span>
            <textarea className="form-control" rows={3} value={explainer} onChange={(e) => setExplainer(e.target.value)} />
          </label>
          <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <label style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
              <input type="radio" name={`imp-${group.id}`} checked={importance === 'PRIMARY'} onChange={() => setImportance('PRIMARY')} />
              <span>Ask up front</span>
            </label>
            <label style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
              <input type="radio" name={`imp-${group.id}`} checked={importance === 'SECONDARY'} onChange={() => setImportance('SECONDARY')} />
              <span>Under &ldquo;More options&rdquo;</span>
            </label>
            <label style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
              <input type="checkbox" checked={multi} onChange={(e) => setMulti(e.target.checked)} />
              <span>Let them pick more than one</span>
            </label>
            <label style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
              <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} />
              <span>Do not ask this at all</span>
            </label>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() => send(`${PDT_API}/questions`, 'POST', {
                flowId,
                nodeId,
                groupId: group.id,
                heading: heading.trim() || null,
                explainer: explainer.trim() || null,
                importance,
                multi,
                hidden,
              })}
            >
              Save
            </button>
            {own && (
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => send(`${PDT_API}/questions/${own.id}`, 'DELETE')}>
                Back to its own name
              </button>
            )}
            {own && (
              <>
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={busy || index === 0}
                  onClick={() => send(`${PDT_API}/questions/reorder`, 'POST', { flowId, ids: reorder(allQuestionIds, own.id, -1) })}
                >
                  Ask earlier
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={busy || index === total - 1}
                  onClick={() => send(`${PDT_API}/questions/reorder`, 'POST', { flowId, ids: reorder(allQuestionIds, own.id, 1) })}
                >
                  Ask later
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/** Move one id one place along a list. Only curated rows have an order at all -
 *  an uncurated group takes the filters module's own place, after the rest. */
function reorder(ids: string[], id: string, delta: number): string[] {
  const at = ids.indexOf(id)
  const to = at + delta
  if (at < 0 || to < 0 || to >= ids.length) return ids
  const next = [...ids]
  const moved = next[at]!
  next[at] = next[to]!
  next[to] = moved
  return next
}
