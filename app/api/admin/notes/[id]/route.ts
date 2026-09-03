import { NextResponse } from 'next/server'
import { requireShopUser } from '@/modules/shop/lib/access'
import { deleteNote } from '@/modules/product-discovery-tool/lib/db/notes'

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.products')
  if (gate.error) return gate.error
  await deleteNote((await params).id)
  return NextResponse.json({ ok: true })
}
