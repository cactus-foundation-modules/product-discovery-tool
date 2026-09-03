'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { facetCount, matchesSelection, pickSwapFilters, type FltMatrixEntry, type FltSelection } from '@/modules/filters-for-shop/lib/filter-logic'
import { applySelectionToParams, selectionFromParams } from '@/modules/filters-for-shop/lib/preselect'
import { FLT_SORT_OPTIONS, FLT_SORT_RECOMMENDED_PARAM, isFltSortValue, sortProductIds, sortValueFromParam, type FltSortKey, type FltSortValue } from '@/modules/filters-for-shop/lib/sort'
import { EMPTY_SWAP_INDEX, unpackSwaps, type FltSwapIndex } from '@/modules/filters-for-shop/lib/swap-pack'
import type { FltSwap } from '@/modules/filters-for-shop/lib/db/matching'
import type { FltPublicGroup, FltVariationIndex } from '@/modules/filters-for-shop/components/public/FilterShell'
import { answerAt, buildNodeTree, buildSteps, clearFrom, currentStepIndex, formatPickPath, parsePickPath, stepHeading, PICK_PARAM, walkPath, type PdtStep, type PdtTreeNode } from '@/modules/product-discovery-tool/lib/flow'
import { narrowByNode, resolveScope, type PdtShelf } from '@/modules/product-discovery-tool/lib/resolve'
import { askedQuestions } from '@/modules/product-discovery-tool/lib/questions'
import { compareFilters, compareNodes, compareProducts, hasComparison, resolveNotes, type PdtGridTable } from '@/modules/product-discovery-tool/lib/compare'
import { relaxations } from '@/modules/product-discovery-tool/lib/recovery'
import { PDT_UNSTYLED, type PdtNode, type PdtOptionNote, type PdtQuestion } from '@/modules/product-discovery-tool/lib/types'
import type { PdtCardLoader } from '@/modules/product-discovery-tool/lib/cards-binding'
import { StepBrowse } from '@/modules/product-discovery-tool/components/public/StepBrowse'
import { StepFeatures, type PdtQuestionView } from '@/modules/product-discovery-tool/components/public/StepFeatures'
import { CompareTable } from '@/modules/product-discovery-tool/components/public/CompareTable'
import { AnswerChips, type PdtAnswerChip } from '@/modules/product-discovery-tool/components/public/AnswerChips'

// The guided flow, in the browser.
//
// The whole wizard is client-side over one server pass. The block resolves the
// flow's product set, runs filters' matching over it, interns the result and
// renders the first page of cards; everything after that - stepping down the
// tree, live counts, ticking a feature, sorting, paging - happens here without a
// round trip, and the later pages of cards are fetched by ids as the shopper
// reaches them.
//
// Why not a navigation per step: the counts on a browse card and the products
// behind it must be the same answer, and they only are if one pass produced
// both. Re-querying per step would also mean a full page render every time
// somebody changed their mind, on the screen where changing your mind is the
// entire activity.

export type PdtShellSettings = {
  showCounts: boolean
  compareEnabled: boolean
  zeroResultRecovery: boolean
  swapCardImages: boolean
  preselectOnClick: boolean
}

export type DiscoveryShellProps = {
  flowSlug: string
  allowSkip: boolean
  showPrices: boolean
  finishCta: { label: string; href: string } | null
  /** The flow's own wording for the three step headings. Anything blank falls
   *  back to the module's own - see stepHeading. */
  headings: { first: string | null; later: string | null; features: string | null }
  settings: PdtShellSettings
  nodes: PdtNode[]
  questions: PdtQuestion[]
  notes: PdtOptionNote[]
  /** The groups this flow's whole scope can offer, culled by filters' own
   *  offerGroups and with their query-string keys already resolved (a group
   *  whose slug collides with `pick`, `sort` or `page` arrives under `q-`). */
  groups: FltPublicGroup[]
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
  columns: number
  pageSize: number
  /** Where step three's questions sit on a wide screen: down the left of the
   *  results, or across the top of them. Spelled the way filters' own grid
   *  spells it, because it is the same decision on the same kind of page and a
   *  site owner should not have to learn it twice. Tablet and below ignore it:
   *  both layouts put the questions behind the "Narrow down" bar there, which
   *  is the only sensible answer on a phone. */
  questionsPosition: 'left' | 'top'
  /** Whether arriving at step three on a phone or tablet opens the questions
   *  drawer by itself. */
  autoOpenQuestions: boolean
  /** How a question's options stack inside the drawer. */
  drawerOptions: 'side-by-side' | 'one-per-line'
  /** The "Narrow down" button's own colours, each possibly carrying a dark-mode
   *  arm as light-dark(l, d). Empty strings mean the module's own. */
  barButton: { bg: string; text: string; hoverBg: string; hoverText: string }
  /** Whether the FIRST browse step offers "Compare these" and "Not sure yet".
   *  Deeper steps always do. On a flow that opens on "what are you looking
   *  for?" both are noise - skipping it asks for the whole catalogue, which is
   *  the shop's own grid - while on a flow already scoped to one category the
   *  first step is a real question and both earn their place. The block
   *  decides, because only the person who built the flow knows which it is. */
  firstStepFoot: boolean
  /** The order the results arrive in, before the shopper touches the dropdown.
   *  The server has already rendered page one in it. */
  defaultSort: FltSortValue
  tabletBp: string
  /** The browse path the SERVER rendered for, from `?pick=`. The shell opens on
   *  it so the first paint is the linked-to step rather than step one. */
  initialPick: string
  /** Which products `children` already holds cards for. */
  renderedIds: string[]
  loadCards: PdtCardLoader
  children: React.ReactNode
}

const EMPTY_VARIATIONS: FltVariationIndex = { filterIds: [], combos: [], byProduct: {} }

// Same rule, and the same hard-won reason, as FilterShell's: every pass that
// writes to the cards must run in the SAME phase, because React runs all layout
// effects before any passive one and mixing the two silently reorders them.
// Layout rather than passive so the work lands before paint - after it, a grid
// draws every card and then hides most of them, with the scrollbar jumping
// under the shopper's hand.
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

type Dialog =
  | { kind: 'explain'; title: string; body: string }
  | { kind: 'compare'; title: string; table: PdtGridTable; caption?: string; rowHeader?: string }

/** How many results may be compared at once. Three fits a phone; four does not,
 *  and a comparison nobody can read is not a comparison. */
const MAX_PRODUCT_COMPARE = 3

export function DiscoveryShell(props: DiscoveryShellProps) {
  const {
    flowSlug, allowSkip, finishCta, headings, settings, nodes, questions, notes, groups,
    matrix, variations = EMPTY_VARIATIONS, swaps: swapIndex = EMPTY_SWAP_INDEX, sortKeys,
    serverOrder, shelfMembers, columns, pageSize, questionsPosition, autoOpenQuestions, drawerOptions,
    firstStepFoot, defaultSort, barButton, tabletBp, initialPick, renderedIds, loadCards, children,
  } = props

  const gridRef = useRef<HTMLDivElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)

  const [path, setPath] = useState<string[]>(() => parsePickPath(initialPick))
  const [skipped, setSkipped] = useState<Set<number>>(new Set())
  const [selected, setSelected] = useState<FltSelection>(new Map())
  const [sort, setSort] = useState<FltSortValue>(defaultSort)
  const [shownLimit, setShownLimit] = useState(pageSize)
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [isSheet, setIsSheet] = useState(false)
  const [compareMode, setCompareMode] = useState(false)
  const [comparePicks, setComparePicks] = useState<string[]>([])
  const [slots, setSlots] = useState<Map<string, HTMLElement>>(new Map())
  const [urlRead, setUrlRead] = useState(false)
  const [notFound, setNotFound] = useState(false)
  // Whether the shopper has moved at all since the page loaded. Focus is only
  // taken to the step heading once they have - moving it on first paint would
  // steal it from wherever the reader actually was.
  const movedRef = useRef(false)

  const [extraCards, setExtraCards] = useState<React.ReactNode[]>([])
  const loadedIdsRef = useRef<Set<string>>(new Set(renderedIds))
  const [cardsFailed, setCardsFailed] = useState(false)
  const [cardsLoading, setCardsLoading] = useState(false)
  const [cardRetry, setCardRetry] = useState(0)
  const fetchingRef = useRef<string | null>(null)

  // ---- The tree, the steps, and where we are in them --------------------
  const roots = useMemo(() => buildNodeTree(nodes), [nodes])
  const steps = useMemo(() => buildSteps(roots, path), [roots, path])
  const stepIndex = currentStepIndex(steps, path, skipped)
  const step: PdtStep = steps.find((s) => s.index === stepIndex) ?? steps[steps.length - 1]!
  const lastIndex = steps[steps.length - 1]?.index ?? 0

  // The flow's own scope is already applied - `serverOrder` IS the flow's
  // products - so only the nodes narrow further from here. Spelled as an ALL
  // flow scope rather than re-applying the real one, which would filter the set
  // against a shelf it is already the answer to.
  const resolved = useMemo(
    () => resolveScope({ scopeType: 'ALL', scopeSlug: null }, roots, path),
    [roots, path],
  )

  const membersByKey = useMemo(() => {
    const out = new Map<string, Set<string>>()
    for (const [key, indexes] of Object.entries(shelfMembers)) {
      out.set(key, new Set(indexes.map((i) => serverOrder[i] ?? '').filter(Boolean)))
    }
    return out
  }, [shelfMembers, serverOrder])

  const shelfLookup = useCallback(
    (shelf: PdtShelf) => membersByKey.get(`${shelf.type}:${shelf.slug}`),
    [membersByKey],
  )

  const matchesAll = useCallback(
    (productId: string, filterIds: readonly string[]) => {
      const matched = matrix[productId] ?? []
      return filterIds.every((id) => matched.includes(id))
    },
    [matrix],
  )

  /** The products left after every answered browse step, in the shop's order. */
  const narrowTo = useCallback(
    (chain: readonly PdtTreeNode[]) => {
      let ids: string[] = serverOrder
      for (const node of chain) ids = narrowByNode(ids, node, shelfLookup, matchesAll)
      return ids
    },
    [serverOrder, shelfLookup, matchesAll],
  )

  const eligibleIds = useMemo(() => narrowTo(resolved.nodes), [narrowTo, resolved.nodes])

  // Counts for the step on screen: one pass over the current set, narrowed per
  // child in memory. A step with five types costs one product query, not five.
  const browseOptions = useMemo(() => {
    if (step.kind !== 'browse') return []
    const parentChain = step.parent ? walkPath(roots, path.slice(0, step.index)).nodes : []
    const base = narrowTo(parentChain)
    return step.options.map((node) => ({ node, count: narrowByNode(base, node, shelfLookup, matchesAll).length }))
  }, [step, roots, path, narrowTo, shelfLookup, matchesAll])

  // ---- Filters: the matrix, the questions and the selection --------------
  const combosByProduct = useMemo(() => {
    const rows = variations.combos.map((combo) => combo.map((i) => variations.filterIds[i] ?? ''))
    const out = new Map<string, string[][]>()
    for (const [productId, indices] of Object.entries(variations.byProduct)) {
      out.set(productId, indices.map((i) => rows[i] ?? []))
    }
    return out
  }, [variations])

  const swaps = useMemo(() => unpackSwaps(swapIndex), [swapIndex])

  /** The matrix restricted to what the browse answers have left - which is what
   *  every facet count on the features step has to be measured against. */
  const eligibleEntries = useMemo<FltMatrixEntry[]>(
    () => eligibleIds.map((id) => [id, matrix[id] ?? [], combosByProduct.get(id)]),
    [eligibleIds, matrix, combosByProduct],
  )

  const lockedFilterIds = useMemo(() => new Set(resolved.lockedFilterIds), [resolved.lockedFilterIds])
  // A group the node has already answered by BEING it is not asked again:
  // picking "Height adjustable" as a type must not then ask "Height
  // adjustable?" as a feature.
  const lockedGroupIds = useMemo(() => {
    const out = new Set<string>()
    for (const group of groups) {
      if (group.filters.some((f) => lockedFilterIds.has(f.id))) out.add(group.id)
    }
    return out
  }, [groups, lockedFilterIds])

  const nodeIdsDeepestLast = useMemo(() => resolved.nodes.map((n) => n.id), [resolved.nodes])
  const notesByFilter = useMemo(() => resolveNotes(notes, nodeIdsDeepestLast), [notes, nodeIdsDeepestLast])

  const count = useCallback(
    (filterId: string, groupId: string) => facetCount(filterId, groupId, eligibleEntries, selected),
    [eligibleEntries, selected],
  )

  /** The groups still worth asking here, culled by filters' own rule: drop the
   *  options nothing left can match, then drop a group with fewer than two
   *  options - a heading with one tick under it is not a choice. */
  const offeredGroups = useMemo(() => {
    const reachable = new Set(eligibleIds.flatMap((id) => matrix[id] ?? []))
    return groups
      .map((group) => ({
        ...group,
        filters: group.filters.filter((f) => reachable.has(f.id) || (selected.get(group.id)?.has(f.id) ?? false)),
      }))
      .filter((group) => group.filters.length >= 2)
  }, [groups, eligibleIds, matrix, selected])

  const questionViews = useMemo<PdtQuestionView[]>(() => {
    const asked = askedQuestions(offeredGroups, questions, nodeIdsDeepestLast, lockedGroupIds)
    return asked.map((question) => {
      const options = question.group.filters.map((filter) => {
        const note = notesByFilter.get(filter.id)
        return {
          filter,
          count: count(filter.id, question.group.id),
          note: note?.bestFor?.trim() || null,
          hasExplainer: !!note?.explainer?.trim(),
        }
      })
      return {
        ...question,
        options,
        canCompare: settings.compareEnabled && hasComparison(compareFilters(question.group.filters, notesByFilter)),
      }
    })
  }, [offeredGroups, questions, nodeIdsDeepestLast, lockedGroupIds, notesByFilter, count, settings.compareEnabled])

  // ---- Results ----------------------------------------------------------
  const orderedIds = useMemo(() => sortProductIds(eligibleIds, sortKeys, sort), [eligibleIds, sortKeys, sort])
  const matchingIds = useMemo(
    () => orderedIds.filter((id) => matchesSelection(matrix[id] ?? [], selected, combosByProduct.get(id))),
    [orderedIds, matrix, selected, combosByProduct],
  )
  const windowIds = useMemo(() => matchingIds.slice(0, Math.max(pageSize, shownLimit)), [matchingIds, pageSize, shownLimit])

  // Back to the top of the list whenever the answers change. Adjusted during
  // render rather than in an effect - React's own pattern for state that has to
  // follow a change in inputs, and an effect would paint the wrong window first.
  const windowResetKey = `${path.join('/')}|${sort}|${[...selected.entries()].map(([g, f]) => `${g}:${[...f].sort().join(',')}`).sort().join('|')}`
  const [lastResetKey, setLastResetKey] = useState(windowResetKey)
  if (windowResetKey !== lastResetKey) {
    setLastResetKey(windowResetKey)
    setShownLimit(pageSize)
  }

  const orderedGroups = useMemo(
    () => groups.map((g) => ({ id: g.id, filterIds: g.filters.map((f) => f.id) })),
    [groups],
  )

  // ---- The address ------------------------------------------------------
  // Always `sort`: a filter group whose slug would collide with it has already
  // been moved aside to a `q-` prefixed parameter by the block (see
  // paramForGroupSlug), so there is nothing here to fight over.
  const sortParam = 'sort'

  const readUrl = useCallback(() => {
    const params = new URLSearchParams(window.location.search)
    const nextPath = parsePickPath(params.get(PICK_PARAM))
    const walked = walkPath(roots, nextPath)
    setNotFound(walked.unknownAt !== null && nextPath.length > 0)
    setPath(walked.nodes.map((n) => n.slug))
    setSelected(selectionFromParams(groups, params, new Map()))
    const asked = sortValueFromParam(params.get(sortParam))
    if (asked !== null) setSort(asked)
  }, [groups, roots])

  // Read the address only after mount: the cards are server-rendered and must
  // not depend on the query string, or the markup would mismatch on hydration.
  // Layout phase, and declared ahead of the mirror below, because the two are in
  // a race the read has to win - see the same note in filters' FilterShell,
  // where losing it cleared every shared link's ticks.
  useIsomorphicLayoutEffect(() => {
    readUrl()
    setUrlRead(true)
  }, [readUrl])

  // Back and forward. Every step change pushes, so the browser's own back button
  // is the flow's back button, and a shared link is a shared answer set.
  useEffect(() => {
    const onPop = () => {
      movedRef.current = true
      readUrl()
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [readUrl])

  const writeUrl = useCallback(
    (nextPath: readonly string[], nextSelected: FltSelection, nextSort: FltSortValue, push: boolean) => {
      const params = new URLSearchParams(window.location.search)
      const pick = formatPickPath(nextPath)
      if (pick) params.set(PICK_PARAM, pick)
      else params.delete(PICK_PARAM)
      applySelectionToParams(groups, nextSelected, new Map(), params)
      // The starting order leaves no trace, whatever it is; everything else
      // does, including "Recommended" where that is a step away from the
      // default - or a refresh would land the shopper back on the order they
      // had just left. Filters' own grid spells it exactly this way.
      if (nextSort !== defaultSort) params.set(sortParam, nextSort || FLT_SORT_RECOMMENDED_PARAM)
      else params.delete(sortParam)
      const query = params.toString()
      const url = query ? `?${query}` : window.location.pathname
      if (push) window.history.pushState(null, '', url)
      else window.history.replaceState(null, '', url)
    },
    [groups, defaultSort],
  )

  // ---- Insight beacons --------------------------------------------------
  //
  // One unauthenticated POST per event, sent and forgotten. No cookie, no id, no
  // address kept - the route counts (flow, day, step, choice, kind) and nothing
  // else, and drops anything whose keys do not name something in this flow's own
  // configuration.
  const beacon = useCallback((stepKey: string, choiceKey: string, kind: string) => {
    if (typeof navigator === 'undefined') return
    const body = JSON.stringify({ flowSlug, stepKey, choiceKey, kind })
    const url = '/api/m/product-discovery-tool/public/stats'
    try {
      if (typeof navigator.sendBeacon === 'function') {
        navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }))
        return
      }
      void fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {})
    } catch {
      // A counter is not worth a broken flow. Nothing here is retried.
    }
  }, [flowSlug])

  const stepKey = step.kind === 'browse' ? `browse:${step.index}` : 'features'

  // A step arrived at, counted once per arrival rather than per render.
  const reachedRef = useRef('')
  useEffect(() => {
    if (!urlRead) return
    const key = `${stepKey}|${path.join('/')}`
    if (reachedRef.current === key) return
    reachedRef.current = key
    beacon(stepKey, formatPickPath(path) || '-', step.kind === 'features' ? 'FINISH' : 'REACH')
  }, [urlRead, stepKey, path, step.kind, beacon])

  // A combination that leaves nothing, counted ONE OPTION AT A TIME rather than
  // as the combination itself. Combinations are unbounded and the counter table
  // has to stay bounded by the configuration; what the owner wants to know
  // anyway is which options keep turning up in dead ends, and that is exactly
  // what this answers.
  const deadRef = useRef('')
  useEffect(() => {
    if (!urlRead || step.kind !== 'features') return
    if (matchingIds.length > 0 || selected.size === 0) return
    const refs = chosenRefs(groups, selected)
    const key = refs.join(',')
    if (deadRef.current === key) return
    deadRef.current = key
    for (const ref of refs) beacon('features', ref, 'DEAD_END')
  }, [urlRead, step.kind, matchingIds.length, selected, groups, beacon])

  // ---- Moving through the flow ------------------------------------------
  const goTo = useCallback(
    (nextPath: string[], nextSkipped: Set<number>) => {
      movedRef.current = true
      setPath(nextPath)
      setSkipped(nextSkipped)
      // Feature ticks are chosen against a scope; changing the scope makes them
      // answers to a question nobody asked. Cleared, deliberately.
      setSelected(new Map())
      writeUrl(nextPath, new Map(), sort, true)
    },
    [sort, writeUrl],
  )

  const pick = useCallback(
    (node: PdtTreeNode) => {
      if (step.kind !== 'browse') return
      beacon(stepKey, node.slug, 'PICK')
      const nextSkipped = new Set([...skipped].filter((i) => i < step.index))
      goTo(answerAt(path, step.index, node.slug), nextSkipped)
    },
    [step, path, skipped, goTo, beacon, stepKey],
  )

  const skip = useCallback(() => {
    if (step.kind !== 'browse') return
    beacon(stepKey, '-', 'PICK')
    movedRef.current = true
    const next = new Set(skipped)
    next.add(step.index)
    setSkipped(next)
    // A skipped step keeps the path exactly as it was - nothing is guessed on
    // the shopper's behalf - so the features step runs over the scope reached
    // so far.
    setPath(clearFrom(path, step.index))
    setSelected(new Map())
    writeUrl(clearFrom(path, step.index), new Map(), sort, true)
  }, [step, skipped, path, sort, writeUrl, beacon, stepKey])

  const backTo = useCallback(
    (index: number) => {
      const nextSkipped = new Set([...skipped].filter((i) => i < index))
      goTo(clearFrom(path, index), nextSkipped)
    },
    [path, skipped, goTo],
  )

  const toggleFilter = useCallback(
    (groupId: string, filterId: string, multi: boolean) => {
      movedRef.current = true
      setSelected((prev) => {
        const next = new Map(prev)
        const set = new Set(multi ? next.get(groupId) ?? [] : [])
        if (multi && set.has(filterId)) set.delete(filterId)
        else if (!multi && (prev.get(groupId)?.has(filterId) ?? false)) set.clear()
        else set.add(filterId)
        if (set.size === 0) next.delete(groupId)
        else next.set(groupId, set)
        // Written here rather than in an effect so the address and the ticks
        // change together; a feature tick REPLACES rather than pushes, so back
        // still means "the previous step" and not "the previous tick".
        writeUrl(path, next, sort, false)
        return next
      })
      const ref = refFor(groups, groupId, filterId)
      if (ref !== '-') beacon('features', ref, 'PICK')
    },
    [groups, path, sort, writeUrl, beacon],
  )

  const clearFilters = useCallback(() => {
    setSelected(new Map())
    writeUrl(path, new Map(), sort, false)
  }, [path, sort, writeUrl])

  const startAgain = useCallback(() => goTo([], new Set()), [goTo])

  const changeSort = useCallback(
    (value: FltSortValue) => {
      setSort(value)
      writeUrl(path, selected, value, false)
    },
    [path, selected, writeUrl],
  )

  // Focus follows the step, but only once the shopper has actually moved -
  // taking it on first paint would steal it from wherever the reader was.
  useEffect(() => {
    if (!movedRef.current) return
    headingRef.current?.focus()
  }, [stepIndex, path])

  // ---- The cards --------------------------------------------------------
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${tabletBp})`)
    const apply = () => {
      setIsSheet(mq.matches)
      if (!mq.matches) setSheetOpen(false)
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [tabletBp])

  // The questions across the top scroll away like anything else. Once they have
  // gone, a "Narrow down" button - the same one a phone gets - floats at the top
  // of the window and brings the shopper back to them.
  //
  // The panel itself is what is watched, with no sentinel and no offset
  // arithmetic: not intersecting AND its bottom above the top of the window is
  // exactly "the questions are off the screen", which is the only moment the
  // button is worth showing. Below the fold reads as not intersecting too, and
  // that is a page nobody has scrolled yet, which the bottom check rules out.
  const questionsPanelRef = useRef<HTMLDivElement>(null)
  const [questionsScrolledOff, setQuestionsScrolledOff] = useState(false)
  const jumpLayout = questionsPosition === 'top' && !isSheet && step.kind === 'features'
  // Derived, not stored: a layout with no floating button cannot be showing
  // one, whatever the last observation said.
  const showJump = jumpLayout && questionsScrolledOff

  useEffect(() => {
    if (!jumpLayout || typeof IntersectionObserver === 'undefined') return
    const panel = questionsPanelRef.current
    if (!panel) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return
        setQuestionsScrolledOff(!entry.isIntersecting && entry.boundingClientRect.bottom <= 0)
      },
      { threshold: 0 },
    )
    observer.observe(panel)
    return () => observer.disconnect()
  }, [jumpLayout])

  const jumpToQuestions = useCallback(() => {
    // scroll-margin-top on the panel keeps this from landing under the site's
    // own header; it is CSS's own answer to the problem and a site with a
    // taller header moves the same variable the button is offset by.
    questionsPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  // Arriving at step three on a phone or tablet can open the questions drawer
  // rather than waiting for a tap on "Narrow down".
  //
  // Three guards, and each one is a case where opening would be wrong:
  //  - only on the way IN to the step, so closing the drawer and ticking a
  //    filter does not fling it open again;
  //  - only once the shopper has actually moved, so a shared link that lands on
  //    step three opens on the products it was shared FOR;
  //  - only where the drawer exists at all - on a wide screen the questions are
  //    already on the page and there is nothing to open.
  const onFeaturesRef = useRef(step.kind === 'features')
  useEffect(() => {
    const onFeatures = step.kind === 'features'
    const arrived = onFeatures && !onFeaturesRef.current
    onFeaturesRef.current = onFeatures
    if (arrived && autoOpenQuestions && isSheet && movedRef.current) setSheetOpen(true)
  }, [step.kind, autoOpenQuestions, isSheet])

  useEffect(() => {
    if (!urlRead) return
    const missing = windowIds.filter((id) => !loadedIdsRef.current.has(id)).slice(0, Math.max(1, Math.floor(pageSize) || 1))
    if (missing.length === 0) return
    const key = missing.join(',')
    if (fetchingRef.current === key) return
    fetchingRef.current = key
    setCardsLoading(true)
    setCardsFailed(false)
    // Deliberately NOT cancelled when the window moves on. A batch already asked
    // for is worth keeping whatever the shopper has answered since: the cards go
    // into the grid and the passes below decide whether to show them. Discarding
    // it deadlocks - tick an option and untick it, and the window is the same
    // window with the same ids, so the in-flight guard refuses to ask again
    // while the answer that would have filled it is thrown away on arrival.
    loadCards(missing)
      .then((rendered) => {
        for (const id of missing) loadedIdsRef.current.add(id)
        setExtraCards((prev) => [...prev, ...rendered])
      })
      .catch(() => setCardsFailed(true))
      .finally(() => {
        if (fetchingRef.current === key) fetchingRef.current = null
        setCardsLoading(false)
      })
    // cardRetry is in the list on purpose and read nowhere: it is how the retry
    // button asks again for a window that has not otherwise changed.
  }, [urlRead, windowIds, pageSize, loadCards, extraCards, cardRetry])

  // Show, hide and re-dress the server-rendered cards in place. Declared first
  // of the DOM passes; the paging pass below leaves anything this hid alone.
  useIsomorphicLayoutEffect(() => {
    const root = gridRef.current
    if (!root) return
    const onPage = new Set(windowIds)
    for (const el of root.querySelectorAll<HTMLElement>('[data-pdt-product]')) {
      const productId = el.dataset.pdtProduct ?? ''
      const matched = matrix[productId] ?? []
      const on = onPage.has(productId)
      el.style.display = on ? '' : 'none'
      el.toggleAttribute('data-pdt-hidden', !on)
      if (!on) continue
      const swapList = pickSwapFilters(matched, selected, orderedGroups)
        .map((id) => swaps.get(productId)?.get(id))
        .filter((s): s is FltSwap => s != null)
      dressCard(el, swapList, settings.swapCardImages, settings.preselectOnClick)
    }
  }, [windowIds, matrix, selected, orderedGroups, swaps, settings.swapCardImages, settings.preselectOnClick, extraCards])

  // Re-order the cards in place for the chosen sort. Real DOM moves, not CSS
  // `order`: the cards carry links and carousel buttons, and a visual order
  // disagreeing with the tab order would fail focus order. Safe to move them
  // under React because `children` is a stable server-passed node - React never
  // re-reconciles it, so it never puts them back.
  useIsomorphicLayoutEffect(() => {
    const root = gridRef.current
    if (!root) return
    const cards = new Map<string, HTMLElement>()
    for (const el of root.querySelectorAll<HTMLElement>(':scope > [data-pdt-product]')) {
      cards.set(el.dataset.pdtProduct ?? '', el)
    }
    const frag = document.createDocumentFragment()
    for (const id of windowIds) {
      const el = cards.get(id)
      if (el) frag.appendChild(el)
    }
    if (frag.childNodes.length > 0) root.appendChild(frag)
  }, [windowIds, extraCards])

  // Compare slots. Only made when compare mode is on, and appended to the card
  // rather than rendered into it: the cards are server-stamped Puck documents
  // this module does not own, so the tick rides ON one instead of inside it.
  useIsomorphicLayoutEffect(() => {
    const root = gridRef.current
    if (!root) return
    if (!compareMode) {
      for (const slot of root.querySelectorAll('.pdt-pick-slot')) slot.remove()
      setSlots((prev) => (prev.size === 0 ? prev : new Map()))
      return
    }
    const next = new Map<string, HTMLElement>()
    for (const el of root.querySelectorAll<HTMLElement>('[data-pdt-product]')) {
      const productId = el.dataset.pdtProduct ?? ''
      if (!productId || el.hasAttribute('data-pdt-hidden')) continue
      let slot = el.querySelector<HTMLElement>(':scope > .pdt-pick-slot')
      if (!slot) {
        slot = document.createElement('div')
        slot.className = 'pdt-pick-slot'
        slot.style.cssText = 'position:absolute;top:8px;left:8px;z-index:3'
        el.style.position = el.style.position || 'relative'
        el.appendChild(slot)
      }
      next.set(productId, slot)
    }
    setSlots((prev) => (sameKeys(prev, next) ? prev : next))
  }, [compareMode, windowIds, extraCards])

  const toggleComparePick = useCallback((productId: string) => {
    setComparePicks((prev) => {
      if (prev.includes(productId)) return prev.filter((id) => id !== productId)
      if (prev.length >= MAX_PRODUCT_COMPARE) return prev
      return [...prev, productId]
    })
  }, [])

  // ---- Dialogs ----------------------------------------------------------
  useEffect(() => {
    if (!dialog) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDialog(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [dialog])

  const explainNode = useCallback((node: PdtTreeNode) => {
    setDialog({ kind: 'explain', title: node.label, body: node.explainer ?? '' })
  }, [])

  const compareSiblings = useCallback(() => {
    if (step.kind !== 'browse') return
    setDialog({
      kind: 'compare',
      title: 'How these compare',
      table: compareNodes(step.options),
    })
  }, [step])

  const explainFilter = useCallback(
    (groupId: string, filterId: string) => {
      const group = groups.find((g) => g.id === groupId)
      const filter = group?.filters.find((f) => f.id === filterId)
      const note = notesByFilter.get(filterId)
      if (!filter) return
      setDialog({ kind: 'explain', title: filter.label, body: note?.explainer ?? '' })
    },
    [groups, notesByFilter],
  )

  const compareGroup = useCallback(
    (groupId: string) => {
      const group = offeredGroups.find((g) => g.id === groupId)
      if (!group) return
      setDialog({ kind: 'compare', title: group.name, table: compareFilters(group.filters, notesByFilter) })
    },
    [offeredGroups, notesByFilter],
  )

  // The product comparison: the picked products are the COLUMNS and the
  // questions this flow asked are the rows, which is the one place these tables
  // are turned on their side - three products across five features reads far
  // better that way. Every answer comes out of filters' own matrix, so there is
  // no second vocabulary to keep in step with the first.
  const openProductCompare = useCallback(() => {
    const picked = comparePicks.filter((id) => matchingIds.includes(id))
    if (picked.length < 2) return
    const table = compareProducts(
      picked.map((id) => ({ id, name: sortKeys[id]?.name ?? id })),
      questionViews.map((question) => ({ key: question.group.id, label: question.heading, filters: question.group.filters })),
      matrix,
    )
    setDialog({ kind: 'compare', title: 'These side by side', table, rowHeader: 'Feature' })
  }, [comparePicks, matchingIds, questionViews, matrix, sortKeys])

  // ---- Rendering --------------------------------------------------------
  // Plain data, no closures: these are built in a memo, and a memo holding
  // functions that close over this component's refs is what React's rules of
  // refs forbid. The one handler below is passed beside the list instead.
  const chips: PdtAnswerChip[] = useMemo(() => {
    const out: PdtAnswerChip[] = []
    resolved.nodes.forEach((node, at) => {
      out.push({ key: `node-${node.id}`, kind: 'step', stepLabel: `Step ${at + 1}`, label: node.label, index: at })
    })
    for (const group of groups) {
      const picked = selected.get(group.id)
      if (!picked || picked.size === 0) continue
      for (const filter of group.filters) {
        if (!picked.has(filter.id)) continue
        out.push({ key: `filter-${filter.id}`, kind: 'filter', stepLabel: group.name, label: filter.label, groupId: group.id, filterId: filter.id })
      }
    }
    return out
  }, [resolved.nodes, groups, selected])

  const removeChip = useCallback(
    (chip: PdtAnswerChip) => {
      if (chip.kind === 'step') backTo(chip.index)
      else toggleFilter(chip.groupId, chip.filterId, true)
    },
    [backTo, toggleFilter],
  )

  const relaxOffers = useMemo(() => {
    if (!settings.zeroResultRecovery) return []
    if (step.kind !== 'features' || matchingIds.length > 0 || selected.size === 0) return []
    return relaxations(selected, eligibleEntries).slice(0, 3)
  }, [settings.zeroResultRecovery, step.kind, matchingIds.length, selected, eligibleEntries])

  const labelFor = useCallback(
    (filterId: string) => groups.flatMap((g) => g.filters).find((f) => f.id === filterId)?.label ?? 'that',
    [groups],
  )

  const totalSteps = lastIndex + 1
  const stepNumber = Math.min(stepIndex + 1, totalSteps)
  // Narrowed rather than spread: only a browse step has a parent, and the
  // features step is the one the union proves cannot have one.
  const heading = stepHeading(
    step.kind === 'features'
      ? { kind: 'features', parentLabel: null }
      : { kind: 'browse', parentLabel: step.parent?.label ?? null },
    headings,
  )

  // The button's colours, handed to the stylesheet as custom properties rather
  // than as inline declarations on the button: a hover cannot be written inline,
  // and the sheet already owns every state. An unset colour writes no property
  // at all, so the rule's own fallback stands.
  //
  // The border follows the fill when one is chosen. A solid button still ringed
  // in the page's border colour reads as a mistake, and asking for the border
  // separately would be a fifth question nobody wants to answer.
  const barButtonStyle = useMemo(() => {
    const style: Record<string, string> = {}
    if (barButton.bg) {
      style['--pdt-bar-btn-bg'] = barButton.bg
      style['--pdt-bar-btn-border'] = barButton.bg
    }
    if (barButton.text) style['--pdt-bar-btn-fg'] = barButton.text
    if (barButton.hoverBg) {
      style['--pdt-bar-btn-hover-bg'] = barButton.hoverBg
      style['--pdt-bar-btn-hover-border'] = barButton.hoverBg
    }
    if (barButton.hoverText) style['--pdt-bar-btn-hover-fg'] = barButton.hoverText
    return style as React.CSSProperties
  }, [barButton.bg, barButton.text, barButton.hoverBg, barButton.hoverText])

  // "Compare these" and "Not sure yet" under a browse step - everywhere but the
  // first step, where the block decides.
  const footHere = firstStepFoot || stepIndex > 0
  const moreToShow = shownLimit < matchingIds.length
  const canCompareProducts = settings.compareEnabled && questionViews.length > 0

  const grid = (
    <>
      <div className="shop-grid" style={{ ['--shop-cols' as string]: String(columns) } as React.CSSProperties} ref={gridRef}>
        {children}
        {/* Fetched pages, rendered by React rather than written into the DOM by
            hand: the passes above move and dress cards, but the cards themselves
            have to belong to the tree or their carousels never hydrate. */}
        {extraCards}
      </div>
      {[...slots].map(([productId, el]) =>
        createPortal(
          <label className="pdt-chip" style={{ background: 'var(--color-surface)' }}>
            <input
              type="checkbox"
              checked={comparePicks.includes(productId)}
              onChange={() => toggleComparePick(productId)}
            />
            <span>Compare</span>
          </label>,
          el,
          productId,
        ),
      )}
      {cardsFailed && (
        // A grid that has stopped growing looks like a grid that has run out, so
        // say so and offer the way back rather than leaving the shopper to guess.
        <p className="pdt-cards-failed" role="status" {...PDT_UNSTYLED}>
          Those didn&rsquo;t load.{' '}
          <button type="button" className="pdt-link" onClick={() => setCardRetry((n) => n + 1)}>Try again</button>
        </p>
      )}
      {moreToShow && (
        <div className="pdt-pager" aria-busy={cardsLoading || undefined} {...PDT_UNSTYLED}>
          <button type="button" className="pdt-more" onClick={() => setShownLimit((n) => Math.min(n + pageSize, matchingIds.length))}>
            Show more
          </button>
        </div>
      )}
    </>
  )

  return (
    <div className="pdt-wrap">
      <div className="pdt-progress" {...PDT_UNSTYLED}>
        {stepIndex > 0 && (
          <button type="button" className="pdt-back" onClick={() => backTo(stepIndex - 1)}>‹ Back</button>
        )}
        <span className="pdt-progress-track" aria-hidden>
          <span className="pdt-progress-fill" style={{ width: `${Math.round((stepNumber / totalSteps) * 100)}%` }} />
        </span>
        <span className="pdt-progress-text">Step {stepNumber} of {totalSteps}</span>
      </div>

      <div className="pdt-step-head">
        <h2 className="pdt-step-title" ref={headingRef} tabIndex={-1}>{heading}</h2>
        {notFound && (
          <p className="pdt-step-sub" role="status">We couldn&rsquo;t find what that link pointed at, so we&rsquo;ve started you at the beginning.</p>
        )}
      </div>

      <AnswerChips chips={chips} onRemove={removeChip} onClearAll={chips.length > 0 ? startAgain : undefined} />

      {step.kind === 'browse' ? (
        <StepBrowse
          legend={heading}
          options={browseOptions}
          showCounts={settings.showCounts}
          allowSkip={allowSkip && footHere}
          canCompare={settings.compareEnabled && footHere && hasComparison(compareNodes(step.options))}
          onPick={pick}
          onSkip={skip}
          onExplain={explainNode}
          onCompare={compareSiblings}
        />
      ) : (
        <div className={`pdt-features pdt-pos-${questionsPosition === 'top' ? 'top' : 'left'} pdt-opts-${drawerOptions === 'one-per-line' ? 'rows' : 'grid'}`}>
          <div ref={questionsPanelRef} className={`pdt-questions${sheetOpen ? ' is-open' : ''}`} {...PDT_UNSTYLED} role={isSheet ? 'dialog' : undefined} aria-modal={isSheet && sheetOpen ? true : undefined} aria-label="Narrow these down">
            <div className="pdt-questions-head">
              <strong>Narrow these down</strong>
              <button type="button" className="pdt-dialog-close" onClick={() => setSheetOpen(false)} aria-label="Close">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <StepFeatures
              questions={questionViews}
              selected={selected}
              showCounts={settings.showCounts}
              // Only across the top, and only where that layout is actually in
              // force: in the sheet the questions ARE the screen, so they open.
              startCollapsed={questionsPosition === 'top' && !isSheet}
              onToggle={toggleFilter}
              onExplain={explainFilter}
              onCompare={compareGroup}
            />
          </div>

          <div className="pdt-results">
            <div className="pdt-toolbar" {...PDT_UNSTYLED}>
              {/* A live region, so a shopper using a screen reader hears the
                  list change as they tick rather than discovering it later. */}
              <p className="pdt-showing" role="status">
                {matchingIds.length} {matchingIds.length === 1 ? 'product' : 'products'}
                {selected.size > 0 && eligibleIds.length !== matchingIds.length ? ` of ${eligibleIds.length}` : ''}
              </p>
              <span style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                {canCompareProducts && (
                  <button type="button" className="pdt-link" onClick={() => { setCompareMode((on) => !on); setComparePicks([]) }}>
                    {compareMode ? 'Stop comparing' : 'Compare products'}
                  </button>
                )}
                <label className="pdt-sort">
                  <span>Sort by</span>
                  <select
                    className="pdt-sort-select"
                    value={sort}
                    onChange={(e) => changeSort(isFltSortValue(e.target.value) ? e.target.value : '')}
                  >
                    {FLT_SORT_OPTIONS.map((option) => (
                      <option key={option.value || FLT_SORT_RECOMMENDED_PARAM} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
              </span>
            </div>

            {compareMode && (
              <div className="pdt-picks" {...PDT_UNSTYLED}>
                <p className="pdt-picks-note">
                  {comparePicks.length === 0
                    ? `Tick up to ${MAX_PRODUCT_COMPARE} products to see them beside each other.`
                    : `${comparePicks.length} picked.`}
                </p>
                <button type="button" className="pdt-skip" disabled={comparePicks.length < 2} onClick={openProductCompare}>
                  Compare these
                </button>
              </div>
            )}

            {matchingIds.length === 0 && (
              relaxOffers.length > 0 ? (
                <div className="pdt-recovery" role="status" {...PDT_UNSTYLED}>
                  <p className="pdt-recovery-title">Nothing matches all of that.</p>
                  <ul className="pdt-recovery-list">
                    {relaxOffers.map((offer) => (
                      <li key={offer.filterId}>
                        <button
                          type="button"
                          className="pdt-skip"
                          onClick={() => {
                            beacon('features', refFor(groups, offer.groupId, offer.filterId), 'RELAXED')
                            toggleFilter(offer.groupId, offer.filterId, true)
                          }}
                        >
                          {offer.count} without <em>{labelFor(offer.filterId)}</em>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="pdt-empty" {...PDT_UNSTYLED}>
                  Nothing matches all of that.{' '}
                  <button type="button" className="pdt-link" onClick={clearFilters}>Clear your answers</button> and try a different combination.
                </p>
              )
            )}

            {grid}

            {finishCta && matchingIds.length > 0 && (
              <div className="pdt-finish">
                <a className="pdt-more" href={finishCta.href}>{finishCta.label}</a>
              </div>
            )}
          </div>

          {/* The wide-screen twin of the bar below: same button, same colours,
              shown only once the questions have scrolled off the top.
              PDT_UNSTYLED on the button ITSELF, not on a container: it has no
              container. Without it, core's site-wide `main button:hover` fill
              lands on this one and not on its twin in the bar - which does sit
              inside a marked container - and the two answer the same hover
              colour setting with two different colours. */}
          {showJump && (
            <button type="button" className="pdt-bar-btn pdt-jump" {...PDT_UNSTYLED} style={barButtonStyle} onClick={jumpToQuestions}>
              Narrow down{selected.size > 0 ? ` (${[...selected.values()].reduce((n, s) => n + s.size, 0)})` : ''}
            </button>
          )}

          {/* One button, not two. The second used to say "See N products" and
              close the drawer, which is work the drawer's own close and the
              scrim behind it already do - and with the drawer shut it pointed
              at products that were already on screen and already up to date. */}
          <div className="pdt-bar" {...PDT_UNSTYLED} style={barButtonStyle}>
            <button type="button" className="pdt-bar-btn" onClick={() => setSheetOpen(true)}>
              Narrow down{selected.size > 0 ? ` (${[...selected.values()].reduce((n, s) => n + s.size, 0)})` : ''}
            </button>
          </div>
        </div>
      )}

      <div className={`pdt-scrim${dialog || (isSheet && sheetOpen) ? ' is-open' : ''}`} onClick={() => { setDialog(null); setSheetOpen(false) }} aria-hidden />

      {dialog && (
        <div className="pdt-dialog is-open" {...PDT_UNSTYLED} role="dialog" aria-modal="true" aria-label={dialog.title}>
          <div className="pdt-dialog-head">
            <h3 className="pdt-dialog-title">{dialog.title}</h3>
            <button type="button" className="pdt-dialog-close" onClick={() => setDialog(null)} aria-label="Close">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="pdt-dialog-body">
            {dialog.kind === 'explain'
              ? <p className="pdt-explainer">{dialog.body}</p>
              : <CompareTable table={dialog.table} caption={dialog.caption} rowHeader={dialog.rowHeader} />}
          </div>
        </div>
      )}
    </div>
  )
}

/** The beacon key for one filter: its group's slug and its own, which is what
 *  the counter route will accept and what the Insights tab reads back. '-' where
 *  the pair names nothing, which the route treats as "no particular choice". */
function refFor(groups: readonly FltPublicGroup[], groupId: string, filterId: string): string {
  const group = groups.find((g) => g.id === groupId)
  const filter = group?.filters.find((f) => f.id === filterId)
  return group && filter ? `${group.slug}:${filter.slug}` : '-'
}

/** Every ticked option as a beacon key, in the owner's own order. */
function chosenRefs(groups: readonly FltPublicGroup[], selected: FltSelection): string[] {
  const out: string[] = []
  for (const group of groups) {
    const picked = selected.get(group.id)
    if (!picked) continue
    for (const filter of group.filters) {
      if (picked.has(filter.id)) out.push(`${group.slug}:${filter.slug}`)
    }
  }
  return out
}

/** Do two slot maps hold the same products? Compared rather than replaced so a
 *  render that changed nothing does not remount every portal. */
function sameKeys(a: Map<string, HTMLElement>, b: Map<string, HTMLElement>): boolean {
  if (a.size !== b.size) return false
  for (const [key, value] of a) if (b.get(key) !== value) return false
  return true
}

// Re-dress one card for the ticked options: show the matching variations'
// photos and point the link at the first match's own page, which opens the
// parent product with those options already chosen - so the shopper does not
// answer the same questions twice.
//
// Cards with shop's carousel island get the polite version: the allowed
// variation ids go into `data-shop-media-sources` and a `shop:card-media-sources`
// event tells the island to re-read - shop's own contract for exactly this.
// Writing the <img> src directly there would be undone by the island's next
// render. Cards with a plain server-rendered <img> keep the direct swap, with
// the originals parked in data attributes so unticking restores them exactly.
function dressCard(el: HTMLElement, swapList: FltSwap[], swapImages: boolean, preselect: boolean) {
  const primary = swapList[0] ?? null
  const link = el instanceof HTMLAnchorElement ? el : el.querySelector<HTMLAnchorElement>('a.shop-card-link')
  if (link && preselect) {
    if (link.dataset.pdtHref === undefined) link.dataset.pdtHref = link.getAttribute('href') ?? ''
    link.setAttribute('href', primary ? primary.href : link.dataset.pdtHref)
  }
  if (!swapImages) return
  if (el.querySelector('.shop-card-media')) {
    const ids = swapList.map((s) => s.sourceId).filter(Boolean)
    if (ids.length > 0) el.setAttribute('data-shop-media-sources', ids.join(' '))
    else el.removeAttribute('data-shop-media-sources')
    el.dispatchEvent(new CustomEvent('shop:card-media-sources'))
    return
  }
  const img = el.querySelector('img')
  if (!img) return
  if (img.dataset.pdtSrc === undefined) {
    img.dataset.pdtSrc = img.getAttribute('src') ?? ''
    img.dataset.pdtSrcset = img.getAttribute('srcset') ?? ''
  }
  if (primary?.image) {
    // srcset would outrank the swapped src, so it goes while the swap is on.
    img.removeAttribute('srcset')
    img.setAttribute('src', primary.image)
  } else {
    img.setAttribute('src', img.dataset.pdtSrc)
    if (img.dataset.pdtSrcset) img.setAttribute('srcset', img.dataset.pdtSrcset)
    else img.removeAttribute('srcset')
  }
}
