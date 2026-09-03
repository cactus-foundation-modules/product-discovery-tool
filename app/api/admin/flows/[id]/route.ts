import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import { slugify } from '@/modules/shop/lib/slug'
import { deleteFlow, flowSlugAvailable, getFlow, updateFlow } from '@/modules/product-discovery-tool/lib/db/flows'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: Ctx) {
  const gate = await requireShopUser('shop.products', { allowAccess: true })
  if (gate.error) return gate.error
  const flow = await getFlow((await params).id)
  if (!flow) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ flow })
}

const Body = z.object({
  name: z.string().min(1).max(120).optional(),
  slug: z.string().min(1).max(120).optional(),
  status: z.enum(['DRAFT', 'PUBLISHED']).optional(),
  heading: z.string().max(200).nullable().optional(),
  standfirst: z.string().max(600).nullable().optional(),
  // Whatever the builder PUT. Puck owns its own schema; pretending to validate
  // it here would only be a lie with a cast in it.
  introPuck: z.record(z.string(), z.unknown()).nullable().optional(),
  scopeType: z.enum(['ALL', 'CATEGORY', 'COLLECTION', 'TAG']).optional(),
  scopeSlug: z.string().max(200).nullable().optional(),
  metaTitle: z.string().max(200).nullable().optional(),
  metaDescription: z.string().max(400).nullable().optional(),
  ogImage: z.string().max(2000).nullable().optional(),
  noindex: z.boolean().optional(),
  showPrices: z.boolean().optional(),
  allowSkip: z.boolean().optional(),
  resultsPerPage: z.number().int().min(1).max(100).optional(),
  finishCtaLabel: z.string().max(80).nullable().optional(),
  finishCtaHref: z.string().max(2000).nullable().optional(),
})

export async function PUT(request: Request, { params }: Ctx) {
  const gate = await requireShopUser('shop.products')
  if (gate.error) return gate.error
  const { id } = await params
  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const fields = { ...parsed.data }
  if (fields.slug !== undefined) {
    const wanted = slugify(fields.slug)
    // Refused with a sentence rather than quietly renamed: the owner typed an
    // address and deserves to be told it is spoken for.
    if (!wanted) return NextResponse.json({ error: 'That address will not do. Try something with letters in it.' }, { status: 400 })
    if (!(await flowSlugAvailable(wanted, id))) {
      return NextResponse.json({ error: `Something else already answers on /${wanted}. Pick another address.` }, { status: 400 })
    }
    fields.slug = wanted
  }
  await updateFlow(id, fields)
  return NextResponse.json({ flow: await getFlow(id) })
}

export async function DELETE(_request: Request, { params }: Ctx) {
  const gate = await requireShopUser('shop.products')
  if (gate.error) return gate.error
  await deleteFlow((await params).id)
  return NextResponse.json({ ok: true })
}
