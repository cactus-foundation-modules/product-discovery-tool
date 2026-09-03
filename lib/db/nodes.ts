import { prisma } from '@/lib/db/prisma'
import { Prisma } from '@prisma/client'
import type { PdtNode, PdtNodeScope } from '@/modules/product-discovery-tool/lib/types'

// The browse tree, and the filters each node applies.
//
// Read in two flat queries and stitched here, same shape as filters' own db
// layer: every caller wants the whole tree for a flow, and it is tens of rows.

const NODE_COLUMNS = Prisma.sql`
  "id", "flow_id", "parent_id", "label", "slug", "blurb", "explainer",
  "best_for", "not_for", "image_url", "icon", "scope_type", "scope_slug", "position"
`

function rowToNode(row: Record<string, unknown>, filterIds: string[]): PdtNode {
  return {
    id: row.id as string,
    flowId: row.flow_id as string,
    parentId: (row.parent_id as string | null) ?? null,
    label: row.label as string,
    slug: row.slug as string,
    blurb: (row.blurb as string | null) ?? null,
    explainer: (row.explainer as string | null) ?? null,
    bestFor: (row.best_for as string | null) ?? null,
    notFor: (row.not_for as string | null) ?? null,
    imageUrl: (row.image_url as string | null) ?? null,
    icon: (row.icon as string | null) ?? null,
    scopeType: row.scope_type as PdtNodeScope,
    scopeSlug: (row.scope_slug as string | null) ?? null,
    position: row.position as number,
    filterIds,
  }
}

async function filterIdsFor(nodeIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>()
  if (nodeIds.length === 0) return out
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT "node_id", "filter_id" FROM "pdt_node_filters"
    WHERE "node_id" = ANY(${nodeIds}::text[])
    ORDER BY "position"
  `
  for (const row of rows) {
    const id = row.node_id as string
    const list = out.get(id) ?? []
    list.push(row.filter_id as string)
    out.set(id, list)
  }
  return out
}

export async function listNodes(flowId: string): Promise<PdtNode[]> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT ${NODE_COLUMNS} FROM "pdt_nodes" WHERE "flow_id" = ${flowId} ORDER BY "position", "created_at"
  `
  const byNode = await filterIdsFor(rows.map((r) => r.id as string))
  return rows.map((row) => rowToNode(row, byNode.get(row.id as string) ?? []))
}

export async function getNode(id: string): Promise<PdtNode | null> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT ${NODE_COLUMNS} FROM "pdt_nodes" WHERE "id" = ${id} LIMIT 1
  `
  const row = rows[0]
  if (!row) return null
  const byNode = await filterIdsFor([row.id as string])
  return rowToNode(row, byNode.get(row.id as string) ?? [])
}

// COALESCE on the parent, matching the expression index in 001: a plain
// comparison against NULL is never true, so two root nodes with the same slug
// would both read as free.
async function nodeSlugTaken(flowId: string, parentId: string | null, slug: string, excludeId: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "pdt_nodes"
    WHERE "flow_id" = ${flowId}
      AND COALESCE("parent_id", '') = ${parentId ?? ''}
      AND "slug" = ${slug}
      AND "id" <> ${excludeId}
    LIMIT 1
  `
  return rows.length > 0
}

export async function ensureUniqueNodeSlug(flowId: string, parentId: string | null, base: string, excludeId = ''): Promise<string> {
  const stem = base || 'option'
  let slug = stem
  for (let n = 2; await nodeSlugTaken(flowId, parentId, slug, excludeId); n++) slug = `${stem}-${n}`
  return slug
}

export async function createNode(fields: {
  flowId: string
  parentId: string | null
  label: string
  slug: string
  scopeType?: PdtNodeScope
  scopeSlug?: string | null
}): Promise<{ id: string }> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    INSERT INTO "pdt_nodes" ("flow_id", "parent_id", "label", "slug", "scope_type", "scope_slug", "position")
    VALUES (${fields.flowId}, ${fields.parentId}, ${fields.label}, ${fields.slug},
      ${fields.scopeType ?? 'ALL'}, ${fields.scopeSlug ?? null},
      (SELECT COALESCE(MAX("position"), -1) + 1 FROM "pdt_nodes"
        WHERE "flow_id" = ${fields.flowId} AND COALESCE("parent_id", '') = ${fields.parentId ?? ''}))
    RETURNING "id"
  `
  const row = rows[0]
  if (!row) throw new Error('pdt_nodes insert returned no row')
  return { id: row.id }
}

export type PdtNodeUpdate = {
  label?: string
  slug?: string
  blurb?: string | null
  explainer?: string | null
  bestFor?: string | null
  notFor?: string | null
  imageUrl?: string | null
  icon?: string | null
  scopeType?: PdtNodeScope
  scopeSlug?: string | null
  parentId?: string | null
}

export async function updateNode(id: string, fields: PdtNodeUpdate): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "pdt_nodes" SET
      "label" = COALESCE(${fields.label ?? null}, "label"),
      "slug" = COALESCE(${fields.slug ?? null}, "slug"),
      "blurb" = CASE WHEN ${fields.blurb !== undefined} THEN ${fields.blurb ?? null} ELSE "blurb" END,
      "explainer" = CASE WHEN ${fields.explainer !== undefined} THEN ${fields.explainer ?? null} ELSE "explainer" END,
      "best_for" = CASE WHEN ${fields.bestFor !== undefined} THEN ${fields.bestFor ?? null} ELSE "best_for" END,
      "not_for" = CASE WHEN ${fields.notFor !== undefined} THEN ${fields.notFor ?? null} ELSE "not_for" END,
      "image_url" = CASE WHEN ${fields.imageUrl !== undefined} THEN ${fields.imageUrl ?? null} ELSE "image_url" END,
      "icon" = CASE WHEN ${fields.icon !== undefined} THEN ${fields.icon ?? null} ELSE "icon" END,
      "scope_type" = COALESCE(${fields.scopeType ?? null}, "scope_type"),
      "scope_slug" = CASE WHEN ${fields.scopeSlug !== undefined} THEN ${fields.scopeSlug ?? null} ELSE "scope_slug" END,
      "parent_id" = CASE WHEN ${fields.parentId !== undefined} THEN ${fields.parentId ?? null} ELSE "parent_id" END,
      "updated_at" = CURRENT_TIMESTAMP
    WHERE "id" = ${id}
  `
}

export async function deleteNode(id: string): Promise<void> {
  await prisma.$executeRaw`DELETE FROM "pdt_nodes" WHERE "id" = ${id}`
}

/** Re-order one level of one flow's tree. Scoped to the flow and the parent, so
 *  a list of ids from another branch cannot renumber this one. */
export async function reorderNodes(flowId: string, parentId: string | null, ids: string[]): Promise<void> {
  if (ids.length === 0) return
  await prisma.$executeRaw`
    UPDATE "pdt_nodes" SET "position" = u.ord
    FROM (SELECT unnest(${ids}::text[]) AS id, generate_subscripts(${ids}::text[], 1) - 1 AS ord) u
    WHERE "pdt_nodes"."id" = u.id
      AND "pdt_nodes"."flow_id" = ${flowId}
      AND COALESCE("pdt_nodes"."parent_id", '') = ${parentId ?? ''}
  `
}

/** Replaces a node's applied-filter set wholesale. The admin always sends the
 *  full list, so a diff would only re-derive what it already has. Unknown filter
 *  ids are refused by the foreign key rather than accepted and left dangling. */
export async function setNodeFilters(nodeId: string, filterIds: string[]): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`DELETE FROM "pdt_node_filters" WHERE "node_id" = ${nodeId}`
    if (filterIds.length === 0) return
    const values = filterIds.map((filterId, i) => Prisma.sql`(${nodeId}, ${filterId}, ${i})`)
    await tx.$executeRaw`
      INSERT INTO "pdt_node_filters" ("node_id", "filter_id", "position")
      VALUES ${Prisma.join(values)}
      ON CONFLICT DO NOTHING
    `
  })
}
