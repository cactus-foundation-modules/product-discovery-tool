import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import { reorderFlows } from '@/modules/product-discovery-tool/lib/db/flows'

const Body = z.object({ ids: z.array(z.string().min(1)).max(200) })

export async function POST(request: Request) {
  const gate = await requireShopUser('shop.products')
  if (gate.error) return gate.error
  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  await reorderFlows(parsed.data.ids)
  return NextResponse.json({ ok: true })
}
