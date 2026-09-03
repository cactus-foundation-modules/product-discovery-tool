import { prisma } from '@/lib/db/prisma'
import { Prisma } from '@prisma/client'
import type { PdtImportance, PdtQuestion } from '@/modules/product-discovery-tool/lib/types'

// The features step's curation rows. Optional by design - see lib/questions.ts.

const QUESTION_COLUMNS = Prisma.sql`
  "id", "flow_id", "node_id", "group_id", "heading", "explainer",
  "importance", "multi", "position", "hidden"
`

function rowToQuestion(row: Record<string, unknown>): PdtQuestion {
  return {
    id: row.id as string,
    flowId: row.flow_id as string,
    nodeId: (row.node_id as string | null) ?? null,
    groupId: row.group_id as string,
    heading: (row.heading as string | null) ?? null,
    explainer: (row.explainer as string | null) ?? null,
    importance: row.importance as PdtImportance,
    multi: (row.multi as boolean) ?? true,
    position: row.position as number,
    hidden: (row.hidden as boolean) ?? false,
  }
}

export async function listQuestions(flowId: string): Promise<PdtQuestion[]> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT ${QUESTION_COLUMNS} FROM "pdt_questions" WHERE "flow_id" = ${flowId} ORDER BY "position", "created_at"
  `
  return rows.map(rowToQuestion)
}

export async function getQuestion(id: string): Promise<PdtQuestion | null> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT ${QUESTION_COLUMNS} FROM "pdt_questions" WHERE "id" = ${id} LIMIT 1
  `
  return rows[0] ? rowToQuestion(rows[0]) : null
}

/** Create or update the row for one (flow, node, group) triple.
 *
 *  Upsert rather than insert-then-catch: the Questions tab edits a row that may
 *  or may not exist yet - an uncurated group is a group with no row - and making
 *  the screen track which is which would only be a way to get it wrong. The
 *  conflict target is the expression index from 001, so it has to be spelled the
 *  same way here. */
export async function upsertQuestion(fields: {
  flowId: string
  nodeId: string | null
  groupId: string
  heading?: string | null
  explainer?: string | null
  importance?: PdtImportance
  multi?: boolean
  hidden?: boolean
}): Promise<{ id: string }> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    INSERT INTO "pdt_questions" ("flow_id", "node_id", "group_id", "heading", "explainer", "importance", "multi", "hidden", "position")
    VALUES (
      ${fields.flowId}, ${fields.nodeId}, ${fields.groupId},
      ${fields.heading ?? null}, ${fields.explainer ?? null},
      ${fields.importance ?? 'PRIMARY'}, ${fields.multi ?? true}, ${fields.hidden ?? false},
      (SELECT COALESCE(MAX("position"), -1) + 1 FROM "pdt_questions" WHERE "flow_id" = ${fields.flowId})
    )
    ON CONFLICT ("flow_id", COALESCE("node_id", ''), "group_id") DO UPDATE SET
      "heading" = CASE WHEN ${fields.heading !== undefined} THEN ${fields.heading ?? null} ELSE "pdt_questions"."heading" END,
      "explainer" = CASE WHEN ${fields.explainer !== undefined} THEN ${fields.explainer ?? null} ELSE "pdt_questions"."explainer" END,
      "importance" = COALESCE(${fields.importance ?? null}, "pdt_questions"."importance"),
      "multi" = COALESCE(${fields.multi ?? null}::boolean, "pdt_questions"."multi"),
      "hidden" = COALESCE(${fields.hidden ?? null}::boolean, "pdt_questions"."hidden"),
      "updated_at" = CURRENT_TIMESTAMP
    RETURNING "id"
  `
  const row = rows[0]
  if (!row) throw new Error('pdt_questions upsert returned no row')
  return { id: row.id }
}

export async function deleteQuestion(id: string): Promise<void> {
  await prisma.$executeRaw`DELETE FROM "pdt_questions" WHERE "id" = ${id}`
}

export async function reorderQuestions(flowId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return
  await prisma.$executeRaw`
    UPDATE "pdt_questions" SET "position" = u.ord
    FROM (SELECT unnest(${ids}::text[]) AS id, generate_subscripts(${ids}::text[], 1) - 1 AS ord) u
    WHERE "pdt_questions"."id" = u.id AND "pdt_questions"."flow_id" = ${flowId}
  `
}
