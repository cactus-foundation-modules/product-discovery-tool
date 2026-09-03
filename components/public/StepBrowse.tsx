'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
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

export type PdtBrowseOption = {
  node: PdtTreeNode
  count: number
}

// Layout, not passive: the foot moves between the gap at the end of the last
// row and a row of its own, and after paint that move is a visible jump.
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

/** How many columns the browse grid is actually drawing, read back off the
 *  element rather than worked out from the breakpoints.
 *
 *  `auto-fit` decides the count from the container's own width, so nothing in
 *  this file knows it in advance - and the answer changes with the sidebar, the
 *  window and the zoom level, not just the viewport. The computed
 *  `grid-template-columns` is the used track list, so counting the tracks IS
 *  the column count. */
function useGridColumns(ref: React.RefObject<HTMLElement | null>): number {
  const [columns, setColumns] = useState(0)
  useIsomorphicLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const read = () => {
      const tracks = getComputedStyle(el).gridTemplateColumns
      setColumns(tracks && tracks !== 'none' ? tracks.split(' ').filter(Boolean).length : 0)
    }
    read()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(read)
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])
  return columns
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
  const gridRef = useRef<HTMLFieldSetElement>(null)
  const columns = useGridColumns(gridRef)
  const live = options.filter((option) => option.count > 0)
  const hasFoot = canCompare || allowSkip
  // A gap at the end of the last row is the natural home for the two buttons:
  // they fill the hole instead of pushing the page down for a row of their own.
  // A full last row leaves nowhere to put them, so they take a row and centre
  // in it. Before the first measurement there is no honest answer, so they go
  // underneath - the arrangement that is right whatever the count turns out to
  // be.
  const beside = hasFoot && columns > 0 && live.length % columns !== 0

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
      <fieldset className="pdt-browse" ref={gridRef} {...PDT_UNSTYLED}>
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
        {/* Inside the grid, so an unfilled cell at the end of the last row can
            hold it. `is-below` then spans the full width and centres, which is
            what a full last row leaves as the only readable arrangement. */}
        {hasFoot && (
          <div className={`pdt-browse-foot ${beside ? 'is-beside' : 'is-below'}`}>
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
