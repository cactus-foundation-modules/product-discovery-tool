import { prisma } from '@/lib/db/prisma'
import { Prisma } from '@prisma/client'
import type { PdtOptionNote } from '@/modules/product-discovery-tool/lib/types'

// The teaching copy, per filter. Written once and reused by every flow, with an
// optional node-scoped override - see lib/compare.ts for how the right one is
// picked at a point in the tree.

const NOTE_COLUMNS = Prisma.sql`
  "id", "filter_id", "node_id", "explainer", "best_for", "watch_out", "image_url", "learn_more_href"
`

function rowToNote(row: Record<string, unknown>): PdtOptionNote {
  return {
    id: row.id as string,
    filterId: row.filter_id as string,
    nodeId: (row.node_id as string | null) ?? null,
    explainer: (row.explainer as string | null) ?? null,
    bestFor: (row.best_for as string | null) ?? null,
    watchOut: (row.watch_out as string | null) ?? null,
    imageUrl: (row.image_url as string | null) ?? null,
    learnMoreHref: (row.learn_more_href as string | null) ?? null,
  }
}

/** Every note there is. Small by construction - one row per filter, plus the
 *  handful of node-scoped overrides - and the Guidance tab wants the lot to
 *  report coverage. */
export async function listNotes(): Promise<PdtOptionNote[]> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT ${NOTE_COLUMNS} FROM "pdt_option_notes"
  `
  return rows.map(rowToNote)
}

export async function upsertNote(fields: {
  filterId: string
  nodeId: string | null
  explainer?: string | null
  bestFor?: string | null
  watchOut?: string | null
  imageUrl?: string | null
  learnMoreHref?: string | null
}): Promise<{ id: string }> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    INSERT INTO "pdt_option_notes" ("filter_id", "node_id", "explainer", "best_for", "watch_out", "image_url", "learn_more_href")
    VALUES (
      ${fields.filterId}, ${fields.nodeId},
      ${fields.explainer ?? null}, ${fields.bestFor ?? null}, ${fields.watchOut ?? null},
      ${fields.imageUrl ?? null}, ${fields.learnMoreHref ?? null}
    )
    ON CONFLICT ("filter_id", COALESCE("node_id", '')) DO UPDATE SET
      "explainer" = CASE WHEN ${fields.explainer !== undefined} THEN ${fields.explainer ?? null} ELSE "pdt_option_notes"."explainer" END,
      "best_for" = CASE WHEN ${fields.bestFor !== undefined} THEN ${fields.bestFor ?? null} ELSE "pdt_option_notes"."best_for" END,
      "watch_out" = CASE WHEN ${fields.watchOut !== undefined} THEN ${fields.watchOut ?? null} ELSE "pdt_option_notes"."watch_out" END,
      "image_url" = CASE WHEN ${fields.imageUrl !== undefined} THEN ${fields.imageUrl ?? null} ELSE "pdt_option_notes"."image_url" END,
      "learn_more_href" = CASE WHEN ${fields.learnMoreHref !== undefined} THEN ${fields.learnMoreHref ?? null} ELSE "pdt_option_notes"."learn_more_href" END,
      "updated_at" = CURRENT_TIMESTAMP
    RETURNING "id"
  `
  const row = rows[0]
  if (!row) throw new Error('pdt_option_notes upsert returned no row')
  return { id: row.id }
}

export async function deleteNote(id: string): Promise<void> {
  await prisma.$executeRaw`DELETE FROM "pdt_option_notes" WHERE "id" = ${id}`
}
