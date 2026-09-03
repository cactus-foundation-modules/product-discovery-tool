import { prisma } from '@/lib/db/prisma'
import type { MenuEntityKind, MenuEntityProvider, MenuEntitySearchResult, ResolvedMenuEntity } from '@/lib/modules/menu-entity-provider'

// Contributes to the "core.menu-entity-provider" extension point, so a flow can
// be picked in the site menu builder the way a category or a post can - the
// whole point of a flow being a page is that somebody links to it.

const KINDS: MenuEntityKind[] = [{ id: 'flow', label: 'Guided flow' }]

function listKinds(): MenuEntityKind[] {
  return KINDS
}

async function searchEntities(kind: string, query: string): Promise<MenuEntitySearchResult[]> {
  if (kind !== 'flow') return []
  const rows = await prisma.$queryRaw<Array<{ id: string; name: string; status: string }>>`
    SELECT "id", "name", "status" FROM "pdt_flows"
    WHERE "name" ILIKE ${`%${query}%`}
    ORDER BY "position", "created_at" LIMIT 20
  `
  return rows.map((row) => ({ id: row.id, label: row.name, hint: row.status !== 'PUBLISHED' ? row.status : undefined }))
}

async function resolveOne(row: { name: string; slug: string; status: string; heading: string | null }): Promise<ResolvedMenuEntity> {
  return {
    label: row.heading || row.name,
    href: `/${row.slug}`,
    // A draft flow still appears in the admin menu table - it is a real row -
    // but core drops it from the public menu, which is right: the page itself
    // 404s for anyone who is not staff.
    publiclyVisible: row.status === 'PUBLISHED',
  }
}

async function resolveEntity(kind: string, id: string): Promise<ResolvedMenuEntity | null> {
  if (kind !== 'flow') return null
  const rows = await prisma.$queryRaw<Array<{ name: string; slug: string; status: string; heading: string | null }>>`
    SELECT "name", "slug", "status", "heading" FROM "pdt_flows" WHERE "id" = ${id} LIMIT 1
  `
  const row = rows[0]
  return row ? resolveOne(row) : null
}

// The same answer for a whole set of ids in one query. Worth implementing: a
// menu is resolved on every single page render, and one query per item is how
// a header ends up waiting on seven serial round trips.
async function resolveEntities(kind: string, ids: string[]): Promise<Map<string, ResolvedMenuEntity>> {
  const out = new Map<string, ResolvedMenuEntity>()
  if (kind !== 'flow' || ids.length === 0) return out
  const rows = await prisma.$queryRaw<Array<{ id: string; name: string; slug: string; status: string; heading: string | null }>>`
    SELECT "id", "name", "slug", "status", "heading" FROM "pdt_flows" WHERE "id" = ANY(${ids}::text[])
  `
  for (const row of rows) out.set(row.id, await resolveOne(row))
  return out
}

export const discoveryMenuEntityProvider: MenuEntityProvider = {
  moduleLabel: 'Product Discovery',
  listKinds,
  searchEntities,
  resolveEntity,
  resolveEntities,
}
