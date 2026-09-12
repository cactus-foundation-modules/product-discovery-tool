import type { FltSwapIndex } from '@/modules/filters-for-shop/lib/swap-pack'
import type { FltSortKey } from '@/modules/filters-for-shop/lib/sort'
import type { FltVariationIndex } from '@/modules/filters-for-shop/components/public/FilterShell'

// Types only, in a file of their own, for exactly the reason lib/cards-binding.ts
// gives: the client shell names this shape, and a client file importing anything
// that reaches prisma fails the build-time client graph check
// (scripts/check-client-graph.mjs). lib/dataset.ts - which does the building, and
// does reach prisma - imports the shape from here rather than declaring it.

/**
 * The flow's answer set as it travels to the browser.
 *
 * Fetched from app/api/public/dataset rather than serialised into the page: on
 * the live homepage that was 660 KB of flight payload per view for a block most
 * visitors never touch. See lib/dataset.ts for the whole reasoning.
 */
export type PdtDatasetWire = {
  /** product id -> the filter ids it matches. */
  matrix: Record<string, string[]>
  variations: FltVariationIndex
  swaps: FltSwapIndex
  sortKeys: Record<string, FltSortKey>
  /** The shop's own order of every product in the flow's scope. The index into
   *  this array is how shelf membership is spelled on the wire. */
  serverOrder: string[]
  /** shelfKey -> indexes into serverOrder. Interned because a catalogue-wide
   *  flow with thirty nodes would otherwise carry the same product ids over and
   *  over. */
  shelfMembers: Record<string, number[]>
}
