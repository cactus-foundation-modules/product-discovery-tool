import { NextResponse } from 'next/server'
import { requireShopUser } from '@/modules/shop/lib/access'
import { readStats } from '@/modules/product-discovery-tool/lib/db/stats'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.products', { allowAccess: true })
  if (gate.error) return gate.error
  const days = Number(new URL(request.url).searchParams.get('days') ?? '90')
  return NextResponse.json({ stats: await readStats((await params).id, days) })
}
