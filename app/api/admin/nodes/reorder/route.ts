import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import { reorderNodes } from '@/modules/product-discovery-tool/lib/db/nodes'

const Body = z.object({
  flowId: z.string().min(1),
  parentId: z.string().min(1).nullable().optional(),
  ids: z.array(z.string().min(1)).max(500),
})

export async function POST(request: Request) {
  const gate = await requireShopUser('shop.products')
  if (gate.error) return gate.error
  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  await reorderNodes(parsed.data.flowId, parsed.data.parentId ?? null, parsed.data.ids)
  return NextResponse.json({ ok: true })
}
