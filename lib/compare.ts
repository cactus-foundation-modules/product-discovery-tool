import type { PdtOptionNote } from '@/modules/product-discovery-tool/lib/types'

// The comparison tables, derived rather than stored.
//
// "What is the difference between a corner desk and a wave desk" is the
// question a guided flow exists to answer, and the answer is already written:
// each option's own explainer, what it is best for, and what to watch out for.
// Deriving the table from those columns means one place to write and a
// comparison that cannot drift from the option cards beside it.
//
// One shape for all three tables - options, features and finished products - so
// there is one component to draw them and one set of rules about empty cells.

/** A comparison as drawn: a header row, then one row per thing being compared,
 *  each with a label, an optional picture and one cell per header. */
export type PdtGridTable = {
  headers: string[]
  rows: { key: string; label: string; image: string | null; cells: string[] }[]
}

export const EMPTY_TABLE: PdtGridTable = { headers: [], rows: [] }

/** The three columns an option comparison can have. A column with nothing in it
 *  for any row is left out entirely rather than printed empty - a table of blank
 *  cells teaches less than no table. */
const OPTION_COLUMNS: { key: 'explainer' | 'bestFor' | 'watchOut'; label: string }[] = [
  { key: 'explainer', label: 'What it is' },
  { key: 'bestFor', label: 'Best for' },
  { key: 'watchOut', label: 'Worth knowing' },
]

type OptionCells = { explainer?: string; bestFor?: string; watchOut?: string }

function trimmed(value: string | null | undefined): string | undefined {
  const text = value?.trim()
  return text ? text : undefined
}

function assemble(entries: { key: string; label: string; image: string | null; cells: OptionCells }[]): PdtGridTable {
  const columns = OPTION_COLUMNS.filter((column) => entries.some((entry) => entry.cells[column.key]))
  if (columns.length === 0) return EMPTY_TABLE
  return {
    headers: columns.map((column) => column.label),
    rows: entries.map((entry) => ({
      key: entry.key,
      label: entry.label,
      image: entry.image,
      cells: columns.map((column) => entry.cells[column.key] ?? ''),
    })),
  }
}

/** A comparison over the browse cards of one step: the siblings, side by side,
 *  with what each is for. The copy lives on the node itself, because a type is
 *  explained once wherever it appears. */
export function compareNodes(
  nodes: readonly { slug: string; label: string; explainer: string | null; bestFor: string | null; notFor: string | null; imageUrl: string | null }[],
): PdtGridTable {
  return assemble(
    nodes.map((node) => ({
      key: node.slug,
      label: node.label,
      image: node.imageUrl,
      cells: { explainer: trimmed(node.explainer), bestFor: trimmed(node.bestFor), watchOut: trimmed(node.notFor) },
    })),
  )
}

/** A comparison over one filter group's options. The copy lives on the option
 *  note, written once per filter and reused by every flow, with an optional
 *  node-scoped override where the same word means something different on a
 *  chair than on a desk. */
export function compareFilters(
  filters: readonly { id: string; label: string; swatch: string | null }[],
  notes: ReadonlyMap<string, PdtOptionNote>,
): PdtGridTable {
  return assemble(
    filters.map((filter) => {
      const note = notes.get(filter.id)
      return {
        key: filter.id,
        label: filter.label,
        image: note?.imageUrl ?? null,
        cells: { explainer: trimmed(note?.explainer), bestFor: trimmed(note?.bestFor), watchOut: trimmed(note?.watchOut) },
      }
    }),
  )
}

/**
 * Two or three finished products beside each other, with the questions this
 * flow asked as the rows.
 *
 * Read straight out of filters' own matrix - which filters each product matches
 * - so there is no second vocabulary to keep in step with the first, and a
 * feature nobody's product answers is left out rather than printed as three
 * dashes.
 */
export function compareProducts(
  products: readonly { id: string; name: string }[],
  questions: readonly { key: string; label: string; filters: readonly { id: string; label: string }[] }[],
  matrix: Readonly<Record<string, string[]>>,
): PdtGridTable {
  if (products.length < 2) return EMPTY_TABLE
  const rows = questions
    .map((question) => ({
      key: question.key,
      label: question.label,
      image: null,
      cells: products.map((product) => {
        const matched = new Set(matrix[product.id] ?? [])
        return question.filters.filter((f) => matched.has(f.id)).map((f) => f.label).join(', ')
      }),
    }))
    .filter((row) => row.cells.some(Boolean))
  if (rows.length === 0) return EMPTY_TABLE
  return { headers: products.map((product) => product.name), rows }
}

/** The most specific note for a filter at a point in the tree: a note scoped to
 *  one of the nodes on the current path beats the global one, deepest first. */
export function resolveNotes(
  notes: readonly PdtOptionNote[],
  nodeIdsDeepestLast: readonly string[],
): Map<string, PdtOptionNote> {
  const out = new Map<string, PdtOptionNote>()
  const rank = new Map<string, number>()
  for (const note of notes) {
    // Global notes rank 0; a note scoped to the nth node on the path ranks n+1,
    // so the deepest scope always wins and an unrelated node's note never does.
    const at = note.nodeId === null ? 0 : nodeIdsDeepestLast.indexOf(note.nodeId) + 1
    if (note.nodeId !== null && at === 0) continue
    const best = rank.get(note.filterId) ?? -1
    if (at <= best) continue
    rank.set(note.filterId, at)
    out.set(note.filterId, note)
  }
  return out
}

/** Does a comparison say anything at all? A table where nobody has written a
 *  word is a control that opens on nothing, so the affordance is not offered. */
export function hasComparison(table: PdtGridTable): boolean {
  return table.headers.length > 0 && table.rows.length >= 2
}
