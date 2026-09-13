import { describe, expect, it } from 'vitest'
import { readDatasetWire } from '@/modules/product-discovery-tool/lib/dataset-wire'

// The one check the browser runs over the fetched answer set before the shell
// trusts it. The answers are checked for shape only, on purpose (see the file);
// the notes are printed, so they are checked field by field.

const answers = {
  matrix: { p1: ['oak'] },
  variations: { filterIds: [], combos: [], byProduct: {} },
  swaps: {},
  sortKeys: { p1: { name: 'Desk', price: 100, created: 0, popularity: 1 } },
  serverOrder: ['p1'],
  shelfMembers: {},
  groups: [],
}

const oak = {
  id: 'n1',
  filterId: 'oak',
  nodeId: null,
  explainer: 'Real veneer.',
  bestFor: 'Warmth',
  watchOut: null,
  imageUrl: null,
  learnMoreHref: null,
}

describe('readDatasetWire', () => {
  it('passes an answer set through with its notes', () => {
    const wire = readDatasetWire({ ...answers, notes: [oak] })
    expect(wire?.notes).toEqual([oak])
    expect(wire?.matrix).toEqual(answers.matrix)
    expect(wire?.serverOrder).toEqual(['p1'])
  })

  it('round-trips through JSON exactly as the route sends it', () => {
    const sent = { ...answers, notes: [oak, { ...oak, id: 'n2', nodeId: 'desks', explainer: null }] }
    expect(readDatasetWire(JSON.parse(JSON.stringify(sent)))).toEqual(sent)
  })

  it('refuses anything that is not an answer set', () => {
    expect(readDatasetWire(null)).toBeNull()
    expect(readDatasetWire('nope')).toBeNull()
    expect(readDatasetWire([])).toBeNull()
    expect(readDatasetWire({ error: 'Unknown flow.' })).toBeNull()
    expect(readDatasetWire({ ...answers, matrix: [] })).toBeNull()
    expect(readDatasetWire({ ...answers, serverOrder: {} })).toBeNull()
  })

  it('accepts a copy made before the notes travelled with it, with no guidance rather than no finder', () => {
    const wire = readDatasetWire(answers)
    expect(wire).not.toBeNull()
    expect(wire?.notes).toEqual([])
  })

  it('drops a malformed note on its own and keeps the rest', () => {
    const wire = readDatasetWire({
      ...answers,
      notes: [oak, { ...oak, id: 'bad', explainer: 42 }, { ...oak, id: 7 }, 'not a note', null],
    })
    expect(wire?.notes.map((note) => note.id)).toEqual(['n1'])
  })

  it('reads an absent text field as empty, the way the database spells it', () => {
    const wire = readDatasetWire({ ...answers, notes: [{ id: 'n1', filterId: 'oak' }] })
    expect(wire?.notes).toEqual([
      { id: 'n1', filterId: 'oak', nodeId: null, explainer: null, bestFor: null, watchOut: null, imageUrl: null, learnMoreHref: null },
    ])
  })
})
