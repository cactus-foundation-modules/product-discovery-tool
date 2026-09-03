import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import { getSettings, updateSettings } from '@/modules/product-discovery-tool/lib/db/settings'

export async function GET() {
  const gate = await requireShopUser('shop.manage')
  if (gate.error) return gate.error
  return NextResponse.json({ settings: await getSettings() })
}

const Body = z.object({
  zeroResultRecovery: z.boolean().optional(),
  showCounts: z.boolean().optional(),
  compareEnabled: z.boolean().optional(),
  swapCardImages: z.boolean().optional(),
  preselectOnClick: z.boolean().optional(),
})

export async function PUT(request: Request) {
  const gate = await requireShopUser('shop.manage')
  if (gate.error) return gate.error
  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  await updateSettings(parsed.data)
  return NextResponse.json({ settings: await getSettings() })
}
