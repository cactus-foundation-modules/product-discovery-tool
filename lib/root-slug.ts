import { flowSlugExists } from '@/modules/product-discovery-tool/lib/db/flows'

// Answers core's "does any module own this bare slug?" question, registered
// through publicRootSlug in cactus.module.json.
//
// Core asks only after it has failed to find an info page or a module index at
// the slug, so core content always wins a collision. It asks the MODULES in
// registry order, which is alphabetical - "filters-for-shop" sorts ahead of
// "product-discovery-tool", which sorts ahead of "shop" - so a filter collection
// at the same address beats a flow, and a flow beats a product or a post. That
// is why a flow's slug is checked against all of them at SAVE time (see
// flowSlugAvailable) rather than left to lose gracefully at request time.
//
// Deliberately matches a DRAFT row as well as a PUBLISHED one: the page itself
// decides what an unpublished flow shows to whom, and claiming only published
// ones would 404 staff out of their own preview.
export async function discoveryClaimsRootSlug(slug: string): Promise<boolean> {
  return flowSlugExists(slug)
}
