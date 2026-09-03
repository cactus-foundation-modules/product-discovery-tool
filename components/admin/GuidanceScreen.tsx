'use client'

import { useMemo, useState } from 'react'
import type { PdtFlow, PdtOptionNote } from '@/modules/product-discovery-tool/lib/types'
import { CARD, LABEL, PDT_API, type PdtVocabulary } from '@/modules/product-discovery-tool/components/admin/shared'
import { PicturePicker } from '@/modules/product-discovery-tool/components/admin/PicturePicker'

// The coverage screen.
//
// Copy is the product here. The code is a week; a hundred honest explanations of
// what a cantilever frame is are the actual work. So this lists EVERY filter in
// the whole vocabulary with a tick for "has an explanation", which is what makes
// the missing copy visible instead of letting a flow ship half-explained.
//
// The file import and export live here too, because they are the same job at a
// different scale: a flow's whole configuration, referenced by slug, checked
// before it is applied.

type Sender = (url: string, method: string, body?: unknown) => Promise<Record<string, unknown> | null>

type ImportProblem = { where: string; problem: string }
type ImportReport = { ok: boolean; problems: ImportProblem[]; counts: { nodes: number; questions: number; notes: number; nodesToDelete: number } }

export function GuidanceScreen({ flow, notes, vocab, send, busy, reload }: {
  flow: PdtFlow
  notes: PdtOptionNote[]
  vocab: PdtVocabulary
  send: Sender
  busy: boolean
  reload: () => Promise<void>
}) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [onlyMissing, setOnlyMissing] = useState(false)

  // Only the global notes here. A node-scoped override is written where the
  // difference is - on that node's own step - and mixing the two into one list
  // would make it look as though a filter had two explanations at once.
  const globalByFilter = useMemo(() => {
    const out = new Map<string, PdtOptionNote>()
    for (const note of notes) if (note.nodeId === null) out.set(note.filterId, note)
    return out
  }, [notes])

  const rows = useMemo(
    () => vocab.groups.flatMap((group) => group.filters.map((filter) => ({ group, filter, note: globalByFilter.get(filter.id) ?? null }))),
    [vocab.groups, globalByFilter],
  )
  const written = rows.filter((row) => (row.note?.explainer ?? '').trim()).length
  const shown = onlyMissing ? rows.filter((row) => !(row.note?.explainer ?? '').trim()) : rows

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div>
        <h3 style={{ fontSize: '1rem', margin: '0 0 0.25rem' }}>What each option means</h3>
        <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: '0.875rem', maxWidth: '62ch' }}>
          Written once per option and used by every flow you build. Shoppers see the &ldquo;best for&rdquo; line under
          the option itself and the rest behind &ldquo;More about&hellip;&rdquo;, and the side-by-side comparison is
          built out of exactly these words - so there is nowhere for the two to disagree.
        </p>
      </div>

      <div style={{ ...CARD, display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <strong>{written} of {rows.length} explained</strong>
        <label style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', fontSize: '0.875rem' }}>
          <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} />
          <span>Only show the ones with nothing written</span>
        </label>
        <span style={{ flex: '1 1 auto' }} />
        <FileTools flow={flow} send={send} busy={busy} reload={reload} />
      </div>

      <div style={{ display: 'grid', gap: '0.5rem' }}>
        {shown.map(({ group, filter, note }) => (
          <div key={filter.id} style={CARD}>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-sm" onClick={() => setOpenId(openId === filter.id ? null : filter.id)}>
                {openId === filter.id ? 'Close' : 'Write'}
              </button>
              <strong style={{ flex: '1 1 auto', minWidth: 0 }}>{filter.label}</strong>
              <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>{group.name}</span>
              <span style={{ fontSize: '0.8125rem', color: (note?.explainer ?? '').trim() ? 'var(--color-success)' : 'var(--color-warning)' }}>
                {(note?.explainer ?? '').trim() ? 'Explained' : 'Nothing written'}
              </span>
            </div>
            {openId === filter.id && <NoteEditor filterId={filter.id} note={note} send={send} busy={busy} />}
          </div>
        ))}
        {shown.length === 0 && (
          <p style={{ color: 'var(--color-text-secondary)' }}>
            {rows.length === 0 ? 'There are no filters to explain yet.' : 'Every option has something written about it. Well done.'}
          </p>
        )}
      </div>
    </div>
  )
}

function NoteEditor({ filterId, note, send, busy }: {
  filterId: string
  note: PdtOptionNote | null
  send: Sender
  busy: boolean
}) {
  const [explainer, setExplainer] = useState(note?.explainer ?? '')
  const [bestFor, setBestFor] = useState(note?.bestFor ?? '')
  const [watchOut, setWatchOut] = useState(note?.watchOut ?? '')
  const [imageUrl, setImageUrl] = useState(note?.imageUrl ?? '')
  const [learnMoreHref, setLearnMoreHref] = useState(note?.learnMoreHref ?? '')

  return (
    <div style={{ marginTop: '0.9rem', paddingTop: '0.9rem', borderTop: '1px solid var(--color-border)', display: 'grid', gap: '0.75rem' }}>
      <label>
        <span style={LABEL}>What it is</span>
        <textarea className="form-control" rows={4} value={explainer} onChange={(e) => setExplainer(e.target.value)} />
      </label>
      <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 18rem), 1fr))' }}>
        <label>
          <span style={LABEL}>Best for (shown under the option)</span>
          <textarea className="form-control" rows={2} value={bestFor} onChange={(e) => setBestFor(e.target.value)} />
        </label>
        <label>
          <span style={LABEL}>Worth knowing</span>
          <textarea className="form-control" rows={2} value={watchOut} onChange={(e) => setWatchOut(e.target.value)} />
        </label>
        <PicturePicker
          label="Picture"
          hint="From your media library, so it follows the file when you optimise or move it."
          value={imageUrl || null}
          onChange={(url) => setImageUrl(url ?? '')}
        />
        <label>
          <span style={LABEL}>Read more at</span>
          <input className="form-control" value={learnMoreHref} onChange={(e) => setLearnMoreHref(e.target.value)} />
        </label>
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={() => send(`${PDT_API}/notes`, 'POST', {
            filterId,
            nodeId: null,
            explainer: explainer.trim() || null,
            bestFor: bestFor.trim() || null,
            watchOut: watchOut.trim() || null,
            imageUrl: imageUrl.trim() || null,
            learnMoreHref: learnMoreHref.trim() || null,
          })}
        >
          Save
        </button>
        {note && (
          <button type="button" className="btn btn-danger" disabled={busy} onClick={() => send(`${PDT_API}/notes/${note.id}`, 'DELETE')}>
            Delete
          </button>
        )}
      </div>
    </div>
  )
}

function FileTools({ flow, send, busy, reload }: {
  flow: PdtFlow
  send: Sender
  busy: boolean
  reload: () => Promise<void>
}) {
  const [file, setFile] = useState<string>('')
  const [report, setReport] = useState<ImportReport | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  async function check() {
    setProblem(null)
    setReport(null)
    let parsed: unknown
    try {
      parsed = JSON.parse(file)
    } catch {
      setProblem('That is not readable as a file. Check it is the whole thing, brackets and all.')
      return
    }
    const res = await fetch(`${PDT_API}/import?dryRun=1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setProblem(typeof data.error === 'string' ? data.error : 'That file could not be read.')
      if (Array.isArray(data.problems)) setReport({ ok: false, problems: data.problems, counts: { nodes: 0, questions: 0, notes: 0, nodesToDelete: 0 } })
      return
    }
    setReport(data.report as ImportReport)
  }

  async function apply() {
    let parsed: unknown
    try {
      parsed = JSON.parse(file)
    } catch {
      setProblem('That is not readable as a file.')
      return
    }
    const done = await send(`${PDT_API}/import`, 'POST', parsed)
    if (done) {
      setFile('')
      setReport(null)
      setOpen(false)
      await reload()
    }
  }

  return (
    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
      <a className="btn btn-secondary btn-sm" href={`${PDT_API}/flows/${flow.id}/export`} target="_blank" rel="noreferrer">
        Download this flow
      </a>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen((on) => !on)}>
        {open ? 'Close' : 'Upload a flow'}
      </button>

      {open && (
        <div style={{ flex: '1 1 100%', marginTop: '0.6rem', display: 'grid', gap: '0.6rem' }}>
          <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-text-secondary)', maxWidth: '62ch' }}>
            Paste a downloaded flow here. Nothing is written until you have read the check: it tells you exactly what
            the file names that your shop does not have, and how much of your existing flow it would replace.
          </p>
          <textarea
            className="form-control"
            rows={8}
            value={file}
            spellCheck={false}
            placeholder="Paste the whole file here"
            onChange={(e) => { setFile(e.target.value); setReport(null); setProblem(null) }}
          />
          {problem && <p className="alert alert-danger" style={{ margin: 0 }}>{problem}</p>}
          {report && (
            <div className={report.ok ? 'alert alert-success' : 'alert alert-danger'} style={{ margin: 0 }}>
              {report.ok ? (
                <>
                  Ready: {report.counts.nodes} choices, {report.counts.questions} questions, {report.counts.notes} explanations.
                  {report.counts.nodesToDelete > 0 && ` ${report.counts.nodesToDelete} of your existing choices are not in this file and would be removed.`}
                </>
              ) : (
                <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                  {report.problems.map((entry, at) => (
                    <li key={at}>{entry.where} {entry.problem}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="button" className="btn btn-secondary" disabled={busy || !file.trim()} onClick={check}>Check it</button>
            <button type="button" className="btn btn-primary" disabled={busy || !report?.ok} onClick={apply}>Apply it</button>
          </div>
        </div>
      )}
    </div>
  )
}
