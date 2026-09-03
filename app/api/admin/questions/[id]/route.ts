import { NextResponse } from 'next/server'
import { requireShopUser } from '@/modules/shop/lib/access'
import { deleteQuestion } from '@/modules/product-discovery-tool/lib/db/questions'

// Deleting a curation row does NOT stop the group being asked - it goes back to
// being asked in the filters module's own order with its own name, which is
// what an uncurated group does. Hiding it is a separate switch on the row.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.products')
  if (gate.error) return gate.error
  await deleteQuestion((await params).id)
  return NextResponse.json({ ok: true })
}
