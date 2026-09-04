import { NextResponse } from 'next/server'
import { requireShopUser } from '@/modules/shop/lib/access'
import { HARD_MAX_PER_PAGE } from '@/modules/shop/lib/db'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { listGroups } from '@/modules/filters-for-shop/lib/db/filters'
import { getProductFilterMatches } from '@/modules/filters-for-shop/lib/db/matching'
import { getFlow } from '@/modules/product-discovery-tool/lib/db/flows'
import { listNodes } from '@/modules/product-discovery-tool/lib/db/nodes'
import { loadScopedProducts, loadShelfMembers, shelfExists, shelfKey } from '@/modules/product-discovery-tool/lib/catalogue'
import { buildNodeTree, type PdtTreeNode } from '@/modules/product-discovery-tool/lib/flow'
import { narrowByNode, type PdtShelf } from '@/modules/product-discovery-tool/lib/resolve'

// The live product count behind every node in a flow, so a node that catches
// nothing is obvious while it is being built rather than after it ships.
//
// One product query for the whole tree, narrowed per node in memory - the same
// pass the storefront makes, for the same reason: a count that is not the
// products behind it is worse than no count.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.products', { allowAccess: true })
  if (gate.error) return gate.error
  const flow = await getFlow((await params).id)
  if (!flow) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const [config, nodes, groups] = await Promise.all([getShopConfigCached(), listNodes(flow.id), listGroups()])
  const flowShelves: PdtShelf[] = flow.scopeType !== 'ALL' && flow.scopeSlug ? [{ type: flow.scopeType, slug: flow.scopeSlug }] : []
  const products = await loadScopedProducts(flowShelves, HARD_MAX_PER_PAGE)
  const productIds = products.map((p) => p.id)

  const [{ matrix }, memberSets] = await Promise.all([
    getProductFilterMatches(productIds, groups),
    loadShelfMembers(
      productIds,
      nodes
        .filter((node) => node.scopeType !== 'ALL' && node.scopeType !== 'FILTERS' && node.scopeSlug)
        .map((node) => ({ type: node.scopeType as PdtShelf['type'], slug: node.scopeSlug! })),
    ),
  ])

  const shelfLookup = (shelf: PdtShelf) => memberSets.get(shelfKey(shelf))
  const matchesAll = (productId: string, filterIds: readonly string[]) => {
    const matched = matrix.get(productId) ?? []
    return filterIds.every((id) => matched.includes(id))
  }

  const counts: Record<string, number> = {}
  const walk = (children: PdtTreeNode[], inherited: string[]) => {
    for (const node of children) {
      const here = narrowByNode(inherited, node, shelfLookup, matchesAll)
      counts[node.id] = here.length
      walk(node.children, here)
    }
  }
  walk(buildNodeTree(nodes), productIds)

  // A node pointing at a category, collection or tag that has been deleted since
  // is flagged in its own right: a count of zero can mean an empty shelf, and
  // the owner needs to know which of the two they are looking at.
  const missingScope: string[] = []
  for (const node of nodes) {
    if (!(await shelfExists(node.scopeType, node.scopeSlug))) missingScope.push(node.id)
  }
  const flowScopeMissing = !(await shelfExists(flow.scopeType, flow.scopeSlug))

  return NextResponse.json({ total: productIds.length, counts, missingScope, flowScopeMissing })
}
