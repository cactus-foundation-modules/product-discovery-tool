import { describe, expect, it } from 'vitest'
import {
  answerAt,
  buildNodeTree,
  buildSteps,
  clearFrom,
  currentStepIndex,
  formatPickPath,
  parsePickPath,
  walkPath,
  MAX_PICK_DEPTH,
} from '@/modules/product-discovery-tool/lib/flow'
import type { PdtNode } from '@/modules/product-discovery-tool/lib/types'

function node(id: string, slug: string, parentId: string | null, position = 0): PdtNode {
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
    scopeType: 'ALL',
    scopeSlug: null,
    position,
    filterIds: [],
  }
}

// Desks -> Rectangular, Height adjustable; Chairs -> (nothing); Accessories.
const NODES: PdtNode[] = [
  node('desks', 'desks', null, 0),
  node('rect', 'rectangular', 'desks', 0),
  node('ha', 'height-adjustable', 'desks', 1),
  node('chairs', 'chairs', null, 1),
  node('acc', 'accessories', null, 2),
]

describe('parsePickPath', () => {
  it('drops empty segments rather than refusing a mangled link', () => {
    expect(parsePickPath('desks//height-adjustable/')).toEqual(['desks', 'height-adjustable'])
  })

  it('is empty for a missing parameter', () => {
    expect(parsePickPath(null)).toEqual([])
    expect(parsePickPath('')).toEqual([])
  })

  it('caps depth, so a forged path cannot make the resolver walk forever', () => {
    const long = Array.from({ length: MAX_PICK_DEPTH + 5 }, (_, i) => `s${i}`).join('/')
    expect(parsePickPath(long)).toHaveLength(MAX_PICK_DEPTH)
  })

  it('round-trips through formatPickPath', () => {
    expect(formatPickPath(parsePickPath('desks/height-adjustable'))).toBe('desks/height-adjustable')
  })
})

describe('buildNodeTree', () => {
  it('nests children under their parents in position order', () => {
    const roots = buildNodeTree(NODES)
    expect(roots.map((r) => r.slug)).toEqual(['desks', 'chairs', 'accessories'])
    expect(roots[0]!.children.map((c) => c.slug)).toEqual(['rectangular', 'height-adjustable'])
  })

  it('drops an orphan rather than promoting it to the top level', () => {
    const roots = buildNodeTree([...NODES, node('ghost', 'ghost', 'gone')])
    expect(roots.map((r) => r.slug)).not.toContain('ghost')
  })
})

describe('walkPath', () => {
  it('reports the first segment that names nothing', () => {
    const { nodes, unknownAt } = walkPath(buildNodeTree(NODES), ['desks', 'nope'])
    expect(nodes.map((n) => n.slug)).toEqual(['desks'])
    expect(unknownAt).toBe(1)
  })

  it('will not match a child at the top level', () => {
    const { nodes, unknownAt } = walkPath(buildNodeTree(NODES), ['rectangular'])
    expect(nodes).toEqual([])
    expect(unknownAt).toBe(0)
  })
})

describe('buildSteps', () => {
  it('gives a branch with sub-types three steps', () => {
    const steps = buildSteps(buildNodeTree(NODES), ['desks'])
    expect(steps.map((s) => s.kind)).toEqual(['browse', 'browse', 'features'])
  })

  it('gives a branch with none only two - which is correct, not a bug', () => {
    const steps = buildSteps(buildNodeTree(NODES), ['chairs'])
    expect(steps.map((s) => s.kind)).toEqual(['browse', 'features'])
  })

  it('offers the root level before anything is answered', () => {
    const steps = buildSteps(buildNodeTree(NODES), [])
    expect(steps).toHaveLength(2)
    const first = steps[0]!
    expect(first.kind === 'browse' && first.options.map((o) => o.slug)).toEqual(['desks', 'chairs', 'accessories'])
  })

  it('has only the features step when the tree is empty', () => {
    expect(buildSteps([], []).map((s) => s.kind)).toEqual(['features'])
  })
})

describe('currentStepIndex', () => {
  it('is the first unanswered browse step', () => {
    const steps = buildSteps(buildNodeTree(NODES), ['desks'])
    expect(currentStepIndex(steps, ['desks'], new Set())).toBe(1)
  })

  it('treats a skipped step as answered and moves on', () => {
    const steps = buildSteps(buildNodeTree(NODES), [])
    expect(currentStepIndex(steps, [], new Set([0]))).toBe(1)
  })

  it('is the features step once every browse step has an answer', () => {
    const steps = buildSteps(buildNodeTree(NODES), ['desks', 'rectangular'])
    expect(currentStepIndex(steps, ['desks', 'rectangular'], new Set())).toBe(2)
  })
})

describe('answerAt and clearFrom', () => {
  it('clears every deeper answer when an earlier one changes', () => {
    expect(answerAt(['desks', 'rectangular'], 0, 'chairs')).toEqual(['chairs'])
  })

  it('removes an answer and everything below it', () => {
    expect(clearFrom(['desks', 'rectangular'], 1)).toEqual(['desks'])
    expect(clearFrom(['desks', 'rectangular'], 0)).toEqual([])
  })
})
