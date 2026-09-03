import { prisma } from '@/lib/db/prisma'
import { Prisma } from '@prisma/client'
import type { PdtFlow, PdtFlowScope, PdtFlowStatus, PdtPuckData } from '@/modules/product-discovery-tool/lib/types'

// Flows: one configured tool each, at an address of its own.

const FLOW_COLUMNS = Prisma.sql`
  "id", "name", "slug", "status", "heading", "standfirst", "intro_puck",
  "first_step_heading", "later_step_heading", "features_heading",
  "scope_type", "scope_slug", "meta_title", "meta_description", "og_image", "noindex",
  "show_prices", "allow_skip", "results_per_page", "finish_cta_label", "finish_cta_href",
  "position", "updated_at"
`

function rowToFlow(row: Record<string, unknown>): PdtFlow {
  return {
    id: row.id as string,
    name: row.name as string,
    slug: row.slug as string,
    status: row.status as PdtFlowStatus,
    heading: (row.heading as string | null) ?? null,
    standfirst: (row.standfirst as string | null) ?? null,
    // jsonb comes back as an already-parsed JS value, and can legitimately be a
    // bare scalar if something ever wrote one - only an object is a document.
    introPuck: row.intro_puck && typeof row.intro_puck === 'object' ? (row.intro_puck as PdtPuckData) : null,
    firstStepHeading: (row.first_step_heading as string | null) ?? null,
    laterStepHeading: (row.later_step_heading as string | null) ?? null,
    featuresHeading: (row.features_heading as string | null) ?? null,
    scopeType: row.scope_type as PdtFlowScope,
    scopeSlug: (row.scope_slug as string | null) ?? null,
    metaTitle: (row.meta_title as string | null) ?? null,
    metaDescription: (row.meta_description as string | null) ?? null,
    ogImage: (row.og_image as string | null) ?? null,
    noindex: (row.noindex as boolean) ?? false,
    showPrices: (row.show_prices as boolean) ?? true,
    allowSkip: (row.allow_skip as boolean) ?? true,
    resultsPerPage: Number(row.results_per_page ?? 24),
    finishCtaLabel: (row.finish_cta_label as string | null) ?? null,
    finishCtaHref: (row.finish_cta_href as string | null) ?? null,
    position: row.position as number,
    updatedAt: row.updated_at as Date,
  }
}

export async function listFlows(): Promise<PdtFlow[]> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT ${FLOW_COLUMNS} FROM "pdt_flows" ORDER BY "position", "created_at"
  `
  return rows.map(rowToFlow)
}

export async function getFlow(id: string): Promise<PdtFlow | null> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT ${FLOW_COLUMNS} FROM "pdt_flows" WHERE "id" = ${id} LIMIT 1
  `
  return rows[0] ? rowToFlow(rows[0]) : null
}

// Deliberately matches a DRAFT row as well as a PUBLISHED one: the storefront
// page decides what an unpublished flow does (404 for the public, previewable
// for staff), and a lookup that hid drafts would take that decision away.
export async function getFlowBySlug(slug: string): Promise<PdtFlow | null> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT ${FLOW_COLUMNS} FROM "pdt_flows" WHERE "slug" = ${slug} LIMIT 1
  `
  return rows[0] ? rowToFlow(rows[0]) : null
}

/** Does any flow answer at this bare slug? The root-slug claim's question. */
export async function flowSlugExists(slug: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "pdt_flows" WHERE "slug" = ${slug} LIMIT 1
  `
  return rows.length > 0
}

async function flowSlugTaken(slug: string, excludeId: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "pdt_flows" WHERE "slug" = ${slug} AND "id" <> ${excludeId} LIMIT 1
  `
  return rows.length > 0
}

// A bare top-level slug is shared ground: an info page, a module's public index,
// a shop product on the root URL style, a gazette post and a filter collection
// all live there.
//
// This check is load-bearing rather than tidiness. Core rules out info pages and
// module indexes before it asks any module at all, so those always win - but
// among the module claims it asks in registry order, which is alphabetical, and
// "product-discovery-tool" sorts after "filters-for-shop" and before "shop".
// So a filter collection at the same slug beats a flow, and a flow would beat a
// product or a post. A flow saved on a product's slug would not politely lose;
// it would take that product's page over. The slug walks on until it finds free
// ground instead.
//
// Tables belonging to modules that may not be installed. Shop and filters are
// hard dependencies so theirs are always there; gazette's is not, and neither is
// anything a future module adds.
//
// A fixed list, and the ONLY thing ever interpolated into the statement below.
const OPTIONAL_SLUG_TABLES = ['flt_collections', 'shp_products', 'shp_categories', 'gz_posts'] as const

// Asked in two passes, and that is not tidiness.
//
// The obvious version guards each table inline -
// `to_regclass('public.gz_posts') IS NOT NULL AND EXISTS (SELECT 1 FROM
// "gz_posts" ...)` - and it does not work: Postgres resolves every relation in a
// statement while PARSING it, long before any condition is evaluated, so the
// whole statement fails with `relation "gz_posts" does not exist` on a site
// without gazette. The guard reads as a defence and is none. Found by running
// the statement against a database that genuinely lacked the table, which is the
// only way this class of thing is ever found.
//
// So: ask which of them exist (to_regclass over a list of NAMES, which the
// parser never has to resolve), then ask each survivor on its own.
async function slugOwnedElsewhere(slug: string): Promise<boolean> {
  const core = await prisma.$queryRaw<{ taken: boolean }[]>`
    SELECT EXISTS (SELECT 1 FROM "InfoPage" WHERE "slug" = ${slug}) AS taken
  `
  if (core[0]?.taken === true) return true

  const present = await prisma.$queryRaw<{ name: string }[]>`
    SELECT t.name FROM unnest(${[...OPTIONAL_SLUG_TABLES]}::text[]) AS t(name)
    WHERE to_regclass('public.' || t.name) IS NOT NULL
  `
  for (const { name } of present) {
    // Interpolated, so checked against the list it came from rather than trusted
    // because it came back from the database.
    if (!(OPTIONAL_SLUG_TABLES as readonly string[]).includes(name)) continue
    const rows = await prisma.$queryRawUnsafe<{ taken: boolean }[]>(
      `SELECT EXISTS (SELECT 1 FROM "${name}" WHERE "slug" = $1) AS taken`,
      slug,
    )
    if (rows[0]?.taken === true) return true
  }
  return false
}

export async function ensureUniqueFlowSlug(base: string, excludeId = ''): Promise<string> {
  const stem = base || 'find-your-product'
  let slug = stem
  for (let n = 2; (await flowSlugTaken(slug, excludeId)) || (await slugOwnedElsewhere(slug)); n++) {
    slug = `${stem}-${n}`
  }
  return slug
}

/** Is this slug free for a flow to take? The admin's save-time answer, so the
 *  refusal carries a sentence rather than the flow quietly renaming itself. */
export async function flowSlugAvailable(slug: string, excludeId = ''): Promise<boolean> {
  return !(await flowSlugTaken(slug, excludeId)) && !(await slugOwnedElsewhere(slug))
}

export async function createFlow(fields: { name: string; slug: string; scopeType: PdtFlowScope; scopeSlug: string | null }): Promise<{ id: string }> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    INSERT INTO "pdt_flows" ("name", "slug", "scope_type", "scope_slug", "position")
    VALUES (${fields.name}, ${fields.slug}, ${fields.scopeType}, ${fields.scopeSlug},
      (SELECT COALESCE(MAX("position"), -1) + 1 FROM "pdt_flows"))
    RETURNING "id"
  `
  const row = rows[0]
  if (!row) throw new Error('pdt_flows insert returned no row')
  return { id: row.id }
}

export type PdtFlowUpdate = {
  name?: string
  slug?: string
  status?: PdtFlowStatus
  heading?: string | null
  standfirst?: string | null
  // Whatever the builder PUT, on its way to a jsonb column. Deliberately not
  // PdtPuckData: nothing on the write path reads the document, Puck owns its own
  // schema, and pretending to validate it here would only be a lie with a cast.
  introPuck?: Record<string, unknown> | null
  firstStepHeading?: string | null
  laterStepHeading?: string | null
  featuresHeading?: string | null
  scopeType?: PdtFlowScope
  scopeSlug?: string | null
  metaTitle?: string | null
  metaDescription?: string | null
  ogImage?: string | null
  noindex?: boolean
  showPrices?: boolean
  allowSkip?: boolean
  resultsPerPage?: number
  finishCtaLabel?: string | null
  finishCtaHref?: string | null
}

// Every nullable field is tri-state: undefined leaves it alone, null clears it.
export async function updateFlow(id: string, fields: PdtFlowUpdate): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "pdt_flows" SET
      "name" = COALESCE(${fields.name ?? null}, "name"),
      "slug" = COALESCE(${fields.slug ?? null}, "slug"),
      "status" = COALESCE(${fields.status ?? null}, "status"),
      "heading" = CASE WHEN ${fields.heading !== undefined} THEN ${fields.heading ?? null} ELSE "heading" END,
      "standfirst" = CASE WHEN ${fields.standfirst !== undefined} THEN ${fields.standfirst ?? null} ELSE "standfirst" END,
      "intro_puck" = CASE WHEN ${fields.introPuck !== undefined} THEN ${JSON.stringify(fields.introPuck ?? null)}::jsonb ELSE "intro_puck" END,
      "first_step_heading" = CASE WHEN ${fields.firstStepHeading !== undefined} THEN ${fields.firstStepHeading ?? null} ELSE "first_step_heading" END,
      "later_step_heading" = CASE WHEN ${fields.laterStepHeading !== undefined} THEN ${fields.laterStepHeading ?? null} ELSE "later_step_heading" END,
      "features_heading" = CASE WHEN ${fields.featuresHeading !== undefined} THEN ${fields.featuresHeading ?? null} ELSE "features_heading" END,
      "scope_type" = COALESCE(${fields.scopeType ?? null}, "scope_type"),
      "scope_slug" = CASE WHEN ${fields.scopeSlug !== undefined} THEN ${fields.scopeSlug ?? null} ELSE "scope_slug" END,
      "meta_title" = CASE WHEN ${fields.metaTitle !== undefined} THEN ${fields.metaTitle ?? null} ELSE "meta_title" END,
      "meta_description" = CASE WHEN ${fields.metaDescription !== undefined} THEN ${fields.metaDescription ?? null} ELSE "meta_description" END,
      "og_image" = CASE WHEN ${fields.ogImage !== undefined} THEN ${fields.ogImage ?? null} ELSE "og_image" END,
      "noindex" = COALESCE(${fields.noindex ?? null}::boolean, "noindex"),
      "show_prices" = COALESCE(${fields.showPrices ?? null}::boolean, "show_prices"),
      "allow_skip" = COALESCE(${fields.allowSkip ?? null}::boolean, "allow_skip"),
      "results_per_page" = COALESCE(${fields.resultsPerPage ?? null}::integer, "results_per_page"),
      "finish_cta_label" = CASE WHEN ${fields.finishCtaLabel !== undefined} THEN ${fields.finishCtaLabel ?? null} ELSE "finish_cta_label" END,
      "finish_cta_href" = CASE WHEN ${fields.finishCtaHref !== undefined} THEN ${fields.finishCtaHref ?? null} ELSE "finish_cta_href" END,
      "updated_at" = CURRENT_TIMESTAMP
    WHERE "id" = ${id}
  `
}

export async function deleteFlow(id: string): Promise<void> {
  await prisma.$executeRaw`DELETE FROM "pdt_flows" WHERE "id" = ${id}`
}

export async function reorderFlows(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  await prisma.$executeRaw`
    UPDATE "pdt_flows" SET "position" = u.ord
    FROM (SELECT unnest(${ids}::text[]) AS id, generate_subscripts(${ids}::text[], 1) - 1 AS ord) u
    WHERE "pdt_flows"."id" = u.id
  `
}
