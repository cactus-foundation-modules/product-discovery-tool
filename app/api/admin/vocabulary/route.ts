import { NextResponse } from 'next/server'
import { requireShopUser } from '@/modules/shop/lib/access'
import { listCategories, listCollections, listTags } from '@/modules/shop/lib/db/catalogue'
import { listGroups } from '@/modules/filters-for-shop/lib/db/filters'
import { PDT_RESERVED_PARAMS, paramForGroupSlug } from '@/modules/product-discovery-tool/lib/types'

// Everything the admin screens need to name things: the filter vocabulary this
// module borrows wholesale, and the shelves a flow or a node can be scoped to.
//
// One endpoint rather than the screens calling filters' own admin API directly.
// Reads of another module's tables through its exported helpers are the
// sanctioned direction - this module hard-depends on both shop and filters - and
// keeping the fetch here means the browser talks to one module about one screen.
export async function GET() {
  const gate = await requireShopUser('shop.products', { allowAccess: true })
  if (gate.error) return gate.error

  const [groups, categories, collections, tags] = await Promise.all([
    listGroups(),
    listCategories(),
    listCollections(),
    listTags(),
  ])

  return NextResponse.json({
    groups: groups.map((group) => ({
      id: group.id,
      name: group.name,
      slug: group.slug,
      kind: group.kind,
      controlType: group.controlType,
      // `pick`, `sort` and `page` belong to the wizard's own address. A group
      // whose slug collides with one is read under a prefixed parameter here
      // instead - filters' admin is not edited for this module's sake - and the
      // Questions tab shows this so nobody has to work it out from a URL.
      param: paramForGroupSlug(group.slug),
      collides: (PDT_RESERVED_PARAMS as readonly string[]).includes(group.slug),
      filters: group.filters.map((filter) => ({ id: filter.id, label: filter.label, slug: filter.slug, swatch: filter.swatchTiny ?? filter.swatchSmall ?? filter.swatch })),
    })),
    categories: categories.map((c) => ({ name: c.name, slug: c.slug })),
    collections: collections.map((c) => ({ name: c.name, slug: c.slug })),
    tags: tags.map((t) => ({ name: t.name, slug: t.slug })),
  })
}
