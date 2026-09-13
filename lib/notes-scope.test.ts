import { describe, expect, it } from 'vitest'
import { notesTheFlowCanShow } from '@/modules/product-discovery-tool/lib/notes-scope'
import { resolveNotes } from '@/modules/product-discovery-tool/lib/compare'
import type { PdtOptionNote } from '@/modules/product-discovery-tool/lib/types'

// The notes used to be every note on the site, written into every page the flow
// sat on. They now travel with the fetched answer set, cut down to the ones this
// flow can show - and the cut has exactly one way to go wrong that anybody would
// notice: dropping a note a shopper should have seen. So most of what is pinned
// here is what must SURVIVE the cut, not what goes.

function note(filterId: string, nodeId: string | null, fields: Partial<PdtOptionNote> = {}): PdtOptionNote {
  return {
    id: `${filterId}-${nodeId ?? 'global'}`,
    filterId,
    nodeId,
    explainer: null,
    bestFor: null,
    watchOut: null,
    imageUrl: null,
    learnMoreHref: null,
    ...fields,
  }
}

const offered = [
  { filters: [{ id: 'oak' }, { id: 'walnut' }] },
  { filters: [{ id: 'electric' }, { id: 'manual' }] },
]
const flowNodes = ['desks', 'desks/height-adjustable', 'chairs']

describe('notesTheFlowCanShow', () => {
  it('keeps a global note on an option the flow offers', () => {
    const kept = notesTheFlowCanShow([note('oak', null, { explainer: 'Real veneer.' })], flowNodes, offered)
    expect(kept.map((n) => n.id)).toEqual(['oak-global'])
  })

  it('keeps an override scoped to one of this flow\'s nodes, at any depth', () => {
    const kept = notesTheFlowCanShow(
      [note('electric', 'desks/height-adjustable'), note('oak', 'chairs')],
      flowNodes,
      offered,
    )
    expect(kept.map((n) => n.id)).toEqual(['electric-desks/height-adjustable', 'oak-chairs'])
  })

  it('keeps an override with nothing written in it, because it still wins over the global note', () => {
    const blank = note('oak', 'chairs')
    const kept = notesTheFlowCanShow([note('oak', null, { bestFor: 'Warmth' }), blank], flowNodes, offered)
    expect(kept).toHaveLength(2)
    // The point of keeping it: on chairs the shopper sees the owner's silence,
    // not the global copy the owner chose to override.
    expect(resolveNotes(kept, ['chairs']).get('oak')).toBe(blank)
  })

  it('drops an override scoped to another flow\'s node, which resolveNotes could never pick', () => {
    const kept = notesTheFlowCanShow([note('oak', 'somebody-elses-node')], flowNodes, offered)
    expect(kept).toEqual([])
  })

  it('drops a note on a filter the flow does not offer, since no option or table can show it', () => {
    const kept = notesTheFlowCanShow([note('glass', null), note('glass', 'desks')], flowNodes, offered)
    expect(kept).toEqual([])
  })

  it('resolves to exactly what the unscoped notes resolved to, at every point in the flow', () => {
    // The whole contract in one assertion: for every path the shopper can stand
    // on, the shell picks the same note from the scoped list as it would have
    // from every note on the site.
    const everyNote = [
      note('oak', null, { explainer: 'global oak' }),
      note('oak', 'desks', { explainer: 'desk oak' }),
      note('oak', 'desks/height-adjustable', { explainer: 'deep oak' }),
      note('walnut', 'chairs', { explainer: 'chair walnut' }),
      note('electric', null, { explainer: 'global electric' }),
      note('electric', 'other-flow-node', { explainer: 'not ours' }),
      note('glass', null, { explainer: 'not offered' }),
    ]
    const scoped = notesTheFlowCanShow(everyNote, flowNodes, offered)
    const offeredIds = offered.flatMap((group) => group.filters.map((filter) => filter.id))
    const paths = [[], ['desks'], ['desks', 'desks/height-adjustable'], ['chairs']]
    for (const path of paths) {
      const before = resolveNotes(everyNote, path)
      const after = resolveNotes(scoped, path)
      for (const filterId of offeredIds) expect(after.get(filterId)).toBe(before.get(filterId))
    }
  })

  it('keeps nothing when the flow offers nothing', () => {
    expect(notesTheFlowCanShow([note('oak', null)], flowNodes, [])).toEqual([])
  })
})
