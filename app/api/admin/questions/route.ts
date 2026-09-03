import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import { listQuestions, upsertQuestion } from '@/modules/product-discovery-tool/lib/db/questions'

export async function GET(request: Request) {
  const gate = await requireShopUser('shop.products', { allowAccess: true })
  if (gate.error) return gate.error
  const flowId = new URL(request.url).searchParams.get('flowId') ?? ''
  if (!flowId) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  return NextResponse.json({ questions: await listQuestions(flowId) })
}

const Body = z.object({
  flowId: z.string().min(1),
  // null means every node in the flow, which is the ordinary case.
  nodeId: z.string().min(1).nullable().optional(),
  groupId: z.string().min(1),
  heading: z.string().max(200).nullable().optional(),
  explainer: z.string().max(4000).nullable().optional(),
  importance: z.enum(['PRIMARY', 'SECONDARY']).optional(),
  multi: z.boolean().optional(),
  hidden: z.boolean().optional(),
})

// An upsert, because the screen edits a row that may or may not exist yet - an
// uncurated group is a group with no row - and making the screen track which is
// which would only be a way to get it wrong.
export async function POST(request: Request) {
  const gate = await requireShopUser('shop.products')
  if (gate.error) return gate.error
  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const created = await upsertQuestion({ ...parsed.data, nodeId: parsed.data.nodeId ?? null })
  return NextResponse.json({ id: created.id })
}
