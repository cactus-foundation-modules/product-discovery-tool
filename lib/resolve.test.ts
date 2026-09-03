import { describe, expect, it } from 'vitest'
import { buildNodeTree } from '@/modules/product-discovery-tool/lib/flow'
import { narrowByNode, resolveScope, type PdtShelf } from '@/modules/product-discovery-tool/lib/resolve'
import type { PdtNode, PdtNodeScope } from '@/modules/product-discovery-tool/lib/types'

function node(id: string, slug: string, parentId: string | null, scopeType: PdtNodeScope, scopeSlug: string | null, filterIds: string[] = []): PdtNode {
  return {
    id,
    flowId: 'flow',
    parentId,
    label: slug,
    slug,
    blurb: null,
    explainer: null,
    bestFor: null,
    notFor: null,
    imageUrl: null,
    icon: null,
    scopeType,
    scopeSlug,
    position: 0,
    filterIds,
  }
}

const NODES: PdtNode[] = [
  node('desks', 'desks', null, 'CATEGORY', 'desks'),
  // A type that is a filter tick rather than a shelf - the case a mirror of the
  // category tree could never express.
  node('ha', 'height-adjustable', 'desks', 'FILTERS', null, ['f-ha']),
  node('corner', 'corner', 'desks', 'CATEGORY', 'corner-desks'),
  node('same', 'same-as-parent', 'desks', 'ALL', null),
]

const ROOTS = buildNodeTree(NODES)

describe('resolveScope', () => {
  it('intersects the flow scope with every node down the chain', () => {
    const resolved = resolveScope({ scopeType: 'TAG', scopeSlug: 'clearance' }, ROOTS, ['desks', 'corner'])
    expect(resolved.shelves).toEqual([
      { type: 'TAG', slug: 'clearance' },
      { type: 'CATEGORY', slug: 'desks' },
      { type: 'CATEGORY', slug: 'corner-desks' },
    ])
  })

  it('treats a child scoped to ALL as "the same products as my parent"', () => {
    const resolved = resolveScope({ scopeType: 'ALL', scopeSlug: null }, ROOTS, ['desks', 'same-as-parent'])
    expect(resolved.shelves).toEqual([{ type: 'CATEGORY', slug: 'desks' }])
  })

  it('collects the ancestors’ filters as locked, deduplicated and in order', () => {
    const withDupes = buildNodeTree([
      node('a', 'a', null, 'ALL', null, ['f1', 'f2']),
      node('b', 'b', 'a', 'ALL', null, ['f2', 'f3']),
    ])
    const resolved = resolveScope({ scopeType: 'ALL', scopeSlug: null }, withDupes, ['a', 'b'])
    expect(resolved.lockedFilterIds).toEqual(['f1', 'f2', 'f3'])
  })

  it('contributes no shelf for a FILTERS node', () => {
    const resolved = resolveScope({ scopeType: 'ALL', scopeSlug: null }, ROOTS, ['desks', 'height-adjustable'])
    expect(resolved.shelves).toEqual([{ type: 'CATEGORY', slug: 'desks' }])
    expect(resolved.lockedFilterIds).toEqual(['f-ha'])
  })

  it('stops at the first segment that names nothing and says where', () => {
    const resolved = resolveScope({ scopeType: 'ALL', scopeSlug: null }, ROOTS, ['desks', 'gone'])
    expect(resolved.unknownAt).toBe(1)
    expect(resolved.nodes.map((n) => n.slug)).toEqual(['desks'])
  })
})

describe('narrowByNode', () => {
  const members = new Map<string, Set<string>>([
    ['CATEGORY:corner-desks', new Set(['p1', 'p2'])],
  ])
  const lookup = (shelf: PdtShelf) => members.get(`${shelf.type}:${shelf.slug}`)
  const matches = (productId: string, filterIds: readonly string[]) =>
    filterIds.every((id) => (productId === 'p1' ? ['f-ha'] : []).includes(id))

  it('keeps only the products on the node’s own shelf', () => {
    const out = narrowByNode(['p1', 'p2', 'p3'], { scopeType: 'CATEGORY', scopeSlug: 'corner-desks', filterIds: [] }, lookup, matches)
    expect(out).toEqual(['p1', 'p2'])
  })

  it('leaves NOTHING when the shelf names something that no longer exists', () => {
    // The alternative - falling back to "no scope" - would put the whole
    // catalogue behind a type that has been deleted.
    const out = narrowByNode(['p1', 'p2'], { scopeType: 'CATEGORY', scopeSlug: 'gone', filterIds: [] }, lookup, matches)
    expect(out).toEqual([])
  })

  it('applies the node’s filters as well as its shelf', () => {
    const out = narrowByNode(['p1', 'p2'], { scopeType: 'CATEGORY', scopeSlug: 'corner-desks', filterIds: ['f-ha'] }, lookup, matches)
    expect(out).toEqual(['p1'])
  })

  it('changes nothing for a node scoped to ALL with no filters', () => {
    const out = narrowByNode(['p1', 'p2'], { scopeType: 'ALL', scopeSlug: null, filterIds: [] }, lookup, matches)
    expect(out).toEqual(['p1', 'p2'])
  })
})
