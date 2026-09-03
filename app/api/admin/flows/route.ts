import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import { slugify } from '@/modules/shop/lib/slug'
import { createFlow, ensureUniqueFlowSlug, listFlows } from '@/modules/product-discovery-tool/lib/db/flows'

export async function GET() {
  const gate = await requireShopUser('shop.products', { allowAccess: true })
  if (gate.error) return gate.error
  return NextResponse.json({ flows: await listFlows() })
}

const PostBody = z.object({
  name: z.string().min(1).max(120),
  scopeType: z.enum(['ALL', 'CATEGORY', 'COLLECTION', 'TAG']).default('ALL'),
  scopeSlug: z.string().min(1).max(200).optional(),
})

export async function POST(request: Request) {
  const gate = await requireShopUser('shop.products')
  if (gate.error) return gate.error
  const parsed = PostBody.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const name = parsed.data.name.trim()
  if (!name) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  if (parsed.data.scopeType !== 'ALL' && !parsed.data.scopeSlug) {
    return NextResponse.json({ error: 'Choose which products this flow can reach.' }, { status: 400 })
  }
  // The address walks on until it finds free ground - a bare slug is shared with
  // pages, products, categories, posts and filter collections, and this module's
  // claim would take one of theirs over rather than losing gracefully.
  const slug = await ensureUniqueFlowSlug(slugify(name))
  const created = await createFlow({
    name,
    slug,
    scopeType: parsed.data.scopeType,
    scopeSlug: parsed.data.scopeType === 'ALL' ? null : parsed.data.scopeSlug ?? null,
  })
  return NextResponse.json({ id: created.id, slug })
}
