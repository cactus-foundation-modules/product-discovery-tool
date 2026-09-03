import type { PdtFlow, PdtFlowScope } from '@/modules/product-discovery-tool/lib/types'
import { walkPath, type PdtTreeNode } from '@/modules/product-discovery-tool/lib/flow'

// Which products a point in the flow can reach, and which filters are true of
// it by construction. Pure over the loaded tree, so the rules below are the
// same rules on the server, in the shell and in the tests.

/** One shelf a scope names. FILTERS nodes contribute no shelf - they narrow by
 *  ticks - so they never appear here. */
export type PdtShelf = { type: Exclude<PdtFlowScope, 'ALL'>; slug: string }

export type PdtResolvedScope = {
  /** Every shelf named down the chain, outermost first.
   *
   *  They INTERSECT; they do not union. The effective set at
   *  desks/height-adjustable is the flow's own scope, narrowed by Desks',
   *  narrowed by Height adjustable's. A child naming a category outside its
   *  parent's is a configuration error, and the admin shows it as a live count
   *  of zero rather than quietly widening the page. */
  shelves: PdtShelf[]
  /** Every ancestor's applied filters, in order, deduplicated.
   *
   *  These are what the node IS, not ticks: the features step never offers them
   *  to be unticked. Picking "Height adjustable" as a type must not then ask
   *  "Height adjustable?" as a feature. */
  lockedFilterIds: string[]
}

/** Resolve a browse path to its effective shelf chain and locked filters.
 *
 *  A node with `scope_type = ALL` contributes nothing, which is what "the same
 *  products as my parent" means. */
export function resolveScope(
  flow: Pick<PdtFlow, 'scopeType' | 'scopeSlug'>,
  roots: readonly PdtTreeNode[],
  path: readonly string[],
): PdtResolvedScope & { nodes: PdtTreeNode[]; unknownAt: number | null } {
  const { nodes, unknownAt } = walkPath(roots, path)
  const shelves: PdtShelf[] = []
  const lockedFilterIds: string[] = []
  const seenFilters = new Set<string>()

  if (flow.scopeType !== 'ALL' && flow.scopeSlug) shelves.push({ type: flow.scopeType, slug: flow.scopeSlug })

  for (const node of nodes) {
    if (node.scopeType !== 'ALL' && node.scopeType !== 'FILTERS' && node.scopeSlug) {
      shelves.push({ type: node.scopeType, slug: node.scopeSlug })
    }
    for (const filterId of node.filterIds) {
      if (seenFilters.has(filterId)) continue
      seenFilters.add(filterId)
      lockedFilterIds.push(filterId)
    }
  }

  return { shelves, lockedFilterIds, nodes, unknownAt }
}

/** The products a node's own scope leaves, narrowing a set that has already had
 *  its ancestors applied.
 *
 *  Membership is handed in rather than queried, because the browse counts have
 *  to come from ONE pass: resolve the current level's product set once, then
 *  narrow it per child in memory. A step with five types is one product query,
 *  not five. */
export function narrowByNode(
  productIds: readonly string[],
  node: { scopeType: string; scopeSlug: string | null; filterIds: readonly string[] },
  shelfMembers: (shelf: PdtShelf) => ReadonlySet<string> | undefined,
  matchesFilters: (productId: string, filterIds: readonly string[]) => boolean,
): string[] {
  let out = [...productIds]
  if (node.scopeType !== 'ALL' && node.scopeType !== 'FILTERS' && node.scopeSlug) {
    const members = shelfMembers({ type: node.scopeType as PdtShelf['type'], slug: node.scopeSlug })
    // A shelf nothing knows about - a category deleted since the node was built
    // - leaves nothing rather than everything. The card is then hidden and the
    // Flow tab shows the warning; silently widening would put the whole
    // catalogue behind a type that no longer exists.
    out = members ? out.filter((id) => members.has(id)) : []
  }
  if (node.filterIds.length > 0) out = out.filter((id) => matchesFilters(id, node.filterIds))
  return out
}
