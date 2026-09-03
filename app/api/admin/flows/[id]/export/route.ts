import { NextResponse } from 'next/server'
import { requireShopUser } from '@/modules/shop/lib/access'
import { exportFlow } from '@/modules/product-discovery-tool/lib/import-export'

// The whole flow as a slug-referenced file - see lib/import-export.ts for why
// nothing in it is an id.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.products', { allowAccess: true })
  if (gate.error) return gate.error
  const file = await exportFlow((await params).id)
  if (!file) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(file, {
    headers: { 'Content-Disposition': `attachment; filename="${file.flow.slug}.discovery.json"` },
  })
}
