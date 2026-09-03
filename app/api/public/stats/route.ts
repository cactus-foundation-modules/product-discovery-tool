import { NextResponse } from 'next/server'
import { z } from 'zod'
import { listGroups } from '@/modules/filters-for-shop/lib/db/filters'
import { getFlowBySlug } from '@/modules/product-discovery-tool/lib/db/flows'
import { listNodes } from '@/modules/product-discovery-tool/lib/db/nodes'
import { bumpStat } from '@/modules/product-discovery-tool/lib/db/stats'
import { buildNodeTree, MAX_PICK_DEPTH, type PdtTreeNode } from '@/modules/product-discovery-tool/lib/flow'
import { PDT_STAT_KINDS, paramForGroupSlug } from '@/modules/product-discovery-tool/lib/types'

// The insight beacon: cheap to send, cheap to refuse.
//
// One unauthenticated POST per event. It counts (flow, UTC day, step, choice,
// kind) and nothing else - no cookie, no identifier, no address kept - so it
// needs no consent category and says nothing about anybody.
//
// The important property is that ROW GROWTH IS BOUNDED BY THE CONFIGURATION,
// not by whoever is posting: every choice key has to name something this flow
// actually offers - a node, a path down the tree, or one filter in one group -
// and anything else is dropped. That is why a dead end is recorded one option at
// a time rather than as the combination that caused it: combinations are
// unbounded, and a table nobody can bound is a table that fills up.
//
// Bot traffic will inflate the arrival counts somewhat. PICK, RELAXED and the
// finish need a real click, and those are the ones that matter.

const Body = z.object({
  flowSlug: z.string().min(1).max(120),
  stepKey: z.string().min(1).max(40),
  choiceKey: z.string().min(1).max(200),
  kind: z.enum(PDT_STAT_KINDS as [string, ...string[]]),
})

const STEP_KEY = /^(features|browse:\d{1,2})$/

/** Every choice key this flow could honestly produce: the browse paths down its
 *  tree, and one key per filter in the vocabulary. */
function allowedKeys(roots: PdtTreeNode[], filterRefs: Set<string>): Set<string> {
  const keys = new Set<string>(['-'])
  for (const ref of filterRefs) keys.add(ref)
  const walk = (nodes: PdtTreeNode[], prefix: string[]) => {
    for (const node of nodes) {
      if (prefix.length >= MAX_PICK_DEPTH) continue
      const path = [...prefix, node.slug]
      keys.add(node.slug)
      keys.add(path.join('/'))
      walk(node.children, path)
    }
  }
  walk(roots, [])
  return keys
}

export async function POST(request: Request) {
  // Everything below answers 204 whatever happens, right or wrong. A counter is
  // not worth telling an anonymous caller whether their guess was a real flow.
  const noContent = new NextResponse(null, { status: 204 })
  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return noContent
  const { flowSlug, stepKey, choiceKey, kind } = parsed.data
  if (!STEP_KEY.test(stepKey)) return noContent

  const flow = await getFlowBySlug(flowSlug)
  if (!flow || flow.status !== 'PUBLISHED') return noContent

  const [nodes, groups] = await Promise.all([listNodes(flow.id), listGroups()])
  // Both spellings of a group's key. A group whose slug collides with `pick`,
  // `sort` or `page` is read under a `q-` prefix on the storefront (see
  // paramForGroupSlug), and the shell names its beacons the same way.
  const filterRefs = new Set(
    groups.flatMap((group) =>
      group.filters.flatMap((filter) => [`${group.slug}:${filter.slug}`, `${paramForGroupSlug(group.slug)}:${filter.slug}`]),
    ),
  )
  if (!allowedKeys(buildNodeTree(nodes), filterRefs).has(choiceKey)) return noContent

  try {
    await bumpStat(flow.id, stepKey, choiceKey, kind as (typeof PDT_STAT_KINDS)[number])
  } catch {
    // A counter must never be the reason a page reports an error. Nothing is
    // retried and nothing is reported.
  }
  return noContent
}
