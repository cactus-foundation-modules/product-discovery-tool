import { connection } from 'next/server'
import { HARD_MAX_PER_PAGE, listTags } from '@/modules/shop/lib/db'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { getShopBreakpoints } from '@/modules/shop/lib/breakpoints'
import { resolveCardTemplate, buildCardContext, buildTagMaps } from '@/modules/shop/lib/card-template'
import { resolveCardFromPrices } from '@/modules/shop/lib/card-price'
import { buildGridCardItems } from '@/modules/shop/lib/grid-page'
import { shopCardCss } from '@/modules/shop/components/puck/parts/card-parts'
import { listGroups } from '@/modules/filters-for-shop/lib/db/filters'
import { getProductFilterMatches } from '@/modules/filters-for-shop/lib/db/matching'
import { applyPriceBands, internVariations, offerGroups } from '@/modules/filters-for-shop/lib/grid-build'
import { packSwaps } from '@/modules/filters-for-shop/lib/swap-pack'
import { comboFilterIds, matchesSelection } from '@/modules/filters-for-shop/lib/filter-logic'
import { sortProductIds, sortValueFromParam, type FltSortKey } from '@/modules/filters-for-shop/lib/sort'
import { getFlowBySlug } from '@/modules/product-discovery-tool/lib/db/flows'
import { listNodes } from '@/modules/product-discovery-tool/lib/db/nodes'
import { listQuestions } from '@/modules/product-discovery-tool/lib/db/questions'
import { listNotes } from '@/modules/product-discovery-tool/lib/db/notes'
import { getSettings } from '@/modules/product-discovery-tool/lib/db/settings'
import { loadScopedProducts, loadShelfMembers, shelfKey } from '@/modules/product-discovery-tool/lib/catalogue'
import { buildNodeTree, parsePickPath } from '@/modules/product-discovery-tool/lib/flow'
import { narrowByNode, resolveScope, type PdtShelf } from '@/modules/product-discovery-tool/lib/resolve'
import { paramForGroupSlug } from '@/modules/product-discovery-tool/lib/types'
import { renderDiscoveryCards } from '@/modules/product-discovery-tool/lib/discovery-cards'
import { loadDiscoveryCards } from '@/modules/product-discovery-tool/lib/cards-action'
import { DiscoveryShell } from '@/modules/product-discovery-tool/components/public/DiscoveryShell'
import { discoveryCss } from '@/modules/product-discovery-tool/components/public/discovery-css'
import { productDiscoveryPuckComponent, type ProductDiscoveryProps } from './ProductDiscovery'

// Server (RSC) half of Discovery: Guided Flow.
//
// One pass resolves the whole flow: which products it can ever reach, which
// filters each of them matches, which shelves each browse node stands for, and
// the first page of cards for whatever the address asked for. Everything after
// that happens in the browser - see DiscoveryShell for why the counts and the
// products have to come out of the same pass.
//
// The expensive halves are deliberately split, exactly as filters' grid splits
// them: every product's PRICE and sort key is resolved here (the bands and the
// ordering need them for products no page has drawn yet), but a card is only
// STAMPED for the window being rendered. That is where the megabytes are.

export async function ProductDiscoveryRsc(props: ProductDiscoveryProps) {
  await connection()
  const slug = (props.flowSlug ?? '').trim()
  if (!slug) return null
  const flow = await getFlowBySlug(slug)
  if (!flow) return null

  const columns = props.columns ?? 3
  const pageSize = Math.max(1, Math.min(100, Math.floor(flow.resultsPerPage) || 24))

  const [config, bp, tags, nodes, questions, notes, settings, groups, template] = await Promise.all([
    getShopConfigCached(),
    getShopBreakpoints(),
    listTags(),
    listNodes(flow.id),
    listQuestions(flow.id),
    listNotes(),
    getSettings(),
    listGroups(),
    resolveCardTemplate(props.layoutRef),
  ])

  // The flow's own shelf chain: what it can ever reach, before a single browse
  // answer. The nodes narrow this in the browser, over the set resolved here.
  const flowShelves: PdtShelf[] = flow.scopeType !== 'ALL' && flow.scopeSlug
    ? [{ type: flow.scopeType, slug: flow.scopeSlug }]
    : []

  const products = await loadScopedProducts(flowShelves, HARD_MAX_PER_PAGE)
  if (products.length === 0) {
    return <p style={{ color: 'var(--color-text-muted)' }}>There are no products to guide anyone through yet.</p>
  }

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
  // RENDERED cards only, further down.
  const priceOf = new Map<string, number>()
  for (const product of products) {
    const ctx = buildCardContext(product, [], tagById, [], config.currencySymbol, config, fromPrices.get(product.id) ?? null, undefined, tagsById)
    priceOf.set(product.id, Number(ctx.fromPrice ?? ctx.prices.now))
  }
  // PRICE groups, banded against the same figure the card prints, so a budget
  // question can never disagree with the number on screen. "What's your budget?"
  // comes free, with bands the owner has already drawn in the filters admin.
  applyPriceBands(matrix, groups, priceOf)

  // The groups this flow can offer at all, culled by filters' own rule. The
  // shell culls again per node - a group can be worth asking about the whole
  // catalogue and pointless once the shopper has picked a type.
  const offered = offerGroups(groups, matrix, true, new Set()).map((group) => ({
    ...group,
    // `pick`, `sort` and `page` are this module's own. A group whose slug
    // collides with one of them is read and written under a `q-` prefix here
    // instead - filters' admin is not edited for this module's sake - and the
    // Questions tab says so.
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
  // under the shopper. Everything downstream - the cards drawn, the shelf
  // membership interning, the shell's own `serverOrder` - reads this one array,
  // so there is only ever one answer to "what order are these in".
  const defaultSort = sortValueFromParam(props.defaultSort || 'best-selling') ?? ''
  const orderedIds = defaultSort ? sortProductIds(productIds, sortKeys, defaultSort) : productIds

  // What the SERVER should draw cards for: the first page of the state the
  // address describes, worked out with the shell's own rules over the shell's
  // own data, so the first paint is the linked-to step rather than a page of
  // whatever happened to be first.
  const roots = buildNodeTree(nodes)
  const path = parsePickPath(props.pick)
  const resolved = resolveScope({ scopeType: 'ALL', scopeSlug: null }, roots, path)
  const shelfLookup = (shelf: PdtShelf) => shelfMemberSets.get(shelfKey(shelf))
  const matchesAll = (productId: string, filterIds: readonly string[]) => {
    const matched = matrix.get(productId) ?? []
    return filterIds.every((id) => matched.includes(id))
  }
  let eligible: string[] = orderedIds
  for (const node of resolved.nodes) eligible = narrowByNode(eligible, node, shelfLookup, matchesAll)
  const renderIds = eligible
    .filter((id) => matchesSelection(matrix.get(id) ?? [], new Map(), comboFilterIds(combos.get(id))))
    .slice(0, pageSize)

  const productById = new Map(products.map((product) => [product.id, product]))
  const items = await buildGridCardItems(renderIds.map((id) => productById.get(id)).filter((p): p is (typeof products)[number] => p != null))
  // The opening row loads its pictures eagerly; the rest of the shelf stays lazy.
  const cards = await renderDiscoveryCards(template, items, config.productUrlStyle, columns)

  // Interned for the wire, exactly as filters' grid does it: spelled out, a
  // whole-catalogue flow carries about a megabyte of repeated UUIDs.
  const variationIndex = internVariations(combos)
  const swapIndex = packSwaps(swaps)
  const orderIndex = new Map(orderedIds.map((id, at) => [id, at]))
  const shelfMembers: Record<string, number[]> = {}
  for (const [key, members] of shelfMemberSets) {
    shelfMembers[key] = [...members].map((id) => orderIndex.get(id) ?? -1).filter((at) => at >= 0)
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: shopCardCss(bp) + discoveryCss(bp) }} />
      <DiscoveryShell
        flowSlug={flow.slug}
        allowSkip={flow.allowSkip}
        showPrices={flow.showPrices}
        finishCta={flow.finishCtaLabel && flow.finishCtaHref ? { label: flow.finishCtaLabel, href: flow.finishCtaHref } : null}
        headings={{ first: flow.firstStepHeading, later: flow.laterStepHeading, features: flow.featuresHeading }}
        settings={settings}
        nodes={nodes}
        questions={questions}
        notes={notes}
        groups={offered}
        matrix={Object.fromEntries(matrix)}
        variations={variationIndex}
        swaps={swapIndex}
        sortKeys={sortKeys}
        serverOrder={orderedIds}
        shelfMembers={shelfMembers}
        columns={columns}
        pageSize={pageSize}
        questionsPosition={props.questionsPosition === 'top' ? 'top' : 'left'}
        autoOpenQuestions={props.autoOpenQuestions === 'yes'}
        drawerOptions={props.drawerOptions === 'one-per-line' ? 'one-per-line' : 'side-by-side'}
        // Default HIDDEN, so a block saved before this field existed gets the
        // plainer first step rather than two buttons nobody asked for. A flow
        // whose first step is a real narrowing question turns them back on.
        firstStepFoot={props.firstStepFoot === 'show'}
        barButton={{
          bg: (props.barButtonBg ?? '').trim(),
          text: (props.barButtonText ?? '').trim(),
          hoverBg: (props.barButtonHoverBg ?? '').trim(),
          hoverText: (props.barButtonHoverText ?? '').trim(),
        }}
        defaultSort={defaultSort}
        tabletBp={bp.tabletBp}
        initialPick={path.join('/')}
        renderedIds={renderIds}
        // Bound here, so what the browser may ask for is a list of ids off a
        // list the server drew up. The server function re-runs the flow's own
        // authorising query regardless.
        loadCards={loadDiscoveryCards.bind(null, {
          shelves: flowShelves,
          fetchCount: HARD_MAX_PER_PAGE,
          layoutRef: props.layoutRef,
          maxCards: pageSize,
        })}
      >
        {cards}
      </DiscoveryShell>
    </>
  )
}

export const productDiscoveryPuckRscComponent = {
  ...productDiscoveryPuckComponent,
  render: ProductDiscoveryRsc,
}
