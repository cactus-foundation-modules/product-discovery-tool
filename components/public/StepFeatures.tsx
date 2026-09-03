'use client'

import { useState } from 'react'
import { isImageSwatch } from '@/modules/filters-for-shop/lib/types'
import type { FltPublicFilter, FltPublicGroup } from '@/modules/filters-for-shop/components/public/FilterShell'
import type { FltSelection } from '@/modules/filters-for-shop/lib/filter-logic'
import type { PdtAskedQuestion } from '@/modules/product-discovery-tool/lib/questions'

// The features step's questions.
//
// Two things separate this from an ordinary filter panel, and both are the
// point of the whole module:
//
//  - every option carries a note, with the full explanation and the like-for-
//    like comparison an affordance away;
//  - an option that would leave nothing is SHOWN, disabled, with its count of
//    zero, rather than quietly dropped. A guided flow is supposed to teach, and
//    a vanishing option teaches nothing. It stays focusable (aria-disabled, not
//    the disabled attribute) so the reason can actually be read out.

export type PdtOptionView = {
  filter: FltPublicFilter
  count: number
  note: string | null
  hasExplainer: boolean
}

export type PdtQuestionView = PdtAskedQuestion<FltPublicGroup> & {
  options: PdtOptionView[]
  canCompare: boolean
}

export function StepFeatures({
  questions,
  selected,
  showCounts,
  startCollapsed = false,
  onToggle,
  onExplain,
  onCompare,
}: {
  questions: PdtQuestionView[]
  selected: FltSelection
  showCounts: boolean
  /** Whether a question arrives shut. Beside the products there is a column to
   *  fill and they all open; across the top of the results they all start shut,
   *  because a wall of ticks between the shopper and the products is the one
   *  thing that layout must not do. */
  startCollapsed?: boolean
  onToggle: (groupId: string, filterId: string, multi: boolean) => void
  onExplain: (groupId: string, filterId: string) => void
  onCompare: (groupId: string) => void
}) {
  // Which questions the shopper has moved AWAY from their starting state, not
  // which are shut. Held as the difference so a group that only becomes
  // askable further into the flow arrives the same way round as the ones
  // already on screen, and so switching layouts never leaves a stale set
  // behind.
  const [toggled, setToggled] = useState<Set<string>>(new Set())
  const [showSecondary, setShowSecondary] = useState(false)

  const primary = questions.filter((q) => q.importance === 'PRIMARY')
  const secondary = questions.filter((q) => q.importance === 'SECONDARY')

  if (questions.length === 0) {
    return (
      <p className="pdt-no-questions">
        Everything left here is much of a muchness on the features we ask about, so there is nothing more to narrow down.
      </p>
    )
  }

  const toggleOpen = (groupId: string) =>
    setToggled((prev) => {
      const next = new Set(prev)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })

  const renderQuestion = (question: PdtQuestionView) => {
    const { group } = question
    const isClosed = startCollapsed !== toggled.has(group.id)
    const bodyId = `pdt-q-${group.id}`
    const picked = selected.get(group.id)
    const pickedCount = picked?.size ?? 0
    return (
      <fieldset key={group.id} className={`pdt-question${isClosed ? ' is-closed' : ''}`}>
        <legend>
          <button
            type="button"
            className="pdt-question-head"
            aria-expanded={!isClosed}
            aria-controls={bodyId}
            onClick={() => toggleOpen(group.id)}
          >
            <span>
              {question.heading}
              {pickedCount > 0 && <span className="pdt-question-badge">{pickedCount}</span>}
            </span>
            <span className="pdt-chevron" aria-hidden />
          </button>
        </legend>
        <div className="pdt-question-body" id={bodyId}>
          {question.explainer && <p className="pdt-question-explainer">{question.explainer}</p>}
          <div className="pdt-options">
            {question.options.map(({ filter, count, note, hasExplainer }) => {
              const on = picked?.has(filter.id) ?? false
              const dead = count === 0 && !on
              const swatch = filter.swatch
              const swatchStyle = swatch
                ? isImageSwatch(swatch)
                  ? { backgroundImage: `url("${swatch}")` }
                  : { background: swatch }
                : undefined
              return (
                <div key={filter.id}>
                  <label className={`pdt-option${dead ? ' is-dead' : ''}`}>
                    <input
                      type={question.multi ? 'checkbox' : 'radio'}
                      name={question.multi ? undefined : `pdt-group-${group.id}`}
                      checked={on}
                      // aria-disabled rather than disabled: the control stays
                      // focusable so a screen reader reaches the reason, and the
                      // change is refused below rather than swallowed by the
                      // browser.
                      aria-disabled={dead || undefined}
                      aria-describedby={dead ? `pdt-dead-${filter.id}` : undefined}
                      onChange={() => {
                        if (dead) return
                        onToggle(group.id, filter.id, question.multi)
                      }}
                    />
                    {swatchStyle && <span className="pdt-option-swatch" style={swatchStyle} aria-hidden />}
                    <span className="pdt-option-label">{filter.label}</span>
                    {showCounts && <span className="pdt-option-count">{count}</span>}
                  </label>
                  {dead && (
                    <p className="pdt-option-note" id={`pdt-dead-${filter.id}`}>
                      Nothing left matches this alongside your other answers.
                    </p>
                  )}
                  {!dead && note && <p className="pdt-option-note">{note}</p>}
                  {hasExplainer && (
                    <p className="pdt-option-note">
                      <button type="button" className="pdt-link" onClick={() => onExplain(group.id, filter.id)}>
                        More about {filter.label}
                      </button>
                    </p>
                  )}
                </div>
              )
            })}
          </div>
          {question.canCompare && (
            <button type="button" className="pdt-link" onClick={() => onCompare(group.id)}>
              Compare these side by side
            </button>
          )}
        </div>
      </fieldset>
    )
  }

  return (
    <>
      {primary.map(renderQuestion)}
      {secondary.length > 0 && (
        <>
          <button
            type="button"
            className="pdt-skip pdt-secondary-toggle"
            aria-expanded={showSecondary}
            onClick={() => setShowSecondary((on) => !on)}
          >
            {showSecondary ? 'Fewer options' : `More options (${secondary.length})`}
          </button>
          {showSecondary && secondary.map(renderQuestion)}
        </>
      )}
    </>
  )
}
