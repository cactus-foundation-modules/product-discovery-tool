import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import { reorderQuestions } from '@/modules/product-discovery-tool/lib/db/questions'

const Body = z.object({ flowId: z.string().min(1), ids: z.array(z.string().min(1)).max(500) })

export async function POST(request: Request) {
  const gate = await requireShopUser('shop.products')
  if (gate.error) return gate.error
  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  await reorderQuestions(parsed.data.flowId, parsed.data.ids)
  return NextResponse.json({ ok: true })
}
