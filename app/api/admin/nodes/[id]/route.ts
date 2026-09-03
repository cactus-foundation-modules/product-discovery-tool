import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import { slugify } from '@/modules/shop/lib/slug'
import { deleteNode, ensureUniqueNodeSlug, getNode, setNodeFilters, updateNode } from '@/modules/product-discovery-tool/lib/db/nodes'

type Ctx = { params: Promise<{ id: string }> }

const Body = z.object({
  label: z.string().min(1).max(120).optional(),
  slug: z.string().min(1).max(120).optional(),
  blurb: z.string().max(400).nullable().optional(),
  explainer: z.string().max(8000).nullable().optional(),
  bestFor: z.string().max(2000).nullable().optional(),
  notFor: z.string().max(2000).nullable().optional(),
  imageUrl: z.string().max(2000).nullable().optional(),
  icon: z.string().max(16).nullable().optional(),
  scopeType: z.enum(['ALL', 'CATEGORY', 'COLLECTION', 'TAG', 'FILTERS']).optional(),
  scopeSlug: z.string().max(200).nullable().optional(),
  /** The full applied-filter list, always. The screen sends the lot, so a diff
   *  would only re-derive what it already has. */
  filterIds: z.array(z.string().min(1)).max(50).optional(),
})

export async function PUT(request: Request, { params }: Ctx) {
  const gate = await requireShopUser('shop.products')
  if (gate.error) return gate.error
  const { id } = await params
  const existing = await getNode(id)
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const { filterIds, ...fields } = parsed.data
  if (fields.slug !== undefined) {
    fields.slug = await ensureUniqueNodeSlug(existing.flowId, existing.parentId, slugify(fields.slug) || 'option', id)
  }
  await updateNode(id, fields)
  if (filterIds) await setNodeFilters(id, filterIds)
  return NextResponse.json({ node: await getNode(id) })
}

export async function DELETE(_request: Request, { params }: Ctx) {
  const gate = await requireShopUser('shop.products')
  if (gate.error) return gate.error
  await deleteNode((await params).id)
  return NextResponse.json({ ok: true })
}
