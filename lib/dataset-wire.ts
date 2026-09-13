import type { FltSwapIndex } from '@/modules/filters-for-shop/lib/swap-pack'
import type { FltSortKey } from '@/modules/filters-for-shop/lib/sort'
import type { FltPublicGroup, FltVariationIndex } from '@/modules/filters-for-shop/components/public/FilterShell'
import type { PdtOptionNote } from '@/modules/product-discovery-tool/lib/types'

// The wire shape, and the one check the browser runs over it, in a file of their
// own for exactly the reason lib/cards-binding.ts gives: the client shell names
// this shape, and a client file importing anything that reaches prisma fails the
// build-time client graph check (scripts/check-client-graph.mjs). lib/dataset.ts
// - which does the building, and does reach prisma - imports the shape from here
// rather than declaring it. Nothing below may import anything with a runtime
// side to it.

/**
 * The flow's answer set: everything worked out from the one pass over its
 * products.
 *
 * Fetched from app/api/public/dataset rather than serialised into the page: on
 * the live homepage that was 660 KB of flight payload per view for a block most
 * visitors never touch. See lib/dataset.ts for the whole reasoning.
 */
export type PdtDatasetAnswers = {
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
  /** The groups this flow's whole scope can offer, culled by filters' own rule
   *  and with their query-string keys already resolved.
   *
   *  Travels with the answer set rather than in the page because culling them
   *  needs the match matrix - `offerGroups` is measured against it - so there is
   *  no cheap way to know them at first paint. Nothing on the opening step wants
   *  them: they are the FEATURES step's questions, which is several clicks away,
   *  and the set lands in about a tenth of a second. */
  groups: FltPublicGroup[]
}

/**
 * The answer set as it travels to the browser: the answers, plus the teaching
 * copy for the options they offer.
 */
export type PdtDatasetWire = PdtDatasetAnswers & {
  /** The option notes this flow can show, scoped by lib/notes-scope.ts.
   *
   *  Here rather than in the page because nothing reads a note until the
   *  features step's questions exist, and those arrive with this set: before it
   *  lands `groups` is empty, so there is no option to explain and no group to
   *  compare. Inlined, they were 41 KB of every homepage view. */
  notes: PdtOptionNote[]
}

/**
 * The wire format's own version, carried in the dataset's address.
 *
 * The route is cached by a CDN for an hour and the CDN keys on the whole query
 * string. Without this, the first shell to ship expecting `notes` could be
 * handed an hour-old copy that predates them, and every option would lose its
 * guidance until that copy expired. Bump it whenever the shape changes in a way
 * an older copy cannot satisfy.
 */
export const PDT_DATASET_WIRE_VERSION = 2

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Marks a field that is neither text nor empty, so one bad field refuses the
 *  whole note rather than printing something that is not words. */
const NOT_TEXT = Symbol('not text')

/** A text field that may be empty. Absent reads as null, the way the database
 *  spells an unwritten field. */
function nullableText(field: unknown): string | null | typeof NOT_TEXT {
  if (field === undefined || field === null) return null
  return typeof field === 'string' ? field : NOT_TEXT
}

/** One note, field by field, or null when it is not one. */
function readNote(value: unknown): PdtOptionNote | null {
  if (!isPlainObject(value)) return null
  const { id, filterId } = value
  if (typeof id !== 'string' || typeof filterId !== 'string') return null
  const nodeId = nullableText(value.nodeId)
  const explainer = nullableText(value.explainer)
  const bestFor = nullableText(value.bestFor)
  const watchOut = nullableText(value.watchOut)
  const imageUrl = nullableText(value.imageUrl)
  const learnMoreHref = nullableText(value.learnMoreHref)
  if (
    nodeId === NOT_TEXT || explainer === NOT_TEXT || bestFor === NOT_TEXT
    || watchOut === NOT_TEXT || imageUrl === NOT_TEXT || learnMoreHref === NOT_TEXT
  ) return null
  return { id, filterId, nodeId, explainer, bestFor, watchOut, imageUrl, learnMoreHref }
}

/**
 * The fetched body, checked before the shell trusts it, or null when it is not
 * an answer set at all.
 *
 * Deliberately shallow over the answers and field-by-field over the notes, and
 * hand-written rather than a zod schema: this runs in the browser, zod is in no
 * client bundle on the platform, and walking 670 KB of matrix and swaps entry by
 * entry would cost the main thread more than the check is worth. The answers
 * come from this module's own route and are only ever indexed into; the notes
 * are the part whose fields are printed, so they are the part checked properly.
 *
 * A body with no `notes` at all is still a working answer set - a copy made
 * before notes travelled here, should one ever slip past the version in the
 * address - so it is accepted with no guidance rather than refused, which would
 * leave the whole finder inert. A malformed note is dropped on its own.
 */
export function readDatasetWire(body: unknown): PdtDatasetWire | null {
  if (!isPlainObject(body)) return null
  const { matrix, variations, swaps, sortKeys, serverOrder, shelfMembers, groups, notes } = body
  if (!isPlainObject(matrix) || !isPlainObject(variations) || !isPlainObject(swaps)) return null
  if (!isPlainObject(sortKeys) || !isPlainObject(shelfMembers)) return null
  if (!Array.isArray(serverOrder) || !Array.isArray(groups)) return null
  return {
    // Trusted shape from here down, per the note above: each is the right kind
    // of container and the shell only ever looks things up in it.
    matrix: matrix as PdtDatasetAnswers['matrix'],
    variations: variations as PdtDatasetAnswers['variations'],
    swaps: swaps as PdtDatasetAnswers['swaps'],
    sortKeys: sortKeys as PdtDatasetAnswers['sortKeys'],
    serverOrder: serverOrder as PdtDatasetAnswers['serverOrder'],
    shelfMembers: shelfMembers as PdtDatasetAnswers['shelfMembers'],
    groups: groups as PdtDatasetAnswers['groups'],
    notes: Array.isArray(notes)
      ? notes.map(readNote).filter((note): note is PdtOptionNote => note !== null)
      : [],
  }
}
