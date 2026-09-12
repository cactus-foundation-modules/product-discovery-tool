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

  // Make the small copy of the tile's picture, because the public flow draws that
  // rather than the original - a choice tile is 216px square and the pictures picked
  // for one are routinely 1920px. Only the shop asked for small copies until now, so
  // a picture chosen here and nowhere else had nobody to make one for it.
  //
  // Dynamically imported: the resizer pulls in sharp, and a static import would put
  // an image library into every function that can reach this route. Never allowed to
  // fail the save - a tile with no small copy is drawn from the original, which is
  // heavier and perfectly correct.
  if (fields.imageUrl) {
    try {
      const { generateImageRendition } = await import('@/lib/media/renditions')
      const { THUMB_RENDITION_MAX_PX, THUMB_RENDITION_SUFFIX, THUMB_RENDITION_WORTHWHILE_BYTES } =
        await import('@/lib/media/thumb-renditions')
      await generateImageRendition(fields.imageUrl, {
        maxPx: THUMB_RENDITION_MAX_PX,
        suffix: THUMB_RENDITION_SUFFIX,
        worthwhileBytes: THUMB_RENDITION_WORTHWHILE_BYTES,
      })
    } catch (err) {
      console.warn('[discovery] could not make a small copy of the tile picture:', err)
    }
  }
  return NextResponse.json({ node: await getNode(id) })
}

export async function DELETE(_request: Request, { params }: Ctx) {
  const gate = await requireShopUser('shop.products')
  if (gate.error) return gate.error
  await deleteNode((await params).id)
  return NextResponse.json({ ok: true })
}
