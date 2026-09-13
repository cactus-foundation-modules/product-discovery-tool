import { HARD_MAX_PER_PAGE, listTags } from '@/modules/shop/lib/db'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { buildCardContext, buildTagMaps } from '@/modules/shop/lib/card-template'
import { resolveCardFromPrices } from '@/modules/shop/lib/card-price'
import { listGroups } from '@/modules/filters-for-shop/lib/db/filters'
import { getProductFilterMatches, type FltCombo, type FltSwap } from '@/modules/filters-for-shop/lib/db/matching'
import { applyPriceBands, internVariations, offerGroups } from '@/modules/filters-for-shop/lib/grid-build'
import { packSwaps, type FltSwapIndex } from '@/modules/filters-for-shop/lib/swap-pack'
import { sortProductIds, sortValueFromParam, type FltSortKey, type FltSortValue } from '@/modules/filters-for-shop/lib/sort'
import type { FltPublicGroup, FltVariationIndex } from '@/modules/filters-for-shop/components/public/FilterShell'
import { getFlowBySlug } from '@/modules/product-discovery-tool/lib/db/flows'
import { listNodes } from '@/modules/product-discovery-tool/lib/db/nodes'
import { listNotesForFlow } from '@/modules/product-discovery-tool/lib/db/notes'
import { notesTheFlowCanShow } from '@/modules/product-discovery-tool/lib/notes-scope'
import { loadScopedProducts, loadShelfMembers, shelfKey } from '@/modules/product-discovery-tool/lib/catalogue'
import { paramForGroupSlug } from '@/modules/product-discovery-tool/lib/types'
import type { PdtShelf } from '@/modules/product-discovery-tool/lib/resolve'
import type { PdtNode } from '@/modules/product-discovery-tool/lib/types'
import type { PdtDatasetAnswers, PdtDatasetWire } from '@/modules/product-discovery-tool/lib/dataset-wire'

// The flow's whole answer set, in one place, because two callers need the same
// one and a second copy of this arithmetic would be a bug waiting to happen.
//
// WHAT THIS IS FOR. Discovery's one-pass bargain says the count on a browse card
// and the products behind it must come out of the same pass - see
// DiscoveryShell. That pass resolves every product the flow can reach, runs
// every filter over all of them, prices them and orders them. It is unavoidable
// on the server, and it is not the thing this file changes.
//
// What it changes is WHERE THE ANSWER GOES. Until now the whole set was
// serialised into the page: measured on the live homepage, 802 KB of flight
// payload for one block, of which 660 KB was this - a 214 KB match matrix, 241
// KB of swaps, 119 KB of variations and 71 KB of sort keys. Every visitor paid
// to parse and hydrate it, including the large majority who never touch the
// finder.
//
// So the block now renders the first step from server-computed counts and the
// browser fetches this separately, from a route the CDN can hold for everybody
// (app/api/public/dataset). One build an hour shared across shoppers, instead of
// one copy per page view. The shell keeps the server's cards on screen until it
// lands, so nothing moves under anybody.
//
// The block still calls this, for its own first paint - it has to pick the cards
// and count the tiles. Sharing the function is the point: the bytes the browser
// fetches and the bytes the server reasoned over are the same bytes, by
// construction, rather than by two people remembering to keep them the same.

/** Everything the wire form is built from, for the caller that also has to draw
 *  the first page of cards and count the first step's tiles. */
export type PdtDatasetBuild = {
  /** The flow the set was built for. The route reads its notes by it. */
  flowId: string
  /** The wire form of the answers. The route adds the notes on its way out -
   *  see buildDiscoveryDatasetWire - and the block, which only draws cards,
   *  never needs them. */
  answers: PdtDatasetAnswers
  /** The products in the flow's scope, in the shop's own order. */
  products: Awaited<ReturnType<typeof loadScopedProducts>>
  matrix: Map<string, string[]>
  combos: Map<string, FltCombo[]>
  swaps: Map<string, Map<string, FltSwap>>
  shelfMemberSets: Map<string, Set<string>>
  /** Product ids in the flow's default sort, which is the order the server's
   *  own first page is drawn in. */
  orderedIds: string[]
  nodes: PdtNode[]
  /** The flow's own shelf chain: what it can ever reach, before a single browse
   *  answer. Returned because the block binds it into the card loader, and
   *  working it out twice is how the two would eventually disagree. */
  flowShelves: PdtShelf[]
  /** The groups this flow's whole scope can offer, query-string keys resolved.
   *  Stays INLINE in the page rather than travelling with the deferred half: the
   *  questions panel needs it at first paint and it is a few kilobytes. */
  groups: FltPublicGroup[]
}

/**
 * Build the flow's answer set.
 *
 * `defaultSort` is the block's own field, so the route is told it rather than
 * guessing: the order the server drew page one in is part of the answer, and a
 * dataset ordered differently from the cards already on screen would rearrange
 * the grid the moment it landed.
 *
 * Returns null when the flow or its products are gone, which both callers treat
 * as "nothing to show" rather than as an error.
 */
export async function buildDiscoveryDataset(
  flowSlug: string,
  defaultSortParam: string,
): Promise<PdtDatasetBuild | null> {
  const flow = await getFlowBySlug(flowSlug)
  if (!flow) return null

  const [config, tags, nodes, groups] = await Promise.all([
    getShopConfigCached(),
    listTags(),
    listNodes(flow.id),
    listGroups(),
  ])

  const flowShelves: PdtShelf[] = flow.scopeType !== 'ALL' && flow.scopeSlug
    ? [{ type: flow.scopeType, slug: flow.scopeSlug }]
    : []

  const products = await loadScopedProducts(flowShelves, HARD_MAX_PER_PAGE)
  if (products.length === 0) return null

  const productIds = products.map((p) => p.id)
  const { tagById, tagsById } = buildTagMaps(tags)

  const [{ matrix, combos, swaps }, fromPrices, shelfMemberSets] = await Promise.all([
    getProductFilterMatches(productIds, groups),
    resolveCardFromPrices(productIds),
    // Every shelf any node in this flow names, resolved once. A node pointing at
    // a category deleted since comes back as an empty set, which is what makes
    // its card show a count of zero rather than behave as if it had no scope.
    loadShelfMembers(
      productIds,
      nodes
        .filter((node) => node.scopeType !== 'ALL' && node.scopeType !== 'FILTERS' && node.scopeSlug)
        .map((node) => ({ type: node.scopeType as PdtShelf['type'], slug: node.scopeSlug! })),
    ),
  ])

  // The figure the card would print, for every product in the flow.
  //
  // Read out of a context built with no pictures, no tags and no contributed
  // extras, because the price never depends on any of them - and that is what
  // buys the right to fetch pictures, tags and contributed extras for the
  // RENDERED cards only, back in the block.
  const priceOf = new Map<string, number>()
  for (const product of products) {
    const ctx = buildCardContext(product, [], tagById, [], config.currencySymbol, config, fromPrices.get(product.id) ?? null, undefined, tagsById)
    priceOf.set(product.id, Number(ctx.fromPrice ?? ctx.prices.now))
  }
  // PRICE groups, banded against the same figure the card prints, so a budget
  // question can never disagree with the number on screen.
  applyPriceBands(matrix, groups, priceOf)

  // The groups this flow can offer at all, culled by filters' own rule. The
  // shell culls again per node - a group can be worth asking about the whole
  // catalogue and pointless once the shopper has picked a type.
  const offered = offerGroups(groups, matrix, true, new Set()).map((group) => ({
    ...group,
    // `pick`, `sort` and `page` are this module's own. A group whose slug
    // collides with one of them is read and written under a `q-` prefix here
    // instead - filters' admin is not edited for this module's sake.
    slug: paramForGroupSlug(group.slug),
  }))

  const sortKeys: Record<string, FltSortKey> = {}
  for (const product of products) {
    const price = priceOf.get(product.id) ?? Number.NaN
    sortKeys[product.id] = {
      name: product.name,
      price: Number.isFinite(price) ? price : null,
      created: new Date(product.createdAt).getTime(),
      popularity: product.popularity,
    }
  }

  // The order the results start in, applied HERE and not only in the browser:
  // the server draws page one, and a grid that arrived in the shop's own order
  // and then re-sorted itself on hydration is a page that visibly rearranges
  // under the shopper.
  const defaultSort: FltSortValue | '' = sortValueFromParam(defaultSortParam || 'best-selling') ?? ''
  const orderedIds = defaultSort ? sortProductIds(productIds, sortKeys, defaultSort) : productIds

  // Interned for the wire, exactly as filters' grid does it: spelled out, a
  // whole-catalogue flow carries about a megabyte of repeated UUIDs.
  const orderIndex = new Map(orderedIds.map((id, at) => [id, at]))
  const shelfMembers: Record<string, number[]> = {}
  for (const [key, members] of shelfMemberSets) {
    shelfMembers[key] = [...members].map((id) => orderIndex.get(id) ?? -1).filter((at) => at >= 0)
  }

  return {
    flowId: flow.id,
    answers: {
      matrix: Object.fromEntries(matrix),
      variations: internVariations(combos),
      swaps: packSwaps(swaps),
      sortKeys,
      serverOrder: orderedIds,
      shelfMembers,
      groups: offered,
    },
    products,
    matrix,
    combos,
    swaps,
    shelfMemberSets,
    orderedIds,
    nodes,
    flowShelves,
    groups: offered,
  }
}

/**
 * The answer set exactly as the browser fetches it: the answers, plus the notes
 * this flow can show.
 *
 * The notes are read here rather than inside buildDiscoveryDataset because the
 * block's own streamed half calls that too, to draw its first page of cards, and
 * has no use for a single word of guidance. They are read after the build
 * because the filter half of their scope is the culled groups, which only exist
 * once the matrix does; it is one small read on a response the CDN holds
 * for an hour.
 */
export async function buildDiscoveryDatasetWire(
  flowSlug: string,
  defaultSortParam: string,
): Promise<PdtDatasetWire | null> {
  const built = await buildDiscoveryDataset(flowSlug, defaultSortParam)
  if (!built) return null
  const flowNotes = await listNotesForFlow(built.flowId)
  return {
    ...built.answers,
    notes: notesTheFlowCanShow(flowNotes, built.nodes.map((node) => node.id), built.answers.groups),
  }
}

/** The shelf key helper, re-exported so the route need not reach past this file
 *  for the one thing that spells a `shelfMembers` key. */
export { shelfKey }
