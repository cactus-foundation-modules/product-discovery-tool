import { describe, expect, it } from 'vitest'
import type { FltMatrixEntry, FltSelection } from '@/modules/filters-for-shop/lib/filter-logic'
import { relaxations } from '@/modules/product-discovery-tool/lib/recovery'

// Three products: an oak desk, a glass desk and an oak chair. Nothing is both
// glass AND a chair, which is the dead end these offers dig a way out of.
const ENTRIES: FltMatrixEntry[] = [
  ['p1', ['oak', 'desk']],
  ['p2', ['glass', 'desk']],
  ['p3', ['oak', 'chair']],
]

const selection = (pairs: [string, string[]][]): FltSelection => new Map(pairs.map(([g, f]) => [g, new Set(f)]))

describe('relaxations', () => {
  it('offers the single answers worth dropping', () => {
    const offers = relaxations(selection([['material', ['glass']], ['type', ['chair']]]), ENTRIES)
    // Dropping "glass" leaves the one chair; dropping "chair" leaves the one
    // glass desk. Both leave one, and the tie breaks on the filter id so the
    // list cannot shuffle itself between renders.
    expect(offers.map((offer) => [offer.filterId, offer.count])).toEqual([['chair', 1], ['glass', 1]])
  })

  it('puts the most productive offer first', () => {
    const offers = relaxations(selection([['material', ['glass', 'oak']], ['type', ['chair']]]), ENTRIES)
    // Dropping the type leaves all three; dropping "glass" leaves the oak chair;
    // dropping "oak" leaves nothing at all, so that one is never offered.
    expect(offers.map((offer) => [offer.filterId, offer.count])).toEqual([['chair', 3], ['glass', 1]])
  })

  it('never offers something that leads nowhere either', () => {
    const offers = relaxations(selection([['material', ['unicorn']], ['type', ['chair']]]), ENTRIES)
    // Dropping "chair" still leaves "unicorn", which nothing matches - so that
    // offer is not made. Dropping "unicorn" leaves the one chair.
    expect(offers.map((offer) => offer.filterId)).toEqual(['unicorn'])
  })

  it('offers nothing at all when no single drop helps', () => {
    // Two answers, neither of which anything matches: dropping either leaves the
    // other, and the other still finds nothing. The shell then says so plainly
    // rather than pretending there is a way out.
    const offers = relaxations(selection([['a', ['nope']], ['b', ['also-nope']]]), ENTRIES)
    expect(offers).toEqual([])
  })

  it('offers the whole remaining set when the only answer is dropped', () => {
    const offers = relaxations(selection([['material', ['unicorn']]]), ENTRIES)
    expect(offers).toEqual([{ groupId: 'material', filterId: 'unicorn', count: 3 }])
  })

  it('offers nothing when nothing is selected', () => {
    expect(relaxations(new Map(), ENTRIES)).toEqual([])
  })
})
