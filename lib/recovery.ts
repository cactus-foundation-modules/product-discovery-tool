import { matchesSelection, type FltMatrixEntry, type FltSelection } from '@/modules/filters-for-shop/lib/filter-logic'

// Never a dead end.
//
// A guided flow that answers five honest questions with "nothing matches" has
// wasted the shopper's time and taught them nothing. When a combination reaches
// zero - a deep link, or an answer that was fine until an earlier chip was
// removed - these are the nearest sets: for each single answer, what dropping it
// would leave, best first.
//
// Pure, and over filters' own predicate rather than a second one: the counts an
// offer promises have to be the counts the shell then shows.

export type PdtRelaxation = {
  groupId: string
  filterId: string
  /** How many products would be left with this one answer dropped. Always > 0 -
   *  an offer that leads nowhere is not an offer. */
  count: number
}

/**
 * The single answers worth dropping, most productive first.
 *
 * One answer at a time on purpose. "Here are 6 without Glass top" is something
 * a shopper can act on; "here are 40 without three of your five answers" is a
 * different question being answered instead of theirs. If no single drop helps,
 * nothing is offered and the shell says so plainly.
 */
export function relaxations(selection: FltSelection, entries: readonly FltMatrixEntry[]): PdtRelaxation[] {
  const out: PdtRelaxation[] = []
  for (const [groupId, filterIds] of selection) {
    for (const filterId of filterIds) {
      const trial: FltSelection = new Map(selection)
      const remaining = new Set(filterIds)
      remaining.delete(filterId)
      if (remaining.size === 0) trial.delete(groupId)
      else trial.set(groupId, remaining)
      let count = 0
      for (const [, matched, combos] of entries) {
        if (matchesSelection(matched, trial, combos)) count++
      }
      if (count > 0) out.push({ groupId, filterId, count })
    }
  }
  // Most products first, and the tie broken by filter id so two equally good
  // offers do not swap places between renders.
  out.sort((a, b) => b.count - a.count || a.filterId.localeCompare(b.filterId))
  return out
}
