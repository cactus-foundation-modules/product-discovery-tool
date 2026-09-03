'use server'

import { getShopConfigCached } from '@/modules/shop/lib/config'
import { resolveCardTemplate } from '@/modules/shop/lib/card-template'
import { buildGridCardItems } from '@/modules/shop/lib/grid-page'
import { pickWindow } from '@/modules/shop/lib/grid-window'
import { loadScopedProducts } from '@/modules/product-discovery-tool/lib/catalogue'
import { renderDiscoveryCards } from '@/modules/product-discovery-tool/lib/discovery-cards'
import type { PdtCardBinding } from '@/modules/product-discovery-tool/lib/cards-binding'

// The server function behind the results grid's paging.
//
// It takes IDS rather than an offset, and that is the whole difference between
// this and shop's own grid: what belongs on screen here is whatever the
// shopper's answers have left, in whatever order they sorted it, and only the
// browser knows that. The shell holds the whole matrix - interned, and small -
// so it can work out its own window and name it.
//
// Naming ids does NOT mean trusting them. loadScopedProducts re-runs the flow's
// own authorising query (shop's storefront product list, shelf by shelf) and
// pickWindow keeps only the ids that came back, in the order asked for, so an
// invented id fetches nothing and says nothing about why. `binding` itself is
// bound at render time and encrypted by Next on the way out.
export async function loadDiscoveryCards(binding: PdtCardBinding, ids: string[]): Promise<React.ReactNode[]> {
  const products = await loadScopedProducts(binding.shelves, binding.fetchCount)
  const wanted = pickWindow(products, { ids }, binding.maxCards)
  if (wanted.length === 0) return []
  const [items, template, config] = await Promise.all([
    buildGridCardItems(wanted),
    resolveCardTemplate(binding.layoutRef),
    getShopConfigCached(),
  ])
  return renderDiscoveryCards(template, items, config.productUrlStyle)
}
