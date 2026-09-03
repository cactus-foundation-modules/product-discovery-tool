import type { MetadataRoute } from 'next'
import { prisma } from '@/lib/db/prisma'
import { getShopConfigCached } from '@/modules/shop/lib/config'

// A flow's own address, for the sitemap. Scanned by
// scripts/generate-module-router.mjs, which looks for this exact export name in
// modules/<name>/lib/sitemap.ts.
//
// Only the flow's bare address, never a step: the wizard keeps its whole state
// in the query string precisely so it never mints thin duplicate pages, and
// listing every combination would be advertising a few thousand near-identical
// ones. Published and not marked noindex only, and nothing at all from a closed
// shop - the pages themselves turn shoppers away, so advertising them for
// indexing would work against the setting.
export async function getPublicSitemapEntries(siteUrl: string): Promise<MetadataRoute.Sitemap> {
  if ((await getShopConfigCached()).shopStatus === 'CLOSED') return []

  const rows = await prisma.$queryRaw<Array<{ slug: string; updated_at: Date }>>`
    SELECT "slug", "updated_at" FROM "pdt_flows"
    WHERE "status" = 'PUBLISHED' AND "noindex" = false
  `

  return rows.map((row) => ({
    url: `${siteUrl}/${row.slug}`,
    lastModified: row.updated_at,
    changeFrequency: 'monthly' as const,
    priority: 0.5,
  }))
}
