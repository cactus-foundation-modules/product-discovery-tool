import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import { slugify } from '@/modules/shop/lib/slug'
import { createNode, ensureUniqueNodeSlug, listNodes } from '@/modules/product-discovery-tool/lib/db/nodes'

export async function GET(request: Request) {
  const gate = await requireShopUser('shop.products', { allowAccess: true })
  if (gate.error) return gate.error
  const flowId = new URL(request.url).searchParams.get('flowId') ?? ''
  if (!flowId) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  return NextResponse.json({ nodes: await listNodes(flowId) })
}

const Body = z.object({
  flowId: z.string().min(1),
  parentId: z.string().min(1).nullable().optional(),
  label: z.string().min(1).max(120),
  scopeType: z.enum(['ALL', 'CATEGORY', 'COLLECTION', 'TAG', 'FILTERS']).default('ALL'),
  scopeSlug: z.string().max(200).nullable().optional(),
})

export async function POST(request: Request) {
  const gate = await requireShopUser('shop.products')
  if (gate.error) return gate.error
  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const label = parsed.data.label.trim()
  if (!label) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const parentId = parsed.data.parentId ?? null
  const slug = await ensureUniqueNodeSlug(parsed.data.flowId, parentId, slugify(label))
  const created = await createNode({
    flowId: parsed.data.flowId,
    parentId,
    label,
    slug,
    scopeType: parsed.data.scopeType,
    scopeSlug: parsed.data.scopeType === 'ALL' || parsed.data.scopeType === 'FILTERS' ? null : parsed.data.scopeSlug ?? null,
  })
  return NextResponse.json({ id: created.id, slug })
}
