import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { Prisma } from '@prisma/client'
import { listGroups } from '@/modules/filters-for-shop/lib/db/filters'
import { shelfExists } from '@/modules/product-discovery-tool/lib/catalogue'
import { getFlow, getFlowBySlug, flowSlugAvailable } from '@/modules/product-discovery-tool/lib/db/flows'
import { listNodes } from '@/modules/product-discovery-tool/lib/db/nodes'
import { listQuestions } from '@/modules/product-discovery-tool/lib/db/questions'
import { listNotes } from '@/modules/product-discovery-tool/lib/db/notes'
import { MAX_PICK_DEPTH } from '@/modules/product-discovery-tool/lib/flow'

// A whole flow as a file, referenced by slug.
//
// This is not a nicety. It is how a real configuration - five product types,
// their sub-types, the copy that distinguishes each, which questions are asked
// where and an explanation per option - gets authored and applied without a
// single hand-written INSERT against a live customer's database, and how the
// same configuration is re-applied or rolled back afterwards.
//
// Three rules make it usable, and all three are load-bearing:
//
//  - EVERYTHING IS REFERENCED BY SLUG, never by id. A filter is "colour/oak", a
//    category is its shop slug, a node is its path "desks/height-adjustable".
//    Ids differ between sites and are unreadable by the person writing the file;
//    slugs are what the admin screens show and what the address carries anyway.
//  - VALIDATE, THEN APPLY, as two steps. A dry run resolves every reference and
//    reports what names nothing, writing nothing at all. The real import refuses
//    outright if the dry run would have reported a problem.
//  - UPSERT BY SLUG, IN ONE TRANSACTION, whole flow or nothing. A re-import of
//    an edited file updates rows in place and deletes the nodes the file no
//    longer names, taking their questions and notes with them - so the file is
//    the truth, not a set of suggestions layered over whatever was there.

const ScopeSchema = z.object({
  type: z.enum(['ALL', 'CATEGORY', 'COLLECTION', 'TAG']),
  slug: z.string().trim().min(1).nullable().optional(),
})

const NodeScopeSchema = z.object({
  type: z.enum(['ALL', 'CATEGORY', 'COLLECTION', 'TAG', 'FILTERS']),
  slug: z.string().trim().min(1).nullable().optional(),
})

const NodeSchema = z.object({
  /** The node's own address in the tree: "desks/height-adjustable". Its last
   *  segment is the node's slug and everything before it names its parent. */
  path: z.string().trim().min(1).max(400),
  label: z.string().trim().min(1).max(120),
  blurb: z.string().max(400).nullable().optional(),
  explainer: z.string().max(8000).nullable().optional(),
  bestFor: z.string().max(2000).nullable().optional(),
  notFor: z.string().max(2000).nullable().optional(),
  imageUrl: z.string().max(2000).nullable().optional(),
  icon: z.string().max(16).nullable().optional(),
  scope: NodeScopeSchema.optional(),
  /** Filters this node applies, as "<group slug>/<filter slug>". */
  filters: z.array(z.string().trim().min(1)).max(50).optional(),
})

const QuestionSchema = z.object({
  /** A node path, or null/absent for "every node in the flow". */
  node: z.string().trim().min(1).nullable().optional(),
  /** A filter group slug. */
  group: z.string().trim().min(1),
  heading: z.string().max(200).nullable().optional(),
  explainer: z.string().max(4000).nullable().optional(),
  importance: z.enum(['PRIMARY', 'SECONDARY']).optional(),
  multi: z.boolean().optional(),
  hidden: z.boolean().optional(),
})

const NoteSchema = z.object({
  /** "<group slug>/<filter slug>". */
  filter: z.string().trim().min(1),
  node: z.string().trim().min(1).nullable().optional(),
  explainer: z.string().max(8000).nullable().optional(),
  bestFor: z.string().max(2000).nullable().optional(),
  watchOut: z.string().max(2000).nullable().optional(),
  imageUrl: z.string().max(2000).nullable().optional(),
  learnMoreHref: z.string().max(2000).nullable().optional(),
})

export const FlowFileSchema = z.object({
  version: z.literal(1),
  flow: z.object({
    slug: z.string().trim().min(1).max(120),
    name: z.string().trim().min(1).max(120),
    status: z.enum(['DRAFT', 'PUBLISHED']).optional(),
    heading: z.string().max(200).nullable().optional(),
    standfirst: z.string().max(600).nullable().optional(),
    /** The wording above each step. Absent means the module's own; the later
     *  one may carry {choice}. */
    firstStepHeading: z.string().max(200).nullable().optional(),
    laterStepHeading: z.string().max(200).nullable().optional(),
    featuresHeading: z.string().max(200).nullable().optional(),
    scope: ScopeSchema.optional(),
    metaTitle: z.string().max(200).nullable().optional(),
    metaDescription: z.string().max(400).nullable().optional(),
    ogImage: z.string().max(2000).nullable().optional(),
    noindex: z.boolean().optional(),
    showPrices: z.boolean().optional(),
    allowSkip: z.boolean().optional(),
    resultsPerPage: z.number().int().min(1).max(100).optional(),
    /** Absent or null means the results ARE the end of the flow, which is the
     *  default. Never filled in from what happens to be installed. */
    finishCta: z.object({ label: z.string().trim().min(1).max(80), href: z.string().trim().min(1).max(2000) }).nullable().optional(),
  }),
  nodes: z.array(NodeSchema).max(500).optional(),
  questions: z.array(QuestionSchema).max(500).optional(),
  notes: z.array(NoteSchema).max(2000).optional(),
})

export type PdtFlowFile = z.infer<typeof FlowFileSchema>

export type PdtImportProblem = { where: string; problem: string }

export type PdtImportReport = {
  ok: boolean
  problems: PdtImportProblem[]
  counts: { nodes: number; questions: number; notes: number; nodesToDelete: number }
}

function pathParts(path: string): string[] {
  return path.split('/').map((part) => part.trim()).filter(Boolean)
}

function parentPath(path: string): string | null {
  const parts = pathParts(path)
  return parts.length > 1 ? parts.slice(0, -1).join('/') : null
}

/** Resolve every slug the file names, and say what named nothing.
 *
 *  Nothing is written, and the resolved maps come back with the report so the
 *  real import does not have to look any of it up a second time - one answer,
 *  used twice, rather than two answers that nearly agree. */
async function resolve(file: PdtFlowFile, existingFlowId: string | null) {
  const problems: PdtImportProblem[] = []
  const groups = await listGroups()
  const groupBySlug = new Map(groups.map((group) => [group.slug, group]))
  const filterByRef = new Map<string, string>()
  for (const group of groups) {
    for (const filter of group.filters) filterByRef.set(`${group.slug}/${filter.slug}`, filter.id)
  }

  const nodes = file.nodes ?? []
  const seenPaths = new Set<string>()
  for (const node of nodes) {
    const parts = pathParts(node.path)
    const key = parts.join('/')
    if (parts.length === 0) {
      problems.push({ where: `node "${node.path}"`, problem: 'has no usable path' })
      continue
    }
    if (parts.length > MAX_PICK_DEPTH) {
      problems.push({ where: `node "${key}"`, problem: `is more than ${MAX_PICK_DEPTH} levels deep` })
    }
    if (seenPaths.has(key)) {
      problems.push({ where: `node "${key}"`, problem: 'appears more than once' })
    }
    seenPaths.add(key)
  }
  for (const node of nodes) {
    const parent = parentPath(node.path)
    if (parent && !seenPaths.has(parent)) {
      problems.push({ where: `node "${node.path}"`, problem: `names a parent "${parent}" that the file does not describe` })
    }
    if (node.scope && node.scope.type !== 'ALL' && node.scope.type !== 'FILTERS') {
      if (!node.scope.slug) problems.push({ where: `node "${node.path}"`, problem: `is scoped to a ${node.scope.type.toLowerCase()} but names none` })
      else if (!(await shelfExists(node.scope.type, node.scope.slug))) {
        problems.push({ where: `node "${node.path}"`, problem: `names the ${node.scope.type.toLowerCase()} "${node.scope.slug}", which does not exist in the shop` })
      }
    }
    for (const ref of node.filters ?? []) {
      if (!filterByRef.has(ref)) problems.push({ where: `node "${node.path}"`, problem: `names the filter "${ref}", which does not exist` })
    }
  }

  const flowScope = file.flow.scope
  if (flowScope && flowScope.type !== 'ALL') {
    if (!flowScope.slug) problems.push({ where: 'the flow', problem: `is scoped to a ${flowScope.type.toLowerCase()} but names none` })
    else if (!(await shelfExists(flowScope.type, flowScope.slug))) {
      problems.push({ where: 'the flow', problem: `names the ${flowScope.type.toLowerCase()} "${flowScope.slug}", which does not exist in the shop` })
    }
  }

  for (const question of file.questions ?? []) {
    if (!groupBySlug.has(question.group)) {
      problems.push({ where: `question for "${question.group}"`, problem: 'names a filter group that does not exist' })
    }
    if (question.node && !seenPaths.has(pathParts(question.node).join('/'))) {
      problems.push({ where: `question for "${question.group}"`, problem: `is scoped to the node "${question.node}", which the file does not describe` })
    }
  }

  for (const note of file.notes ?? []) {
    if (!filterByRef.has(note.filter)) {
      problems.push({ where: `note for "${note.filter}"`, problem: 'names a filter that does not exist' })
    }
    if (note.node && !seenPaths.has(pathParts(note.node).join('/'))) {
      problems.push({ where: `note for "${note.filter}"`, problem: `is scoped to the node "${note.node}", which the file does not describe` })
    }
  }

  // The address. A flow taking a slug something else already answers on would
  // not politely lose - see lib/root-slug.ts - so it is refused here rather than
  // discovered by a shopper.
  if (!(await flowSlugAvailable(file.flow.slug, existingFlowId ?? ''))) {
    problems.push({ where: 'the flow', problem: `wants the address "/${file.flow.slug}", which something else already answers on` })
  }

  return { problems, filterByRef, groupBySlug, seenPaths }
}

/** How many of the existing flow's nodes this file would remove. Reported by the
 *  dry run so nobody applies a truncated file to a live site by accident. */
async function nodesToDelete(flowId: string | null, file: PdtFlowFile): Promise<number> {
  if (!flowId) return 0
  const existing = await listNodes(flowId)
  const byId = new Map(existing.map((node) => [node.id, node]))
  const pathOf = (nodeId: string): string => {
    const parts: string[] = []
    let at: string | null = nodeId
    for (let guard = 0; at && guard <= MAX_PICK_DEPTH; guard++) {
      const node = byId.get(at)
      if (!node) break
      parts.unshift(node.slug)
      at = node.parentId
    }
    return parts.join('/')
  }
  const wanted = new Set((file.nodes ?? []).map((node) => pathParts(node.path).join('/')))
  return existing.filter((node) => !wanted.has(pathOf(node.id))).length
}

/** Check a file without writing anything. */
export async function validateFlowFile(file: PdtFlowFile): Promise<PdtImportReport> {
  const existing = await getFlowBySlug(file.flow.slug)
  const { problems } = await resolve(file, existing?.id ?? null)
  return {
    ok: problems.length === 0,
    problems,
    counts: {
      nodes: (file.nodes ?? []).length,
      questions: (file.questions ?? []).length,
      notes: (file.notes ?? []).length,
      nodesToDelete: await nodesToDelete(existing?.id ?? null, file),
    },
  }
}

/**
 * Apply a file. Whole flow or nothing.
 *
 * Refuses outright if the dry run would have reported anything, so the two
 * steps cannot disagree: the same resolver runs, and a file that has drifted
 * since it was checked is refused rather than half-applied.
 */
export async function importFlowFile(file: PdtFlowFile): Promise<{ report: PdtImportReport; flowId: string | null }> {
  const report = await validateFlowFile(file)
  if (!report.ok) return { report, flowId: null }

  const existing = await getFlowBySlug(file.flow.slug)
  const { filterByRef, groupBySlug } = await resolve(file, existing?.id ?? null)
  const flowScope = file.flow.scope ?? { type: 'ALL' as const, slug: null }

  const flowId = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO "pdt_flows" (
        "name", "slug", "status", "heading", "standfirst",
        "first_step_heading", "later_step_heading", "features_heading",
        "scope_type", "scope_slug",
        "meta_title", "meta_description", "og_image", "noindex",
        "show_prices", "allow_skip", "results_per_page", "finish_cta_label", "finish_cta_href", "position"
      ) VALUES (
        ${file.flow.name}, ${file.flow.slug}, ${file.flow.status ?? 'DRAFT'},
        ${file.flow.heading ?? null}, ${file.flow.standfirst ?? null},
        ${file.flow.firstStepHeading ?? null}, ${file.flow.laterStepHeading ?? null}, ${file.flow.featuresHeading ?? null},
        ${flowScope.type}, ${flowScope.slug ?? null},
        ${file.flow.metaTitle ?? null}, ${file.flow.metaDescription ?? null}, ${file.flow.ogImage ?? null},
        ${file.flow.noindex ?? false}, ${file.flow.showPrices ?? true}, ${file.flow.allowSkip ?? true},
        ${file.flow.resultsPerPage ?? 24},
        ${file.flow.finishCta?.label ?? null}, ${file.flow.finishCta?.href ?? null},
        (SELECT COALESCE(MAX("position"), -1) + 1 FROM "pdt_flows")
      )
      ON CONFLICT ("slug") DO UPDATE SET
        "name" = EXCLUDED."name",
        "status" = EXCLUDED."status",
        "heading" = EXCLUDED."heading",
        "standfirst" = EXCLUDED."standfirst",
        "first_step_heading" = EXCLUDED."first_step_heading",
        "later_step_heading" = EXCLUDED."later_step_heading",
        "features_heading" = EXCLUDED."features_heading",
        "scope_type" = EXCLUDED."scope_type",
        "scope_slug" = EXCLUDED."scope_slug",
        "meta_title" = EXCLUDED."meta_title",
        "meta_description" = EXCLUDED."meta_description",
        "og_image" = EXCLUDED."og_image",
        "noindex" = EXCLUDED."noindex",
        "show_prices" = EXCLUDED."show_prices",
        "allow_skip" = EXCLUDED."allow_skip",
        "results_per_page" = EXCLUDED."results_per_page",
        "finish_cta_label" = EXCLUDED."finish_cta_label",
        "finish_cta_href" = EXCLUDED."finish_cta_href",
        "updated_at" = CURRENT_TIMESTAMP
      RETURNING "id"
    `
    const id = rows[0]?.id
    if (!id) throw new Error('pdt_flows upsert returned no row')

    // Nodes, shallowest first, so a child's parent id is always known by the
    // time the child is written. The file's own order sets `position`.
    const nodes = [...(file.nodes ?? [])].sort((a, b) => pathParts(a.path).length - pathParts(b.path).length)
    const idByPath = new Map<string, string>()
    const positionOf = new Map<string, number>()
    for (const node of nodes) {
      const parts = pathParts(node.path)
      const path = parts.join('/')
      const slug = parts[parts.length - 1]!
      const parent = parentPath(path)
      const parentId = parent ? idByPath.get(parent) ?? null : null
      const bucket = parent ?? ''
      const position = positionOf.get(bucket) ?? 0
      positionOf.set(bucket, position + 1)
      const scope = node.scope ?? { type: 'ALL' as const, slug: null }
      const nodeRows = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO "pdt_nodes" (
          "flow_id", "parent_id", "label", "slug", "blurb", "explainer", "best_for", "not_for",
          "image_url", "icon", "scope_type", "scope_slug", "position"
        ) VALUES (
          ${id}, ${parentId}, ${node.label}, ${slug}, ${node.blurb ?? null}, ${node.explainer ?? null},
          ${node.bestFor ?? null}, ${node.notFor ?? null}, ${node.imageUrl ?? null}, ${node.icon ?? null},
          ${scope.type}, ${scope.slug ?? null}, ${position}
        )
        ON CONFLICT ("flow_id", COALESCE("parent_id", ''), "slug") DO UPDATE SET
          "label" = EXCLUDED."label",
          "blurb" = EXCLUDED."blurb",
          "explainer" = EXCLUDED."explainer",
          "best_for" = EXCLUDED."best_for",
          "not_for" = EXCLUDED."not_for",
          "image_url" = EXCLUDED."image_url",
          "icon" = EXCLUDED."icon",
          "scope_type" = EXCLUDED."scope_type",
          "scope_slug" = EXCLUDED."scope_slug",
          "position" = EXCLUDED."position",
          "updated_at" = CURRENT_TIMESTAMP
        RETURNING "id"
      `
      const nodeId = nodeRows[0]?.id
      if (!nodeId) throw new Error(`pdt_nodes upsert returned no row for "${path}"`)
      idByPath.set(path, nodeId)

      await tx.$executeRaw`DELETE FROM "pdt_node_filters" WHERE "node_id" = ${nodeId}`
      const filterIds = (node.filters ?? []).map((ref) => filterByRef.get(ref)).filter((v): v is string => !!v)
      if (filterIds.length > 0) {
        const values = filterIds.map((filterId, at) => Prisma.sql`(${nodeId}, ${filterId}, ${at})`)
        await tx.$executeRaw`
          INSERT INTO "pdt_node_filters" ("node_id", "filter_id", "position")
          VALUES ${Prisma.join(values)}
          ON CONFLICT DO NOTHING
        `
      }
    }

    // The file is the truth: a node it no longer names goes, and its questions
    // and notes go with it through the cascade.
    const keptIds = [...idByPath.values()]
    if (keptIds.length > 0) {
      await tx.$executeRaw`DELETE FROM "pdt_nodes" WHERE "flow_id" = ${id} AND NOT ("id" = ANY(${keptIds}::text[]))`
    } else {
      await tx.$executeRaw`DELETE FROM "pdt_nodes" WHERE "flow_id" = ${id}`
    }

    // Questions: replaced wholesale for this flow, because their order is part
    // of what the file describes and a merge would leave yesterday's ordering
    // interleaved with today's.
    await tx.$executeRaw`DELETE FROM "pdt_questions" WHERE "flow_id" = ${id}`
    let questionAt = 0
    for (const question of file.questions ?? []) {
      const groupId = groupBySlug.get(question.group)?.id
      if (!groupId) continue
      const nodeId = question.node ? idByPath.get(pathParts(question.node).join('/')) ?? null : null
      await tx.$executeRaw`
        INSERT INTO "pdt_questions" ("flow_id", "node_id", "group_id", "heading", "explainer", "importance", "multi", "hidden", "position")
        VALUES (
          ${id}, ${nodeId}, ${groupId}, ${question.heading ?? null}, ${question.explainer ?? null},
          ${question.importance ?? 'PRIMARY'}, ${question.multi ?? true}, ${question.hidden ?? false}, ${questionAt}
        )
        ON CONFLICT ("flow_id", COALESCE("node_id", ''), "group_id") DO UPDATE SET
          "heading" = EXCLUDED."heading",
          "explainer" = EXCLUDED."explainer",
          "importance" = EXCLUDED."importance",
          "multi" = EXCLUDED."multi",
          "hidden" = EXCLUDED."hidden",
          "position" = EXCLUDED."position",
          "updated_at" = CURRENT_TIMESTAMP
      `
      questionAt++
    }

    // Notes are upserted, never cleared: a note with no node scope is global
    // copy shared by every flow on the site, so a file that happens not to
    // mention one has no business deleting it.
    for (const note of file.notes ?? []) {
      const filterId = filterByRef.get(note.filter)
      if (!filterId) continue
      const nodeId = note.node ? idByPath.get(pathParts(note.node).join('/')) ?? null : null
      await tx.$executeRaw`
        INSERT INTO "pdt_option_notes" ("filter_id", "node_id", "explainer", "best_for", "watch_out", "image_url", "learn_more_href")
        VALUES (${filterId}, ${nodeId}, ${note.explainer ?? null}, ${note.bestFor ?? null}, ${note.watchOut ?? null}, ${note.imageUrl ?? null}, ${note.learnMoreHref ?? null})
        ON CONFLICT ("filter_id", COALESCE("node_id", '')) DO UPDATE SET
          "explainer" = EXCLUDED."explainer",
          "best_for" = EXCLUDED."best_for",
          "watch_out" = EXCLUDED."watch_out",
          "image_url" = EXCLUDED."image_url",
          "learn_more_href" = EXCLUDED."learn_more_href",
          "updated_at" = CURRENT_TIMESTAMP
      `
    }

    return id
  }, {
    // A real flow is a few hundred rows, each its own round trip to the
    // database, and Prisma closes an interactive transaction after 5 seconds by
    // default - which a 200-row file blew through from a laptop on the first
    // try. The whole file must land or none of it, so the transaction stays
    // and the limit moves: the time is spent waiting on the wire, not holding
    // locks anything else wants.
    maxWait: 10_000,
    timeout: 120_000,
  })

  return { report, flowId }
}

/** One flow as a file: everything above, read back out by slug. */
export async function exportFlow(flowId: string): Promise<PdtFlowFile | null> {
  const flow = await getFlow(flowId)
  if (!flow) return null
  const [nodes, questions, notes, groups] = await Promise.all([
    listNodes(flowId),
    listQuestions(flowId),
    listNotes(),
    listGroups(),
  ])

  const refByFilterId = new Map<string, string>()
  const slugByGroupId = new Map<string, string>()
  for (const group of groups) {
    slugByGroupId.set(group.id, group.slug)
    for (const filter of group.filters) refByFilterId.set(filter.id, `${group.slug}/${filter.slug}`)
  }

  const byId = new Map(nodes.map((node) => [node.id, node]))
  const pathOf = (nodeId: string): string => {
    const parts: string[] = []
    let at: string | null = nodeId
    for (let guard = 0; at && guard <= MAX_PICK_DEPTH; guard++) {
      const node = byId.get(at)
      if (!node) break
      parts.unshift(node.slug)
      at = node.parentId
    }
    return parts.join('/')
  }

  // Only the notes this flow's nodes actually scope, plus every global one -
  // the file describes one flow, and another flow's node-scoped overrides are
  // not part of it.
  const nodeIds = new Set(nodes.map((node) => node.id))

  return {
    version: 1,
    flow: {
      slug: flow.slug,
      name: flow.name,
      status: flow.status,
      heading: flow.heading,
      standfirst: flow.standfirst,
      firstStepHeading: flow.firstStepHeading,
      laterStepHeading: flow.laterStepHeading,
      featuresHeading: flow.featuresHeading,
      scope: { type: flow.scopeType, slug: flow.scopeSlug },
      metaTitle: flow.metaTitle,
      metaDescription: flow.metaDescription,
      ogImage: flow.ogImage,
      noindex: flow.noindex,
      showPrices: flow.showPrices,
      allowSkip: flow.allowSkip,
      resultsPerPage: flow.resultsPerPage,
      finishCta: flow.finishCtaLabel && flow.finishCtaHref ? { label: flow.finishCtaLabel, href: flow.finishCtaHref } : null,
    },
    nodes: nodes.map((node) => ({
      path: pathOf(node.id),
      label: node.label,
      blurb: node.blurb,
      explainer: node.explainer,
      bestFor: node.bestFor,
      notFor: node.notFor,
      imageUrl: node.imageUrl,
      icon: node.icon,
      scope: { type: node.scopeType, slug: node.scopeSlug },
      filters: node.filterIds.map((id) => refByFilterId.get(id)).filter((ref): ref is string => !!ref),
    })),
    questions: questions.map((question) => ({
      node: question.nodeId ? pathOf(question.nodeId) : null,
      group: slugByGroupId.get(question.groupId) ?? '',
      heading: question.heading,
      explainer: question.explainer,
      importance: question.importance,
      multi: question.multi,
      hidden: question.hidden,
    })).filter((question) => question.group),
    notes: notes
      .filter((note) => note.nodeId === null || nodeIds.has(note.nodeId))
      .map((note) => ({
        filter: refByFilterId.get(note.filterId) ?? '',
        node: note.nodeId ? pathOf(note.nodeId) : null,
        explainer: note.explainer,
        bestFor: note.bestFor,
        watchOut: note.watchOut,
        imageUrl: note.imageUrl,
        learnMoreHref: note.learnMoreHref,
      }))
      .filter((note) => note.filter),
  }
}
