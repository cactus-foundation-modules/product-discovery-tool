'use client'

import type { PdtTreeNode } from '@/modules/product-discovery-tool/lib/flow'
import { PDT_UNSTYLED } from '@/modules/product-discovery-tool/lib/types'

// One browse step: the children of wherever the shopper has got to, as cards
// with a picture, a label, a one-line blurb and a live count of what lies
// behind each one.
//
// A card whose count is zero is HIDDEN rather than disabled. A type nothing is
// filed under is a configuration gap, not a choice worth explaining - which is
// the opposite call from the features step, where a dead option is shown with
// its reason because there the shopper's own answers caused it.
//
// A count of NULL is a third case and means "not counted yet", not "none": the
// answer set arrives after the first paint, and a tile whose number is not in
// yet is shown without one. It must never be filtered out - reading null as
// zero here would blank the whole first step until the fetch landed, which is
// the one thing the deferral must not do.

export type PdtBrowseOption = {
  node: PdtTreeNode
  count: number | null
}

// The grid a DEEPER step (anything after the first) is drawn in. Step one keeps
// its fixed pattern (two wide, then threes); below it the number of tiles
// varies by category, so the shape follows the count: fours and eights go four
// across, sixes and fifteens go three across, and on a tablet or phone the fours
// and sixes go in pairs while a fifteen puts its first tile on a line of its own
// and pairs the rest. Any other count keeps the first-step pattern, which is
// what it did before this existed.
export function deeperGridClass(count: number): string {
  if (count === 4 || count === 8) return ' pdt-grid-4'
  if (count === 6) return ' pdt-grid-3'
  if (count === 15) return ' pdt-grid-3 pdt-grid-lead'
  return ''
}

export function StepBrowse({
  legend,
  deeper,
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
  /** True on every browse step after the first. */
  deeper: boolean
  options: PdtBrowseOption[]
  showCounts: boolean
  allowSkip: boolean
  canCompare: boolean
  onPick: (node: PdtTreeNode) => void
  onSkip: () => void
  onExplain: (node: PdtTreeNode) => void
  onCompare: () => void
}) {
  const live = options.filter((option) => option.count === null || option.count > 0)
  const hasFoot = canCompare || allowSkip
  if (live.length === 0) {
    return (
      <p className="pdt-empty" {...PDT_UNSTYLED}>
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
      <fieldset className={`pdt-browse${deeper ? deeperGridClass(live.length) : ''}`} {...PDT_UNSTYLED}>
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
                  {showCounts && count !== null && (
                    <span className="pdt-choice-count">{count} {count === 1 ? 'product' : 'products'}</span>
                  )}
                </span>
              </button>
              {hasMore && (
                <div className="pdt-choice-more">
                  <button type="button" className="pdt-link pdt-choice-explain" onClick={() => onExplain(node)}>
                    What is this?
                  </button>
                </div>
              )}
            </div>
          )
        })}
        {/* Inside the grid, on a row of its own: the cards are laid out in a
            fixed pattern (two wide, then rows of three; one wide on a phone, then
            pairs), so there is no spare cell at the end to tuck the buttons into. */}
        {hasFoot && (
          <div className="pdt-browse-foot">
            {canCompare && (
              <button type="button" className="pdt-skip" onClick={onCompare}>Compare these</button>
            )}
            {allowSkip && (
              <button type="button" className="pdt-skip" onClick={onSkip}>Not sure yet</button>
            )}
          </div>
        )}
      </fieldset>
    </>
  )
}
