import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import { listNotes, upsertNote } from '@/modules/product-discovery-tool/lib/db/notes'

export async function GET() {
  const gate = await requireShopUser('shop.products', { allowAccess: true })
  if (gate.error) return gate.error
  return NextResponse.json({ notes: await listNotes() })
}

const Body = z.object({
  filterId: z.string().min(1),
  // null means global: this note explains the filter wherever it is offered.
  nodeId: z.string().min(1).nullable().optional(),
  explainer: z.string().max(8000).nullable().optional(),
  bestFor: z.string().max(2000).nullable().optional(),
  watchOut: z.string().max(2000).nullable().optional(),
  imageUrl: z.string().max(2000).nullable().optional(),
  learnMoreHref: z.string().max(2000).nullable().optional(),
})

export async function POST(request: Request) {
  const gate = await requireShopUser('shop.products')
  if (gate.error) return gate.error
  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const saved = await upsertNote({ ...parsed.data, nodeId: parsed.data.nodeId ?? null })
  return NextResponse.json({ id: saved.id })
}
