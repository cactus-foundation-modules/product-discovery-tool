'use client'

import { useMemo, useState } from 'react'
import { buildNodeTree, PDT_CHOICE_TOKEN, PDT_DEFAULT_HEADINGS, type PdtTreeNode } from '@/modules/product-discovery-tool/lib/flow'
import type { PdtFlow, PdtNode } from '@/modules/product-discovery-tool/lib/types'
import { CARD, HINT, LABEL, PDT_API, scopeOptions, type PdtVocabulary } from '@/modules/product-discovery-tool/components/admin/shared'
import { PicturePicker } from '@/modules/product-discovery-tool/components/admin/PicturePicker'

// The tree builder.
//
// Every node shows the live count of what lies behind it as it is built, so a
// node that catches nothing is obvious at once - the obvious failure mode of a
// hand-built tree that nothing else would report. A node whose category has been
// deleted since is flagged separately, because "0" can mean an empty shelf and
// the owner needs to know which of the two they are looking at.

type Sender = (url: string, method: string, body?: unknown) => Promise<Record<string, unknown> | null>

const NODE_SCOPES: { value: PdtNode['scopeType']; label: string }[] = [
  { value: 'ALL', label: 'The same products as the step above' },
  { value: 'CATEGORY', label: 'A category' },
  { value: 'COLLECTION', label: 'A collection' },
  { value: 'TAG', label: 'A tag' },
  { value: 'FILTERS', label: 'Filters only (no shelf)' },
]

export function FlowScreen({ flow, nodes, vocab, counts, missingScope, flowScopeMissing, adminPath, send, busy }: {
  flow: PdtFlow
  nodes: PdtNode[]
  vocab: PdtVocabulary
  counts: Record<string, number>
  missingScope: string[]
  flowScopeMissing: boolean
  adminPath: string
  send: Sender
  busy: boolean
}) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [addingTo, setAddingTo] = useState<string | null | undefined>(undefined)
  const [newLabel, setNewLabel] = useState('')
  const roots = useMemo(() => buildNodeTree(nodes), [nodes])
  const missing = useMemo(() => new Set(missingScope), [missingScope])

  async function addNode(parentId: string | null) {
    const label = newLabel.trim()
    if (!label) return
    const created = await send(`${PDT_API}/nodes`, 'POST', { flowId: flow.id, parentId, label })
    if (created) {
      setNewLabel('')
      setAddingTo(undefined)
      setOpenId(typeof created.id === 'string' ? created.id : null)
    }
  }

  async function move(siblings: PdtTreeNode[], index: number, delta: number) {
    const next = [...siblings]
    const moved = next[index]
    const target = next[index + delta]
    if (!moved || !target) return
    next[index] = target
    next[index + delta] = moved
    await send(`${PDT_API}/nodes/reorder`, 'POST', {
      flowId: flow.id,
      parentId: moved.parentId,
      ids: next.map((n) => n.id),
    })
  }

  const renderLevel = (siblings: PdtTreeNode[], depth: number, parentId: string | null) => (
    <div style={{ display: 'grid', gap: '0.5rem', marginLeft: depth === 0 ? 0 : '1.5rem' }}>
      {siblings.map((node, index) => {
        const open = openId === node.id
        const count = counts[node.id]
        return (
          <div key={node.id} style={CARD}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setOpenId(open ? null : node.id)}
                aria-expanded={open}
              >
                {open ? 'Close' : 'Edit'}
              </button>
              <strong style={{ flex: '1 1 auto', minWidth: 0 }}>{node.label}</strong>
              <code style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>{node.slug}</code>
              {count !== undefined && (
                <span style={{ fontSize: '0.8125rem', color: count === 0 ? 'var(--color-warning)' : 'var(--color-text-secondary)' }}>
                  {count} {count === 1 ? 'product' : 'products'}
                </span>
              )}
              <span style={{ display: 'flex', gap: '0.25rem' }}>
                <button type="button" className="btn btn-sm" disabled={busy || index === 0} onClick={() => move(siblings, index, -1)} aria-label="Move up">↑</button>
                <button type="button" className="btn btn-sm" disabled={busy || index === siblings.length - 1} onClick={() => move(siblings, index, 1)} aria-label="Move down">↓</button>
              </span>
            </div>

            {missing.has(node.id) && (
              <p className="alert alert-warning" style={{ marginTop: '0.6rem', marginBottom: 0 }}>
                This one points at a {node.scopeType.toLowerCase()} called “{node.scopeSlug}” that is no longer in the shop, so it will not appear.
              </p>
            )}
            {!missing.has(node.id) && count === 0 && (
              <p className="alert alert-warning" style={{ marginTop: '0.6rem', marginBottom: 0 }}>
                Nothing is filed under this one, so shoppers will not be offered it.
              </p>
            )}

            {open && (
              <NodeEditor node={node} vocab={vocab} send={send} busy={busy} onDeleted={() => setOpenId(null)} />
            )}

            {node.children.length > 0 && (
              <div style={{ marginTop: '0.75rem' }}>{renderLevel(node.children, depth + 1, node.id)}</div>
            )}

            {addingTo === node.id ? (
              <AddRow value={newLabel} onChange={setNewLabel} onAdd={() => addNode(node.id)} onCancel={() => setAddingTo(undefined)} busy={busy} />
            ) : (
              <button type="button" className="btn btn-sm" style={{ marginTop: '0.6rem' }} onClick={() => { setAddingTo(node.id); setNewLabel('') }}>
                Add a sub-type under {node.label}
              </button>
            )}
          </div>
        )
      })}

      {depth === 0 && (
        addingTo === null ? (
          <AddRow value={newLabel} onChange={setNewLabel} onAdd={() => addNode(null)} onCancel={() => setAddingTo(undefined)} busy={busy} />
        ) : (
          <button type="button" className="btn btn-secondary" onClick={() => { setAddingTo(null); setNewLabel('') }}>
            Add a first-step choice
          </button>
        )
      )}
      {/* parentId is carried for the reorder call above; nothing else reads it. */}
      <span hidden data-parent={parentId ?? ''} />
    </div>
  )

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <FlowSettings flow={flow} vocab={vocab} flowScopeMissing={flowScopeMissing} adminPath={adminPath} send={send} busy={busy} />
      <div>
        <h3 style={{ fontSize: '1rem', margin: '0 0 0.25rem' }}>The questions before the features</h3>
        <p style={{ margin: '0 0 0.75rem', color: 'var(--color-text-secondary)', fontSize: '0.875rem', maxWidth: '62ch' }}>
          Build the choices a shopper works down: the first step is the top level, and anything you nest under a choice
          becomes the step after it. A branch with nothing under it goes straight to the features, which is fine - the
          step count follows the branch.
        </p>
        {renderLevel(roots, 0, null)}
      </div>
    </div>
  )
}

function AddRow({ value, onChange, onAdd, onCancel, busy }: {
  value: string
  onChange: (value: string) => void
  onAdd: () => void
  onCancel: () => void
  busy: boolean
}) {
  return (
    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem', flexWrap: 'wrap' }}>
      <input
        className="form-control"
        style={{ flex: '1 1 14rem' }}
        value={value}
        placeholder="What it is called, in a shopper's words"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onAdd() } }}
      />
      <button type="button" className="btn btn-primary" disabled={busy || !value.trim()} onClick={onAdd}>Add</button>
      <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
    </div>
  )
}

function FlowSettings({ flow, vocab, flowScopeMissing, adminPath, send, busy }: {
  flow: PdtFlow
  vocab: PdtVocabulary
  flowScopeMissing: boolean
  adminPath: string
  send: Sender
  busy: boolean
}) {
  const [draft, setDraft] = useState(flow)
  const set = <K extends keyof PdtFlow>(key: K, value: PdtFlow[K]) => setDraft((prev) => ({ ...prev, [key]: value }))
  const options = scopeOptions(vocab, draft.scopeType)

  return (
    <div style={CARD}>
      <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 15rem), 1fr))' }}>
        <label>
          <span style={LABEL}>Name</span>
          <input className="form-control" value={draft.name} onChange={(e) => set('name', e.target.value)} />
        </label>
        <label>
          <span style={LABEL}>Address</span>
          <input className="form-control" value={draft.slug} onChange={(e) => set('slug', e.target.value)} />
        </label>
        <label>
          <span style={LABEL}>Heading on the page</span>
          <input className="form-control" value={draft.heading ?? ''} onChange={(e) => set('heading', e.target.value || null)} />
        </label>
        <label>
          <span style={LABEL}>Status</span>
          <select className="form-control" value={draft.status} onChange={(e) => set('status', e.target.value as PdtFlow['status'])}>
            <option value="DRAFT">Draft - only staff can see it</option>
            <option value="PUBLISHED">Published</option>
          </select>
        </label>
        <label>
          <span style={LABEL}>Which products it can reach</span>
          <select className="form-control" value={draft.scopeType} onChange={(e) => { set('scopeType', e.target.value as PdtFlow['scopeType']); set('scopeSlug', null) }}>
            <option value="ALL">The whole shop</option>
            <option value="CATEGORY">A category</option>
            <option value="COLLECTION">A collection</option>
            <option value="TAG">A tag</option>
          </select>
        </label>
        {draft.scopeType !== 'ALL' && (
          <label>
            <span style={LABEL}>Which one</span>
            <select className="form-control" value={draft.scopeSlug ?? ''} onChange={(e) => set('scopeSlug', e.target.value || null)}>
              <option value="">Choose…</option>
              {options.map((option) => <option key={option.slug} value={option.slug}>{option.name}</option>)}
            </select>
          </label>
        )}
        <label>
          <span style={LABEL}>Results per page</span>
          <input className="form-control" type="number" min={1} max={100} value={draft.resultsPerPage} onChange={(e) => set('resultsPerPage', Number(e.target.value) || 24)} />
        </label>
        <label>
          <span style={LABEL}>Button at the end (optional)</span>
          <input className="form-control" placeholder="e.g. Ask us for a quote" value={draft.finishCtaLabel ?? ''} onChange={(e) => set('finishCtaLabel', e.target.value || null)} />
        </label>
        <label>
          <span style={LABEL}>…and where it goes</span>
          <input className="form-control" placeholder="/contact" value={draft.finishCtaHref ?? ''} onChange={(e) => set('finishCtaHref', e.target.value || null)} />
        </label>
      </div>

      <label style={{ display: 'block', marginTop: '0.75rem' }}>
        <span style={LABEL}>The line under the heading</span>
        <textarea className="form-control" rows={2} value={draft.standfirst ?? ''} onChange={(e) => set('standfirst', e.target.value || null)} />
      </label>

      {/* The three questions the shopper is actually asked. Left empty they are
          the wording the module ships, which is what the placeholders show, so
          an owner sees what they are replacing before they replace it. */}
      <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(15rem, 1fr))', marginTop: '0.75rem' }}>
        <label>
          <span style={LABEL}>What the first step asks</span>
          <input
            className="form-control"
            placeholder={PDT_DEFAULT_HEADINGS.first}
            value={draft.firstStepHeading ?? ''}
            onChange={(e) => set('firstStepHeading', e.target.value || null)}
          />
        </label>
        <label>
          <span style={LABEL}>What the steps after it ask</span>
          <input
            className="form-control"
            placeholder="Which sort of desks?"
            value={draft.laterStepHeading ?? ''}
            onChange={(e) => set('laterStepHeading', e.target.value || null)}
          />
          <span style={HINT}>
            Write {PDT_CHOICE_TOKEN} where the answer they have just given should appear. Leave it
            empty for &ldquo;Which sort of&nbsp;…?&rdquo;
          </span>
        </label>
        <label>
          <span style={LABEL}>What the last step asks</span>
          <input
            className="form-control"
            placeholder={PDT_DEFAULT_HEADINGS.features}
            value={draft.featuresHeading ?? ''}
            onChange={(e) => set('featuresHeading', e.target.value || null)}
          />
        </label>
      </div>

      <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
        <label style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
          <input type="checkbox" checked={draft.allowSkip} onChange={(e) => set('allowSkip', e.target.checked)} />
          <span>Let shoppers say &ldquo;not sure yet&rdquo; and move on</span>
        </label>
        <label style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
          <input type="checkbox" checked={draft.noindex} onChange={(e) => set('noindex', e.target.checked)} />
          <span>Keep this page out of search results</span>
        </label>
      </div>

      {flowScopeMissing && (
        <p className="alert alert-warning" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
          This flow is pointed at something that is no longer in the shop, so it will find nothing at all.
        </p>
      )}
      {!draft.finishCtaLabel !== !draft.finishCtaHref && (
        <p className="alert alert-warning" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
          A button at the end needs both a label and somewhere to go. With one of them missing, no button appears.
        </p>
      )}

      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.9rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={() => send(`${PDT_API}/flows/${flow.id}`, 'PUT', {
            name: draft.name,
            slug: draft.slug,
            status: draft.status,
            heading: draft.heading,
            standfirst: draft.standfirst,
            firstStepHeading: draft.firstStepHeading,
            laterStepHeading: draft.laterStepHeading,
            featuresHeading: draft.featuresHeading,
            scopeType: draft.scopeType,
            scopeSlug: draft.scopeSlug,
            noindex: draft.noindex,
            allowSkip: draft.allowSkip,
            resultsPerPage: draft.resultsPerPage,
            finishCtaLabel: draft.finishCtaLabel,
            finishCtaHref: draft.finishCtaHref,
          })}
        >
          Save
        </button>
        <a className="btn btn-secondary" href={`/${adminPath}/m/product-discovery-tool/flows/${flow.id}/intro`} target="_blank" rel="noreferrer">
          Design the intro
        </a>
        <a className="btn btn-secondary" href={`/${flow.slug}`} target="_blank" rel="noreferrer">View the page</a>
      </div>
    </div>
  )
}

function NodeEditor({ node, vocab, send, busy, onDeleted }: {
  node: PdtNode
  vocab: PdtVocabulary
  send: Sender
  busy: boolean
  onDeleted: () => void
}) {
  const [draft, setDraft] = useState(node)
  const [filterIds, setFilterIds] = useState<string[]>(node.filterIds)
  const set = <K extends keyof PdtNode>(key: K, value: PdtNode[K]) => setDraft((prev) => ({ ...prev, [key]: value }))
  const options = scopeOptions(vocab, draft.scopeType)

  return (
    <div style={{ marginTop: '0.9rem', paddingTop: '0.9rem', borderTop: '1px solid var(--color-border)', display: 'grid', gap: '0.75rem' }}>
      <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 15rem), 1fr))' }}>
        <label>
          <span style={LABEL}>Label</span>
          <input className="form-control" value={draft.label} onChange={(e) => set('label', e.target.value)} />
        </label>
        <label>
          <span style={LABEL}>Address bit</span>
          <input className="form-control" value={draft.slug} onChange={(e) => set('slug', e.target.value)} />
        </label>
        <label>
          <span style={LABEL}>What it selects</span>
          <select className="form-control" value={draft.scopeType} onChange={(e) => { set('scopeType', e.target.value as PdtNode['scopeType']); set('scopeSlug', null) }}>
            {NODE_SCOPES.map((scope) => <option key={scope.value} value={scope.value}>{scope.label}</option>)}
          </select>
        </label>
        {(draft.scopeType === 'CATEGORY' || draft.scopeType === 'COLLECTION' || draft.scopeType === 'TAG') && (
          <label>
            <span style={LABEL}>Which one</span>
            <select className="form-control" value={draft.scopeSlug ?? ''} onChange={(e) => set('scopeSlug', e.target.value || null)}>
              <option value="">Choose…</option>
              {options.map((option) => <option key={option.slug} value={option.slug}>{option.name}</option>)}
            </select>
          </label>
        )}
        <PicturePicker
          label="Picture"
          hint="From your media library, so it follows the file when you optimise or move it."
          value={draft.imageUrl ?? null}
          onChange={(url) => set('imageUrl', url)}
        />
        <label>
          <span style={LABEL}>Or an emoji</span>
          <input className="form-control" value={draft.icon ?? ''} maxLength={4} onChange={(e) => set('icon', e.target.value || null)} />
        </label>
      </div>

      <label>
        <span style={LABEL}>One line on the card</span>
        <input className="form-control" value={draft.blurb ?? ''} onChange={(e) => set('blurb', e.target.value || null)} />
      </label>
      <label>
        <span style={LABEL}>The longer explanation, behind &ldquo;What is this?&rdquo;</span>
        <textarea className="form-control" rows={4} value={draft.explainer ?? ''} onChange={(e) => set('explainer', e.target.value || null)} />
      </label>
      <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 18rem), 1fr))' }}>
        <label>
          <span style={LABEL}>Best for</span>
          <textarea className="form-control" rows={2} value={draft.bestFor ?? ''} onChange={(e) => set('bestFor', e.target.value || null)} />
        </label>
        <label>
          <span style={LABEL}>Worth knowing</span>
          <textarea className="form-control" rows={2} value={draft.notFor ?? ''} onChange={(e) => set('notFor', e.target.value || null)} />
        </label>
      </div>

      <div>
        <span style={LABEL}>Filters this choice turns on</span>
        <p style={{ margin: '0 0 0.5rem', fontSize: '0.8125rem', color: 'var(--color-text-secondary)', maxWidth: '62ch' }}>
          These are what the choice IS, so the features step never asks about them again. A choice can narrow to a
          category and turn filters on at the same time.
        </p>
        <div style={{ display: 'grid', gap: '0.4rem', maxHeight: '16rem', overflow: 'auto' }}>
          {vocab.groups.map((group) => (
            <div key={group.id}>
              <strong style={{ fontSize: '0.8125rem' }}>{group.name}</strong>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.2rem' }}>
                {group.filters.map((filter) => (
                  <label key={filter.id} style={{ display: 'flex', gap: '0.3rem', alignItems: 'center', fontSize: '0.8125rem' }}>
                    <input
                      type="checkbox"
                      checked={filterIds.includes(filter.id)}
                      onChange={(e) => setFilterIds((prev) => (e.target.checked ? [...prev, filter.id] : prev.filter((id) => id !== filter.id)))}
                    />
                    <span>{filter.label}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={() => send(`${PDT_API}/nodes/${node.id}`, 'PUT', {
            label: draft.label,
            slug: draft.slug,
            blurb: draft.blurb,
            explainer: draft.explainer,
            bestFor: draft.bestFor,
            notFor: draft.notFor,
            imageUrl: draft.imageUrl,
            icon: draft.icon,
            scopeType: draft.scopeType,
            scopeSlug: draft.scopeSlug,
            filterIds,
          })}
        >
          Save this choice
        </button>
        <button
          type="button"
          className="btn btn-danger"
          disabled={busy}
          onClick={async () => {
            if (!window.confirm(`Delete “${node.label}” and everything under it?`)) return
            await send(`${PDT_API}/nodes/${node.id}`, 'DELETE')
            onDeleted()
          }}
        >
          Delete
        </button>
      </div>
    </div>
  )
}
