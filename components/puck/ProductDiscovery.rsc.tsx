import { Suspense } from 'react'
import { connection } from 'next/server'
import { HARD_MAX_PER_PAGE } from '@/modules/shop/lib/db'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { getShopBreakpoints } from '@/modules/shop/lib/breakpoints'
import { resolveCardTemplate } from '@/modules/shop/lib/card-template'
import { buildGridCardItems } from '@/modules/shop/lib/grid-page'
import { shopCardCss } from '@/modules/shop/components/puck/parts/card-parts'
import { comboFilterIds, matchesSelection } from '@/modules/filters-for-shop/lib/filter-logic'
import { sortValueFromParam } from '@/modules/filters-for-shop/lib/sort'
import { getFlowBySlug } from '@/modules/product-discovery-tool/lib/db/flows'
import { listQuestions } from '@/modules/product-discovery-tool/lib/db/questions'
import { listNotes } from '@/modules/product-discovery-tool/lib/db/notes'
import { getSettings } from '@/modules/product-discovery-tool/lib/db/settings'
import { buildNodeTree, parsePickPath, type PdtTreeNode } from '@/modules/product-discovery-tool/lib/flow'
import { narrowByNode, resolveScope, type PdtShelf } from '@/modules/product-discovery-tool/lib/resolve'
import { renderDiscoveryCards } from '@/modules/product-discovery-tool/lib/discovery-cards'
import { loadDiscoveryCards } from '@/modules/product-discovery-tool/lib/cards-action'
import { buildDiscoveryDataset, shelfKey } from '@/modules/product-discovery-tool/lib/dataset'
import { DiscoveryShell } from '@/modules/product-discovery-tool/components/public/DiscoveryShell'
import { discoveryCss } from '@/modules/product-discovery-tool/components/public/discovery-css'
import { productDiscoveryPuckComponent, type ProductDiscoveryProps } from './ProductDiscovery'
import { SharedStyle } from '@/components/SharedStyle'
import { findRenditionUrls } from '@/lib/media/rendition-lookup'
import { THUMB_RENDITION_SUFFIX } from '@/lib/media/thumb-renditions'

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

// The flow is the heaviest thing on any page it sits on, and until now it was the
// heaviest thing BEFORE the first byte: one pass resolves five hundred products,
// runs every filter over them, prices them and orders them, and nothing else on the
// page could be sent until it finished. Measured on the live homepage, that was 7 to
// 8 seconds of blank browser on a render - against 0.45s for a page with no flow on
// it. Every other page on the site tracked the same line, so it was the work, not
// the network.
//
// It is behind a Suspense boundary now. The rest of the page - the header, the hero,
// the other blocks - flushes straight away, and the flow streams in when it is
// ready. The total work is unchanged and so is every byte of what arrives; what
// changes is that nobody stares at nothing while it happens.
//
// Deliberately NOT a fix to the one-pass bargain itself: the counts on a browse card
// and the products behind it are only the same answer because one pass produced both
// (see DiscoveryShell). Streaming keeps that promise exactly and costs nothing.
//
// The boundary has to be OUTSIDE the async work, which is why this is a plain
// function wrapping an async one - a Suspense inside the async component would
// already have awaited everything before React saw it.
export function ProductDiscoveryRsc(props: ProductDiscoveryProps) {
  return (
    <Suspense fallback={<DiscoveryFlowLoading />}>
      <ProductDiscoveryBody {...props} />
    </Suspense>
  )
}

// Holds the flow's place while it streams. A fixed minimum height rather than a
// cleverer skeleton: the flow's real height depends on the shopper's answers, so
// anything more specific would only be a different wrong shape, and reserving a
// plausible block keeps the content under it from jumping when the real thing
// lands. Tokens only, no client component, nothing to load.
function DiscoveryFlowLoading() {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      style={{
        minHeight: '32rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--color-text-muted)',
        background: 'var(--color-bg-subtle)',
        borderRadius: 'var(--border-radius, 6px)',
      }}
    >
      Finding your options…
    </div>
  )
}

async function ProductDiscoveryBody(props: ProductDiscoveryProps) {
  await connection()
  const slug = (props.flowSlug ?? '').trim()
  if (!slug) return null
  const flow = await getFlowBySlug(slug)
  if (!flow) return null

  const columns = props.columns ?? 3
  const pageSize = Math.max(1, Math.min(100, Math.floor(flow.resultsPerPage) || 24))

  // The flow's whole answer set, built by the same function the dataset route
  // calls - so the numbers the server reasons over here and the numbers the
  // browser fetches are the same numbers by construction. See lib/dataset.ts.
  //
  // It loads the flow's nodes, groups and tags on the way through, so this block
  // takes them from the build rather than asking for them a second time.
  const [built, config, bp, questions, notes, settings, template] = await Promise.all([
    buildDiscoveryDataset(slug, props.defaultSort || 'best-selling'),
    getShopConfigCached(),
    getShopBreakpoints(),
    listQuestions(flow.id),
    listNotes(),
    getSettings(),
    resolveCardTemplate(props.layoutRef),
  ])
  if (!built) {
    return <p style={{ color: 'var(--color-text-muted)' }}>There are no products to guide anyone through yet.</p>
  }
  const { products, matrix, combos, shelfMemberSets, orderedIds, nodes, flowShelves, groups: offered } = built

  // The browse pictures, at the size they are actually drawn.
  //
  // A choice tile shows its picture at 216px square and was being handed the
  // original: measured on the live homepage, five of them came to 988 KB - one was
  // 1920x1920 - which made them the heaviest thing left on the page by a distance.
  // One batched lookup for the whole flow, from the sharp-free half of the media
  // library, and a node whose picture has no small copy keeps the original.
  const nodeImages = nodes.map((n) => n.imageUrl).filter((u): u is string => !!u)
  const nodeThumbs = nodeImages.length
    ? await findRenditionUrls(nodeImages, THUMB_RENDITION_SUFFIX).catch(() => new Map<string, string>())
    : new Map<string, string>()
  const drawnNodes = nodeThumbs.size
    ? nodes.map((n) => (n.imageUrl && nodeThumbs.has(n.imageUrl) ? { ...n, imageUrl: nodeThumbs.get(n.imageUrl)! } : n))
    : nodes

  const defaultSort = sortValueFromParam(props.defaultSort || 'best-selling') ?? ''

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

  // The count behind every browse tile, so the FIRST step is complete at first
  // paint while the answer set is still on its way.
  //
  // Every node in the flow rather than just the step being drawn: a node's count
  // is measured against its own ancestors, which is well defined for all of
  // them, and computing the lot means a shopper deep-linked to step three
  // (`?pick=`) gets their tiles counted too. It is one integer per node - about
  // seventy on the live flow - against the 660 KB this replaces.
  //
  // Measured over the same matrix the cards came out of, which is the one-pass
  // bargain kept: the number on a tile and the products behind it are the same
  // answer, not two answers that agree.
  const initialCounts: Record<string, number> = {}
  const countFrom = (chain: readonly PdtTreeNode[], node: PdtTreeNode) => {
    let ids: string[] = orderedIds
    for (const step of chain) ids = narrowByNode(ids, step, shelfLookup, matchesAll)
    return narrowByNode(ids, node, shelfLookup, matchesAll).length
  }
  const walkCounts = (siblings: readonly PdtTreeNode[], chain: PdtTreeNode[]) => {
    for (const node of siblings) {
      initialCounts[node.id] = countFrom(chain, node)
      if (node.children.length > 0) walkCounts(node.children, [...chain, node])
    }
  }
  walkCounts(roots, [])

  // The dataset's own address. `sort` rides along because `serverOrder` has to
  // match the order the cards below were drawn in; the CDN keys on the whole
  // query string, so two flows, or one flow ordered two ways, cache separately
  // and correctly.
  const datasetHref = `/api/m/product-discovery-tool/public/dataset?flow=${encodeURIComponent(slug)}&sort=${encodeURIComponent(props.defaultSort || 'best-selling')}`

  const productById = new Map(products.map((product) => [product.id, product]))
  const items = await buildGridCardItems(renderIds.map((id) => productById.get(id)).filter((p): p is (typeof products)[number] => p != null))
  // The opening row loads its pictures eagerly; the rest of the shelf stays lazy.
  const cards = await renderDiscoveryCards(template, items, config.productUrlStyle, columns)

  return (
    <>
      <SharedStyle id="shop-cards" css={shopCardCss(bp)} />
      <SharedStyle id="discovery" css={discoveryCss(bp)} />
      <DiscoveryShell
        flowSlug={flow.slug}
        allowSkip={flow.allowSkip}
        showPrices={flow.showPrices}
        finishCta={flow.finishCtaLabel && flow.finishCtaHref ? { label: flow.finishCtaLabel, href: flow.finishCtaHref } : null}
        headings={{ first: flow.firstStepHeading, later: flow.laterStepHeading, features: flow.featuresHeading }}
        settings={settings}
        nodes={drawnNodes}
        questions={questions}
        notes={notes}
        groups={offered}
        // The answer set is FETCHED, not inlined. This is the whole of what
        // used to be 660 KB of flight payload on every view of this page: the
        // match matrix, the swaps, the interned combinations and the sort keys.
        // See lib/dataset.ts for why, and app/api/public/dataset for where.
        datasetHref={datasetHref}
        // What the first step needs in the meantime, and nothing more.
        initialCounts={initialCounts}
        // The same pass's answer for the state the address describes, so the
        // toolbar and the empty state never contradict the cards below them.
        initialMatchCount={eligible.length}
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
