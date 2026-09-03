import { prisma } from '@/lib/db/prisma'
import type { PdtStatKind, PdtStatRow } from '@/modules/product-discovery-tool/lib/types'

// Aggregate counters. One row per (flow, day, step, choice, kind), incremented
// in place - no visitor row, no identifier, no cookie, so this needs no consent
// category and says nothing about anybody.

/** Bump one counter. `day` is the UTC date, which is deliberate: the counters
 *  answer "which options does nobody pick" and "where do people leave", and a
 *  day boundary an hour out changes neither answer. */
export async function bumpStat(flowId: string, stepKey: string, choiceKey: string, kind: PdtStatKind): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO "pdt_stats" ("flow_id", "day", "step_key", "choice_key", "kind", "count")
    VALUES (${flowId}, (NOW() AT TIME ZONE 'UTC')::date, ${stepKey}, ${choiceKey}, ${kind}, 1)
    ON CONFLICT ("flow_id", "day", "step_key", "choice_key", "kind")
    DO UPDATE SET "count" = "pdt_stats"."count" + 1
  `
}

/** The last `days` days of one flow's counters, newest day first.
 *
 *  `day` comes back as a DATE, which Prisma hands over as a JS Date at UTC
 *  midnight; it is formatted here rather than in the screen so the Insights tab
 *  never has to reason about a timezone the column does not have. */
export async function readStats(flowId: string, days = 90): Promise<PdtStatRow[]> {
  const window = Math.max(1, Math.min(365, Math.floor(days) || 90))
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT "day", "step_key", "choice_key", "kind", "count"
      FROM "pdt_stats"
     WHERE "flow_id" = ${flowId}
       AND "day" >= ((NOW() AT TIME ZONE 'UTC')::date - ${window}::integer)
     ORDER BY "day" DESC, "count" DESC
  `
  return rows.map((row) => ({
    day: (row.day as Date).toISOString().slice(0, 10),
    stepKey: row.step_key as string,
    choiceKey: row.choice_key as string,
    kind: row.kind as PdtStatKind,
    count: Number(row.count ?? 0),
  }))
}
