import { describe, it, expect } from 'vitest'
import { renderToString } from 'react-dom/server'
import { StepBrowse, type PdtBrowseOption } from '@/modules/product-discovery-tool/components/public/StepBrowse'
import type { PdtTreeNode } from '@/modules/product-discovery-tool/lib/flow'

// The flow's answer set is fetched after the first paint rather than serialised
// into the page (660 KB of it, on the live homepage - see lib/dataset.ts). That
// leaves a window in which a tile's count is NOT YET KNOWN, and this file exists
// because there is a one-character way to turn that window into a blank page.
//
// StepBrowse hides a tile whose count is zero, on purpose: a type nothing is
// filed under is a configuration gap, not a choice worth offering. An unknown
// count is a different thing entirely, and if it is read as zero - which is what
// `count > 0` does to a null - then EVERY tile is hidden until the fetch lands
// and the finder opens on an empty step. That is the single worst outcome of the
// whole deferral, it only shows up in the moment before the data arrives, and no
// type error or lint rule catches it.

function node(id: string, label: string): PdtTreeNode {
  return {
    id,
    label,
    slug: id,
    blurb: null,
    imageUrl: null,
    explainer: null,
    scopeType: 'ALL',
    scopeSlug: null,
    filterIds: [],
    parentId: null,
    position: 0,
    children: [],
  } as unknown as PdtTreeNode
}

// React writes `<!-- -->` between two adjacent interpolations, so the rendered
// count reads `3<!-- --> products`. Stripped here rather than matched around,
// because what is being asserted is what a shopper sees.
function render(options: PdtBrowseOption[]): string {
  return renderMarkup(options).replace(/<!-- -->/g, '')
}

function renderMarkup(options: PdtBrowseOption[]): string {
  return renderToString(
    <StepBrowse
      legend="What are you after?"
      options={options}
      showCounts
      allowSkip={false}
      canCompare={false}
      onPick={() => {}}
      onSkip={() => {}}
      onExplain={() => {}}
      onCompare={() => {}}
    />,
  )
}

describe('a browse tile whose count has not arrived yet', () => {
  it('is shown, not hidden', () => {
    const html = render([{ node: node('chairs', 'Chairs'), count: null }])
    expect(html).toContain('Chairs')
  })

  it('is shown without a number, rather than with a wrong one', () => {
    const html = render([{ node: node('chairs', 'Chairs'), count: null }])
    expect(html).toContain('Chairs')
    expect(html).not.toContain('pdt-choice-count')
    expect(html).not.toMatch(/\b0 products\b/)
    expect(html).not.toContain('null')
  })

  it('does not stop a genuinely empty tile being hidden', () => {
    // The existing rule has to survive the new one: a real zero is still a
    // configuration gap and still goes.
    const html = render([
      { node: node('chairs', 'Chairs'), count: 3 },
      { node: node('nothing', 'Filed under nothing'), count: 0 },
    ])
    expect(html).toContain('Chairs')
    expect(html).toContain('3 products')
    expect(html).not.toContain('Filed under nothing')
  })

  it('draws every tile when none of them are counted yet', () => {
    // The homepage case: the whole first step, before the fetch lands.
    const html = render([
      { node: node('chairs', 'Chairs'), count: null },
      { node: node('desks', 'Desks'), count: null },
      { node: node('storage', 'Storage'), count: null },
    ])
    for (const label of ['Chairs', 'Desks', 'Storage']) expect(html).toContain(label)
  })

  it('says "product" singular for a count of one', () => {
    // Guarding the branch the null check sits next to.
    const html = render([{ node: node('chairs', 'Chairs'), count: 1 }])
    expect(html).toContain('1 product')
    expect(html).not.toContain('1 products')
  })
})
