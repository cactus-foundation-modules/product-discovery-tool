import { getProductCategoryIdsForProducts, getProductCollectionIdsForProducts, getProductTagIdsForProducts } from '@/modules/shop/lib/db/products'
import { getCategoryBySlug, getCategoryDescendantIds, getCollectionBySlug, getTagBySlug } from '@/modules/shop/lib/db/catalogue'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { listGridProducts } from '@/modules/shop/lib/grid-page'
import type { ShopGridScope } from '@/modules/shop/lib/grid-page-types'
import type { ShpProduct } from '@/modules/shop/lib/types'
import type { PdtShelf } from '@/modules/product-discovery-tool/lib/resolve'

// Turning shelves into products, and products into "which nodes is this on".
//
// The whole flow's product set is resolved ONCE per render and every browse
// count is then worked out in memory against it. A step offering five types is
// one product query, not five, and the counts on the cards are the same numbers
// the next step will show - which is the only way a count can be trusted.

/** The key a shelf is remembered under. Type and slug, because a category and a
 *  tag may perfectly well share a slug and mean different products. */
export function shelfKey(shelf: PdtShelf): string {
  return `${shelf.type}:${shelf.slug}`
}

/** The shop query one shelf describes. Shop's own authorising query runs behind
 *  it, so a flow can never reach a product a category page would not list. */
function scopeFor(shelf: PdtShelf | null, fetchCount: number): ShopGridScope {
  return {
    categorySlug: shelf?.type === 'CATEGORY' ? shelf.slug : undefined,
    collectionSlug: shelf?.type === 'COLLECTION' ? shelf.slug : undefined,
    tagSlug: shelf?.type === 'TAG' ? shelf.slug : undefined,
    fetchCount,
  }
}

/**
 * The products a chain of shelves leaves, intersected.
 *
 * The narrowest shelf - the last one down the chain - runs as the query, and
 * every other shelf is then applied as a membership test over what came back.
 * That is the honest reading of "a node inherits its ancestors' scope": a child
 * naming a category outside its parent's leaves nothing, which is the
 * configuration error the Flow tab reports as a live count of zero, rather than
 * quietly widening the page to whichever shelf happened to run.
 */
export async function loadScopedProducts(shelves: readonly PdtShelf[], fetchCount: number): Promise<ShpProduct[]> {
  const narrowest = shelves.length > 0 ? shelves[shelves.length - 1]! : null
  const products = await listGridProducts(scopeFor(narrowest, fetchCount))
  const others = shelves.slice(0, -1)
  if (products.length === 0 || others.length === 0) return products
  const members = await loadShelfMembers(products.map((p) => p.id), others)
  return products.filter((product) => others.every((shelf) => members.get(shelfKey(shelf))?.has(product.id) === true))
}

/**
 * Which of these products sit on each of these shelves.
 *
 * Three membership reads at most, whatever the shelf count: the category,
 * collection and tag ids of the whole product set, fetched once and then asked
 * repeatedly. A shelf naming something that no longer exists comes back as an
 * EMPTY set rather than being left out, so a node pointing at a deleted category
 * shows a count of zero instead of behaving as if it had no scope at all.
 */
export async function loadShelfMembers(productIds: readonly string[], shelves: readonly PdtShelf[]): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>()
  if (shelves.length === 0) return out
  const wanted = new Map<string, PdtShelf>()
  for (const shelf of shelves) wanted.set(shelfKey(shelf), shelf)
  for (const key of wanted.keys()) out.set(key, new Set())
  if (productIds.length === 0) return out

  const ids = [...productIds]
  const kinds = new Set([...wanted.values()].map((s) => s.type))
  const [config, categoryIds, collectionIds, tagIds] = await Promise.all([
    getShopConfigCached(),
    kinds.has('CATEGORY') ? getProductCategoryIdsForProducts(ids) : Promise.resolve(new Map<string, string[]>()),
    kinds.has('COLLECTION') ? getProductCollectionIdsForProducts(ids) : Promise.resolve(new Map<string, string[]>()),
    kinds.has('TAG') ? getProductTagIdsForProducts(ids) : Promise.resolve(new Map<string, string[]>()),
  ])

  for (const [key, shelf] of wanted) {
    const set = out.get(key)!
    if (shelf.type === 'CATEGORY') {
      const category = await getCategoryBySlug(shelf.slug)
      if (!category) continue
      // The category's own display mode decides whether a parent stands for its
      // sub-tree, exactly as a category page does - resolved through shop's own
      // rule so a node and the category page it names never disagree.
      const mode = category.productDisplayMode ?? config.categoryProductDisplayMode
      const allowed = new Set(mode === 'exact' ? [category.id] : await getCategoryDescendantIds(category.id))
      for (const id of ids) {
        if ((categoryIds.get(id) ?? []).some((c) => allowed.has(c))) set.add(id)
      }
      continue
    }
    if (shelf.type === 'COLLECTION') {
      const collection = await getCollectionBySlug(shelf.slug)
      if (!collection) continue
      for (const id of ids) {
        if ((collectionIds.get(id) ?? []).includes(collection.id)) set.add(id)
      }
      continue
    }
    const tag = await getTagBySlug(shelf.slug)
    if (!tag) continue
    for (const id of ids) {
      if ((tagIds.get(id) ?? []).includes(tag.id)) set.add(id)
    }
  }

  return out
}

/** Does the category/collection/tag a scope names still exist? ALL and FILTERS
 *  always do - neither names a shelf. Used by the admin to flag a node left
 *  pointing at something deleted since. */
export async function shelfExists(type: string, slug: string | null): Promise<boolean> {
  if (type === 'ALL' || type === 'FILTERS') return true
  if (!slug) return false
  if (type === 'CATEGORY') return (await getCategoryBySlug(slug)) !== null
  if (type === 'COLLECTION') return (await getCollectionBySlug(slug)) !== null
  if (type === 'TAG') return (await getTagBySlug(slug)) !== null
  return false
}
