import { describe, expect, it } from 'vitest'
import { compareFilters, compareNodes, compareProducts, hasComparison, resolveNotes } from '@/modules/product-discovery-tool/lib/compare'
import type { PdtOptionNote } from '@/modules/product-discovery-tool/lib/types'

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

describe('compareNodes', () => {
  it('leaves out a column nobody has written anything in', () => {
    const table = compareNodes([
      { slug: 'corner', label: 'Corner', explainer: 'Fits a corner.', bestFor: 'Small rooms', notFor: null, imageUrl: null },
      { slug: 'wave', label: 'Wave', explainer: 'Curved front.', bestFor: 'Long sittings', notFor: null, imageUrl: null },
    ])
    expect(table.headers).toEqual(['What it is', 'Best for'])
    expect(table.rows[0]!.cells).toEqual(['Fits a corner.', 'Small rooms'])
  })

  it('is empty when nobody has written a word', () => {
    const table = compareNodes([
      { slug: 'a', label: 'A', explainer: null, bestFor: '   ', notFor: null, imageUrl: null },
      { slug: 'b', label: 'B', explainer: null, bestFor: null, notFor: null, imageUrl: null },
    ])
    expect(table.headers).toEqual([])
    expect(hasComparison(table)).toBe(false)
  })
})

describe('compareFilters', () => {
  it('draws its cells from the notes, keyed by filter', () => {
    const notes = new Map([
      ['oak', note('oak', null, { bestFor: 'Warmth' })],
      ['glass', note('glass', null, { bestFor: 'Light', watchOut: 'Shows fingerprints' })],
    ])
    const table = compareFilters(
      [{ id: 'oak', label: 'Oak', swatch: null }, { id: 'glass', label: 'Glass', swatch: null }],
      notes,
    )
    expect(table.headers).toEqual(['Best for', 'Worth knowing'])
    expect(table.rows.map((row) => row.cells)).toEqual([['Warmth', ''], ['Light', 'Shows fingerprints']])
  })
})

describe('resolveNotes', () => {
  it('prefers a note scoped to the deepest node on the path', () => {
    const resolved = resolveNotes(
      [note('oak', null, { bestFor: 'global' }), note('oak', 'desks', { bestFor: 'on desks' }), note('oak', 'ha', { bestFor: 'on sit-stands' })],
      ['desks', 'ha'],
    )
    expect(resolved.get('oak')?.bestFor).toBe('on sit-stands')
  })

  it('ignores a note scoped to a node that is not on this path', () => {
    const resolved = resolveNotes([note('oak', null, { bestFor: 'global' }), note('oak', 'chairs', { bestFor: 'on chairs' })], ['desks'])
    expect(resolved.get('oak')?.bestFor).toBe('global')
  })

  it('has nothing for a filter nobody has written about', () => {
    expect(resolveNotes([], ['desks']).get('oak')).toBeUndefined()
  })
})

describe('compareProducts', () => {
  const questions = [
    { key: 'colour', label: 'Colour', filters: [{ id: 'oak', label: 'Oak' }, { id: 'white', label: 'White' }] },
    { key: 'frame', label: 'Frame', filters: [{ id: 'cant', label: 'Cantilever' }] },
  ]

  it('puts the products across the top and the questions down the side', () => {
    const table = compareProducts(
      [{ id: 'p1', name: 'Bench 1600' }, { id: 'p2', name: 'Bench 1800' }],
      questions,
      { p1: ['oak', 'cant'], p2: ['white'] },
    )
    expect(table.headers).toEqual(['Bench 1600', 'Bench 1800'])
    expect(table.rows.map((row) => [row.label, ...row.cells])).toEqual([
      ['Colour', 'Oak', 'White'],
      ['Frame', 'Cantilever', ''],
    ])
  })

  it('leaves out a feature none of the picked products answers', () => {
    const table = compareProducts([{ id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }], questions, { p1: [], p2: [] })
    expect(table.rows).toEqual([])
  })

  it('refuses to compare fewer than two', () => {
    expect(compareProducts([{ id: 'p1', name: 'A' }], questions, { p1: ['oak'] }).headers).toEqual([])
  })
})
