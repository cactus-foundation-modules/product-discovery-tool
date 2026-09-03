// Shared shapes for product-discovery-tool, kept free of database and React so
// the editor half, the RSC half, the client shell and the tests can all name
// them without dragging prisma into a browser bundle.
//
// The vocabulary of step three is `filters-for-shop`'s own - groups, filters,
// rules - and is never re-declared here. This module owns the sequencing, the
// teaching copy and the interface, and nothing else.

export type PdtFlowStatus = 'DRAFT' | 'PUBLISHED'

/** What a whole flow is allowed to reach, before any node narrows it. */
export type PdtFlowScope = 'ALL' | 'CATEGORY' | 'COLLECTION' | 'TAG'

/** What choosing one browse node selects.
 *
 *  ALL means "the same products as my parent", not the whole shop: a node
 *  inherits its ancestors' scope. FILTERS narrows by ticks rather than by
 *  shelf, which is what makes "Height adjustable" a type as well as a feature. */
export type PdtNodeScope = 'ALL' | 'CATEGORY' | 'COLLECTION' | 'TAG' | 'FILTERS'

export type PdtImportance = 'PRIMARY' | 'SECONDARY'

/** What the insight counters record.
 *
 *  SHOW is a step drawn, REACH a step arrived at, PICK an option chosen, FINISH
 *  the results reached, DEAD_END a combination that left nothing, RELAXED a
 *  recovery offer taken. */
export type PdtStatKind = 'SHOW' | 'PICK' | 'REACH' | 'FINISH' | 'DEAD_END' | 'RELAXED'

export const PDT_STAT_KINDS: PdtStatKind[] = ['SHOW', 'PICK', 'REACH', 'FINISH', 'DEAD_END', 'RELAXED']

export type PdtFlow = {
  id: string
  name: string
  slug: string
  status: PdtFlowStatus
  heading: string | null
  standfirst: string | null
  introPuck: PdtPuckData | null
  scopeType: PdtFlowScope
  scopeSlug: string | null
  metaTitle: string | null
  metaDescription: string | null
  ogImage: string | null
  noindex: boolean
  showPrices: boolean
  allowSkip: boolean
  resultsPerPage: number
  /** Both null means the results are the end of the flow, which is the default
   *  and what a site with no quote module gets. Never inferred from what is
   *  installed. */
  finishCtaLabel: string | null
  finishCtaHref: string | null
  position: number
  updatedAt: Date
}

export type PdtNode = {
  id: string
  flowId: string
  parentId: string | null
  label: string
  slug: string
  blurb: string | null
  explainer: string | null
  bestFor: string | null
  notFor: string | null
  imageUrl: string | null
  icon: string | null
  scopeType: PdtNodeScope
  scopeSlug: string | null
  position: number
  /** Filters this node applies the moment it is chosen. Not ticks: step three
   *  never offers them to be unticked, because they are what the node IS. */
  filterIds: string[]
}

export type PdtQuestion = {
  id: string
  flowId: string
  /** null = every node in the flow. */
  nodeId: string | null
  groupId: string
  heading: string | null
  explainer: string | null
  importance: PdtImportance
  multi: boolean
  position: number
  hidden: boolean
}

export type PdtOptionNote = {
  id: string
  filterId: string
  /** null = global: this note explains the filter wherever it is offered. */
  nodeId: string | null
  explainer: string | null
  bestFor: string | null
  watchOut: string | null
  imageUrl: string | null
  learnMoreHref: string | null
}

export type PdtSettings = {
  zeroResultRecovery: boolean
  showCounts: boolean
  compareEnabled: boolean
  swapCardImages: boolean
  preselectOnClick: boolean
}

/** One day's counter, as the Insights tab reads them back. */
export type PdtStatRow = {
  day: string
  stepKey: string
  choiceKey: string
  kind: PdtStatKind
  count: number
}

// A Puck document, structurally. Declared here rather than imported so the
// media hooks and the storefront page can name the shape without pulling a
// second module's type graph in for three fields - same call filters makes.
export type PdtPuckData = { root: { props?: Record<string, unknown> }; content: unknown[]; zones?: Record<string, unknown> }

/** The layout type every flow page is designed through - one template, stamped
 *  for every flow, exactly as the shop's Category layout is one template
 *  stamped for every category. Declared in cactus.module.json's layoutTypes. */
export const PRODUCT_DISCOVERY_LAYOUT_TYPE = 'productDiscovery'

/** The layout type a flow's designed intro is built through. Deliberately NOT
 *  declared in layoutTypes: nothing registers blocks against it, so the builder
 *  offers core's shared content parts only with a bare root - no page chrome
 *  inside a page. Same trick as shop's category description builder. */
export const PRODUCT_DISCOVERY_INTRO_LAYOUT_TYPE = 'productDiscoveryIntro'

/** An intro opened in the builder but never built in is an empty document, not
 *  a null one; treating that as "designed" would print an empty div where the
 *  standfirst should be. */
export function hasIntroContent(doc: PdtPuckData | null): doc is PdtPuckData {
  return !!doc && Array.isArray(doc.content) && doc.content.length > 0
}

/** Query-string keys this module owns outright. A filter group whose slug
 *  collides with one of them is read under a `q-` prefixed parameter instead
 *  (see paramForGroupSlug) and flagged on the Questions tab - filters' admin is
 *  not edited for this module's sake. */
export const PDT_RESERVED_PARAMS = ['pick', 'sort', 'page'] as const

/** The query-string key a filter group is read and written under here. Its own
 *  slug wherever that is free, so a features URL is the same shape as a filter
 *  grid URL and the preselect code reads both. */
export function paramForGroupSlug(slug: string): string {
  return (PDT_RESERVED_PARAMS as readonly string[]).includes(slug) ? `q-${slug}` : slug
}
