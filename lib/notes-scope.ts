import type { PdtOptionNote } from '@/modules/product-discovery-tool/lib/types'

// Which option notes travel with a flow's answer set.
//
// Every note on the site used to be written into every page the flow sat on:
// measured on the live homepage, 41 KB of flight payload for copy that is only
// ever read once a shopper opens an option's guidance, several clicks in. The
// notes now ride with the fetched answer set instead (lib/dataset.ts), and this
// is the rule for which of them a flow needs.
//
// A note can only be shown by the shell in two ways, and both go through
// resolveNotes (lib/compare.ts) keyed by filter id:
//
//  - on an option of the features step, or in that step's comparison table -
//    and the only options that step can offer are the filters of the groups the
//    answer set carries;
//  - as the winner for its filter, which a GLOBAL note can always be and a
//    node-scoped one only for a node on the shopper's current path, which is
//    always one of this flow's own nodes.
//
// So a note is kept when its filter is one the flow offers AND it is either
// global or scoped to one of the flow's nodes. Anything else can never reach a
// shopper through this flow. An override with every field blank is kept like
// any other: it still wins over the global note, and that is how an owner says
// "nothing to add here" for one node.

/** The groups the answer set offers, reduced to the one thing this rule reads. */
export type PdtOfferedFilterGroups = readonly { filters: readonly { id: string }[] }[]

/**
 * The notes a flow can display, in the order they were given.
 *
 * `flowNodeIds` is every node in the flow, not just the ones on a path: the
 * shopper can walk to any of them after the set has arrived.
 */
export function notesTheFlowCanShow(
  notes: readonly PdtOptionNote[],
  flowNodeIds: readonly string[],
  offeredGroups: PdtOfferedFilterGroups,
): PdtOptionNote[] {
  const offeredFilterIds = new Set<string>()
  for (const group of offeredGroups) {
    for (const filter of group.filters) offeredFilterIds.add(filter.id)
  }
  const nodeIds = new Set(flowNodeIds)
  return notes.filter(
    (note) => offeredFilterIds.has(note.filterId) && (note.nodeId === null || nodeIds.has(note.nodeId)),
  )
}
