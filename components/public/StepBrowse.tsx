'use client'

import type { PdtTreeNode } from '@/modules/product-discovery-tool/lib/flow'

// One browse step: the children of wherever the shopper has got to, as cards
// with a picture, a label, a one-line blurb and a live count of what lies
// behind each one.
//
// A card whose count is zero is HIDDEN rather than disabled. A type nothing is
// filed under is a configuration gap, not a choice worth explaining - which is
// the opposite call from the features step, where a dead option is shown with
// its reason because there the shopper's own answers caused it.

export type PdtBrowseOption = {
  node: PdtTreeNode
  count: number
}

export function StepBrowse({
  legend,
  options,
  showCounts,
  allowSkip,
  canCompare,
  onPick,
  onSkip,
  onExplain,
  onCompare,
}: {
  legend: string
  options: PdtBrowseOption[]
  showCounts: boolean
  allowSkip: boolean
  canCompare: boolean
  onPick: (node: PdtTreeNode) => void
  onSkip: () => void
  onExplain: (node: PdtTreeNode) => void
  onCompare: () => void
}) {
  const live = options.filter((option) => option.count > 0)

  if (live.length === 0) {
    return (
      <p className="pdt-empty">
        There is nothing to choose from here yet.{' '}
        {allowSkip && (
          <button type="button" className="pdt-link" onClick={onSkip}>Carry on anyway</button>
        )}
      </p>
    )
  }

  return (
    <>
      {/* A real fieldset with a legend: this is a single-answer question, and a
          screen reader should hear it as one. The legend is visually hidden
          because the step heading above already says it on screen. */}
      <fieldset className="pdt-browse">
        <legend>{legend}</legend>
        {live.map(({ node, count }) => {
          const hasMore = !!(node.explainer?.trim())
          return (
            <div key={node.id} className="pdt-choice">
              <button type="button" className="pdt-choice-pick" onClick={() => onPick(node)}>
                {node.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- media library URLs are arbitrary remote hosts, not a configured next/image loader
                  <img className="pdt-choice-pic" src={node.imageUrl} alt="" loading="lazy" />
                ) : node.icon ? (
                  <span className="pdt-choice-icon" aria-hidden>{node.icon}</span>
                ) : null}
                <span className="pdt-choice-body">
                  <span className="pdt-choice-label">{node.label}</span>
                  {node.blurb && <span className="pdt-choice-blurb">{node.blurb}</span>}
                  {showCounts && (
                    <span className="pdt-choice-count">{count} {count === 1 ? 'product' : 'products'}</span>
                  )}
                </span>
              </button>
              {hasMore && (
                <div className="pdt-choice-more">
                  <button type="button" className="pdt-link" onClick={() => onExplain(node)}>
                    What is this?
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </fieldset>

      <div className="pdt-browse-foot">
        {canCompare && (
          <button type="button" className="pdt-skip" onClick={onCompare}>Compare these</button>
        )}
        {allowSkip && (
          <button type="button" className="pdt-skip" onClick={onSkip}>Not sure yet</button>
        )}
      </div>
    </>
  )
}
