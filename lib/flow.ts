import type { PdtNode } from '@/modules/product-discovery-tool/lib/types'

// The pure half of "where am I in this flow": the browse path, the steps it
// implies, and how both are spelled in the query string.
//
// Out of the shell and out of the RSC because the two must agree exactly. The
// server renders the first page of cards for the state the address describes
// and the shell opens on the same state; two nearly-identical readings of one
// URL is how a page comes back showing something other than what was linked to.

/** How deep a browse path may go, however long the address is. The tree is
 *  hand-built and three levels is already a lot; the cap is here so a forged
 *  `?pick=` cannot make the resolver walk forever. */
export const MAX_PICK_DEPTH = 6

/** The parameter carrying the browse path. */
export const PICK_PARAM = 'pick'

/** What a flow writes in its "later steps" heading where the answer the shopper
 *  has just given should appear: "Which sort of {choice} do you need?". */
export const PDT_CHOICE_TOKEN = '{choice}'

/** The wording the module ships, used wherever a flow has written none. Kept
 *  here rather than in the shell so the admin can show the owner exactly what
 *  they are overriding, and so improving a default reaches every site that has
 *  not written its own. */
export const PDT_DEFAULT_HEADINGS = {
  first: 'What are you looking for?',
  features: 'What matters to you?',
} as const

/** The heading above a step.
 *
 *  A browse step deeper than the first names the answer that got the shopper
 *  there. Without a written template that is "Which sort of desks?", the label
 *  lowercased mid-sentence; with one, the owner's own sentence, and {choice}
 *  wherever they want the answer in it - which is the only way to write it in a
 *  language that does not put it there, or to drop it entirely. */
export function stepHeading(
  step: { kind: 'browse' | 'features'; parentLabel: string | null },
  headings: { first?: string | null; later?: string | null; features?: string | null },
): string {
  if (step.kind === 'features') return headings.features?.trim() || PDT_DEFAULT_HEADINGS.features
  if (!step.parentLabel) return headings.first?.trim() || PDT_DEFAULT_HEADINGS.first
  const template = headings.later?.trim()
  if (!template) return `Which sort of ${step.parentLabel.toLowerCase()}?`
  // The label as written, not lowercased: the owner has written the sentence
  // around it and only they know whether it starts one.
  return template.split(PDT_CHOICE_TOKEN).join(step.parentLabel)
}

export type PdtTreeNode = PdtNode & { children: PdtTreeNode[] }

/** Slug segments out of `?pick=desks/height-adjustable`. Empty segments and
 *  anything past the depth cap are dropped rather than refused: a link that has
 *  been mangled should land somewhere sensible, not on an error. */
export function parsePickPath(raw: string | null | undefined): string[] {
  if (!raw) return []
  return raw
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, MAX_PICK_DEPTH)
}

export function formatPickPath(slugs: readonly string[]): string {
  return slugs.filter(Boolean).join('/')
}

/** The flat node rows as a tree, each level in the owner's own order. Nodes
 *  whose parent is missing (a row orphaned by a delete that raced a read) are
 *  dropped rather than promoted to the root, where they would appear as a
 *  top-level type nobody added. */
export function buildNodeTree(nodes: readonly PdtNode[]): PdtTreeNode[] {
  const byId = new Map<string, PdtTreeNode>()
  for (const node of nodes) byId.set(node.id, { ...node, children: [] })
  const roots: PdtTreeNode[] = []
  for (const node of nodes) {
    const built = byId.get(node.id)
    if (!built) continue
    if (node.parentId === null) {
      roots.push(built)
      continue
    }
    byId.get(node.parentId)?.children.push(built)
  }
  const sort = (list: PdtTreeNode[]) => {
    list.sort((a, b) => a.position - b.position || a.label.localeCompare(b.label))
    for (const child of list) sort(child.children)
  }
  sort(roots)
  return roots
}

/** Walk a browse path down the tree.
 *
 *  `nodes` is what was matched, in order. `unknownAt` is the index of the first
 *  segment that named nothing, or null where the whole path resolved - a deep
 *  link to a node since deleted lands on the step its last good segment
 *  reached, with a quiet line saying so, rather than on a 404. */
export function walkPath(roots: readonly PdtTreeNode[], path: readonly string[]): { nodes: PdtTreeNode[]; unknownAt: number | null } {
  const out: PdtTreeNode[] = []
  let level: readonly PdtTreeNode[] = roots
  for (let at = 0; at < path.length; at++) {
    const found = level.find((n) => n.slug === path[at])
    if (!found) return { nodes: out, unknownAt: at }
    out.push(found)
    level = found.children
  }
  return { nodes: out, unknownAt: null }
}

/** One rung of the wizard. A browse step offers the children of wherever the
 *  shopper has got to; the features step is always the last one. */
export type PdtStep =
  | { kind: 'browse'; index: number; parent: PdtTreeNode | null; options: PdtTreeNode[] }
  | { kind: 'features'; index: number }

/**
 * The steps this branch of the tree has, given how far down it the shopper is.
 *
 * Branches can be different depths and that is correct, not a bug: Accessories
 * may have no sub-types, so its branch goes straight from type to features and
 * says "Step 2 of 2" while the branch beside it says "Step 2 of 3".
 *
 * The step count is worked out from the path ACTUALLY taken plus whatever lies
 * under it, so it can grow as the shopper descends - which is honest. Guessing
 * the deepest branch's count up front would promise a step the shopper's own
 * choice then removes.
 */
export function buildSteps(roots: readonly PdtTreeNode[], path: readonly string[]): PdtStep[] {
  const { nodes } = walkPath(roots, path)
  const steps: PdtStep[] = []
  let level: readonly PdtTreeNode[] = roots
  let parent: PdtTreeNode | null = null
  let index = 0
  // Every level the shopper has already answered, plus the one they are on.
  for (let depth = 0; ; depth++) {
    if (level.length === 0) break
    steps.push({ kind: 'browse', index, parent, options: [...level] })
    index++
    const chosen = nodes[depth]
    if (!chosen) break
    parent = chosen
    level = chosen.children
  }
  steps.push({ kind: 'features', index })
  return steps
}

/** Which step the shopper is looking at: the first unanswered browse step, or
 *  the features step once every browse step above it has an answer.
 *
 *  `skipped` is the set of browse-step indexes the shopper pressed "Not sure
 *  yet" on. A skipped step is answered - with "no preference" - so the flow
 *  moves on over the scope reached so far rather than guessing. */
export function currentStepIndex(steps: readonly PdtStep[], path: readonly string[], skipped: ReadonlySet<number>): number {
  for (const step of steps) {
    if (step.kind !== 'browse') continue
    if (path[step.index] === undefined && !skipped.has(step.index)) return step.index
  }
  return steps[steps.length - 1]?.index ?? 0
}

/** The path with one browse step answered, and every deeper answer cleared.
 *
 *  Clearing is the whole point: the answers below were chosen against a scope
 *  that no longer exists, so keeping them would leave a shopper looking at
 *  "Corner" under "Chairs". */
export function answerAt(path: readonly string[], index: number, slug: string): string[] {
  return [...path.slice(0, index), slug]
}

/** The path with one browse step's answer removed, and everything below it. */
export function clearFrom(path: readonly string[], index: number): string[] {
  return path.slice(0, index)
}
