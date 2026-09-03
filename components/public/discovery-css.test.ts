import { describe, it, expect } from 'vitest'
import { discoveryCss } from '@/modules/product-discovery-tool/components/public/discovery-css'

// The stylesheet is one template literal, so the things that break it break
// quietly: a rule that escapes its media query changes a phone, and a stray
// brace swallows everything after it while `tsc` and `eslint` stay green.
//
// What is pinned here is the contract the block's "Questions" field promises:
// across the top is a DESKTOP layout, and tablet and below keep the sheet
// whichever way the field is set.

const BP = { tabletBp: '1024px', mobileBp: '640px' }
const css = discoveryCss(BP)

/** Every `@media` block in the sheet as (condition, body). Brace-counted rather
 *  than matched with a regex, because a regex cannot see nesting and the point
 *  of this file is to notice when nesting has gone wrong. */
function mediaBlocks(source: string): { condition: string; body: string }[] {
  const out: { condition: string; body: string }[] = []
  const re = /@media([^{]*)\{/g
  let match: RegExpExecArray | null
  while ((match = re.exec(source)) !== null) {
    let depth = 1
    let at = re.lastIndex
    while (at < source.length && depth > 0) {
      if (source[at] === '{') depth++
      else if (source[at] === '}') depth--
      at++
    }
    out.push({ condition: match[1]!.trim(), body: source.slice(re.lastIndex, at - 1) })
  }
  return out
}

describe('discovery stylesheet', () => {
  it('closes every block it opens', () => {
    const opens = (css.match(/\{/g) ?? []).length
    const closes = (css.match(/\}/g) ?? []).length
    expect(opens).toBe(closes)
  })

  it('keeps the questions beside the results by default', () => {
    expect(css).toMatch(/\.pdt-features\{[^}]*grid-template-columns:minmax\(/)
  })

  it('only puts the questions across the top on a wide screen', () => {
    const blocks = mediaBlocks(css)
    const desktop = blocks.filter((block) => block.condition.includes('min-width'))
    const narrow = blocks.filter((block) => !block.condition.includes('min-width'))

    // The layout exists...
    expect(desktop.some((block) => block.body.includes('.pdt-features.pdt-pos-top'))).toBe(true)
    // ...only there. A tablet and a phone put the questions behind the
    // "Narrow down" bar whichever way the block is set, so a rule that leaked
    // out of the desktop query would put a wall of ticks above the products on
    // a phone - the one thing this layout must never do.
    expect(narrow.some((block) => block.body.includes('pdt-pos-top'))).toBe(false)
    const outsideAnyMedia = blocks.reduce((rest, block) => rest.replace(block.body, ''), css)
    expect(outsideAnyMedia).not.toContain('pdt-pos-top')
  })

  it('gives the question row a floor it can go under', () => {
    // auto-fit with a bare minmax floor cannot shrink past that floor, so the
    // track overflows the page and takes the grid sideways with it on a narrow
    // window. The min() form is the fix, and it is easy to lose in an edit.
    const row = /\.pdt-features\.pdt-pos-top \.pdt-questions\{([^}]*)\}/.exec(css)?.[1] ?? ''
    expect(row).toContain('repeat(auto-fit,minmax(min(100%,')
  })

  it('changes a link\u2019s text on hover and nothing else', () => {
    // Core paints every button inside <main> with an !important hover fill and
    // leaves the text where it was, which is what put an amber pill behind
    // "More about Under 120cm". The chrome opts out of that (PDT_UNSTYLED), so
    // this rule is the whole of a link's hover now: no fill to read against.
    const rule = /\.pdt-link:hover\{([^}]*)\}/.exec(css)?.[1] ?? ''
    expect(rule).toContain('color:var(--color-text)')
    expect(rule).not.toContain('background')
  })

  it('only stacks options side by side where the drawer is', () => {
    const blocks = mediaBlocks(css)
    expect(blocks.some((block) => block.condition.includes('max-width') && block.body.includes('pdt-opts-grid'))).toBe(true)
    expect(blocks.some((block) => block.condition.includes('min-width') && block.body.includes('pdt-opts-grid'))).toBe(false)
    const outsideAnyMedia = blocks.reduce((rest, block) => rest.replace(block.body, ''), css)
    expect(outsideAnyMedia).not.toContain('pdt-opts-grid')
  })

  it('lifts a browse card on hover, and holds still when asked to', () => {
    // The same lift as shop's own product card. The two sit in one flow, and a
    // browse card that answered a hover differently would read as a bug.
    const hover = /\.pdt-choice:hover\{([^}]*)\}/.exec(css)?.[1] ?? ''
    expect(hover).toContain('transform:translateY(-4px)')
    const reduced = mediaBlocks(css).find((block) => block.condition.includes('prefers-reduced-motion'))
    expect(reduced?.body).toContain('.pdt-choice:hover{transform:none}')
  })

  it('crops every browse picture square', () => {
    expect(/\.pdt-choice-pic\{([^}]*)\}/.exec(css)?.[1] ?? '').toContain('aspect-ratio:1/1')
    expect(/\.pdt-choice-icon\{([^}]*)\}/.exec(css)?.[1] ?? '').toContain('aspect-ratio:1/1')
  })

  it('spans the browse grid when the buttons take a row of their own', () => {
    // In a spare cell they are one above the other; on a row of their own they
    // span every column and centre. Getting `is-below` wrong strands them under
    // the first card.
    expect(/\.pdt-browse-foot\.is-below\{([^}]*)\}/.exec(css)?.[1] ?? '').toContain('grid-column:1/-1')
    expect(/\.pdt-browse-foot\.is-beside\{([^}]*)\}/.exec(css)?.[1] ?? '').toContain('flex-direction:column')
  })

  it('opens a question across the whole row, options and all', () => {
    // A question opened in the bar takes the full width and lays its options
    // out across it. Both halves are desktop-only: in the drawer the question
    // already has the width, and in the sidebar there is no row to span.
    const desktop = mediaBlocks(css).filter((block) => block.condition.includes('min-width'))
    const body = desktop.map((block) => block.body).join('')
    expect(body).toContain('.pdt-features.pdt-pos-top .pdt-question:not(.is-closed){grid-column:1/-1}')
    expect(/\.pdt-features\.pdt-pos-top \.pdt-question:not\(\.is-closed\) \.pdt-options\{([^}]*)\}/.exec(body)?.[1] ?? '')
      .toContain('repeat(auto-fit,minmax(min(100%,')
  })

  it('sticks the question bar at a movable offset, and grounds it only once stuck', () => {
    const desktop = mediaBlocks(css).filter((block) => block.condition.includes('min-width')).map((b) => b.body).join('')
    const bar = /\.pdt-features\.pdt-pos-top \.pdt-questions\{([^}]*)\}/.exec(desktop)?.[1] ?? ''
    expect(bar).toContain('position:sticky')
    // A site with a taller header moves this rather than editing the module.
    expect(bar).toContain('top:var(--pdt-sticky-top,7rem)')
    const stuck = /\.pdt-features\.pdt-pos-top \.pdt-questions\.is-stuck\{([^}]*)\}/.exec(desktop)?.[1] ?? ''
    expect(stuck).toContain('background:')
    // Padding cannot differ between the two: sticky keeps its space in the
    // flow, so a box that changes size on sticking shunts the page under it.
    expect(stuck).not.toContain('padding')
  })

  it('lays the across-the-top step out as a block, not a one-column grid', () => {
    // A grid item's containing block is its grid area, and a sticky box cannot
    // travel outside its containing block - so the bar in row one of a two-row
    // grid is pinned to its own height and never sticks to anything. Silent,
    // untypeable, and the whole feature.
    const desktop = mediaBlocks(css).filter((block) => block.condition.includes('min-width')).map((b) => b.body).join('')
    expect(/\.pdt-features\.pdt-pos-top\{([^}]*)\}/.exec(desktop)?.[1] ?? '').toContain('display:block')
  })

  it('keeps the sticky sentinel out of the grid', () => {
    // In flow it is a grid row of its own, and the gap around it pushes the
    // questions down by the gap for a marker with no height and nothing to see.
    expect(/\.pdt-sticky-sentinel\{([^}]*)\}/.exec(css)?.[1] ?? '').toContain('position:absolute')
  })

  it('leaves the sheet and its scrim above a chat launcher', () => {
    // Same neighbour, same reason, as filters' own sheet: a live-chat launcher
    // parks itself at 2147482000 and would otherwise cover the open drawer.
    const z = (className: string) => Number(new RegExp(`\\.${className}\\{[^}]*z-index:(\\d+)`).exec(css)?.[1])
    expect(z('pdt-scrim')).toBeGreaterThan(2147482000)
    expect(z('pdt-dialog')).toBeGreaterThan(z('pdt-scrim'))
  })
})
