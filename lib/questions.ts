import type { PdtImportance, PdtQuestion } from '@/modules/product-discovery-tool/lib/types'

// Which filter groups the features step asks, in what order, with what wording.
//
// Curation is optional by design: a group with no row still gets asked, in the
// filters module's own order, after the curated ones. A shop that installs this
// module and writes nothing still has a working features step, and the
// Questions tab is where the owner improves it rather than where they make it
// work at all.

/** The minimum a group has to look like to be ordered. FltPublicGroup satisfies it. */
export type PdtOrderableGroup = { id: string; name: string; slug: string }

export type PdtAskedQuestion<G extends PdtOrderableGroup> = {
  group: G
  /** The wording on screen: the override where one was written, else the
   *  group's own name. */
  heading: string
  explainer: string | null
  importance: PdtImportance
  multi: boolean
}

/** The most specific curation row for a group at a point in the tree: a row
 *  scoped to one of the nodes on the current path beats the flow-wide one, and
 *  the deepest such node wins. */
export function pickQuestionRow(
  rows: readonly PdtQuestion[],
  groupId: string,
  nodeIdsDeepestLast: readonly string[],
): PdtQuestion | null {
  const forGroup = rows.filter((r) => r.groupId === groupId)
  for (let at = nodeIdsDeepestLast.length - 1; at >= 0; at--) {
    const scoped = forGroup.find((r) => r.nodeId === nodeIdsDeepestLast[at])
    if (scoped) return scoped
  }
  return forGroup.find((r) => r.nodeId === null) ?? null
}

/**
 * The questions to ask, in order.
 *
 * Curated rows lead, in their own `position` order; everything else follows in
 * the filters module's order. Hidden rows are dropped, and so is any group the
 * node has already answered by BEING it - a shopper who picked "Height
 * adjustable" as their type must not then be asked "Height adjustable?" as a
 * feature.
 */
export function askedQuestions<G extends PdtOrderableGroup>(
  groups: readonly G[],
  rows: readonly PdtQuestion[],
  nodeIdsDeepestLast: readonly string[],
  lockedGroupIds: ReadonlySet<string>,
): PdtAskedQuestion<G>[] {
  const curated: { at: number; q: PdtAskedQuestion<G> }[] = []
  const rest: PdtAskedQuestion<G>[] = []

  for (const group of groups) {
    if (lockedGroupIds.has(group.id)) continue
    const row = pickQuestionRow(rows, group.id, nodeIdsDeepestLast)
    if (row?.hidden) continue
    const asked: PdtAskedQuestion<G> = {
      group,
      heading: row?.heading?.trim() || group.name,
      explainer: row?.explainer?.trim() || null,
      importance: row?.importance ?? 'PRIMARY',
      multi: row?.multi ?? true,
    }
    if (row) curated.push({ at: row.position, q: asked })
    else rest.push(asked)
  }

  curated.sort((a, b) => a.at - b.at)
  return [...curated.map((c) => c.q), ...rest]
}
