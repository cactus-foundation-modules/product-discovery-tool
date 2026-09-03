import { prisma } from '@/lib/db/prisma'

// Provider for the core.media-usage-providers extension point.
//
// Without it, every picture in a guided flow - the browse cards, the option
// illustrations, a flow's share image and everything inside its designed intro -
// reads as unused on the media screen and is offered up for deletion. Core folds
// whatever comes back into the haystack it already scans page and layout JSON
// with, so handing over the raw intro document is enough for it to find the
// urls, keys and ids inside.
export async function discoveryMediaUsageProvider(): Promise<string[]> {
  const [nodes, notes, flows] = await Promise.all([
    prisma.$queryRaw<{ ref: string | null }[]>`
      SELECT "image_url" AS ref FROM "pdt_nodes" WHERE "image_url" IS NOT NULL
    `,
    prisma.$queryRaw<{ ref: string | null }[]>`
      SELECT "image_url" AS ref FROM "pdt_option_notes" WHERE "image_url" IS NOT NULL
    `,
    prisma.$queryRaw<{ og: string | null; intro: string | null }[]>`
      SELECT "og_image" AS og, "intro_puck"::text AS intro FROM "pdt_flows"
      WHERE "og_image" IS NOT NULL OR "intro_puck" IS NOT NULL
    `,
  ])

  return [
    ...nodes.map((r) => r.ref),
    ...notes.map((r) => r.ref),
    ...flows.flatMap((r) => [r.og, r.intro]),
  ].filter((r): r is string => !!r)
}
