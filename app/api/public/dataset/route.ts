import { NextResponse } from 'next/server'
import { z } from 'zod'
import { buildDiscoveryDataset } from '@/modules/product-discovery-tool/lib/dataset'

// The flow's answer set, fetched by the shell instead of being serialised into
// every page the flow sits on.
//
// WHY THIS EXISTS. Measured on the live homepage: 802 KB of flight payload for
// one Discovery block, 660 KB of it this data - the match matrix, the variation
// swaps, the interned combinations and the sort keys. Every visitor paid to
// parse and hydrate all of it, and the large majority never touch the finder at
// all. The block now draws the first step from counts it works out on the server
// and the browser asks for the rest, once, when it needs it.
//
// WHY A CACHEABLE GET RATHER THAN A SERVER ACTION. An action is a POST that no
// shared cache will hold, so every engaged shopper would have paid for a fresh
// build of the same answer. This is one build per window for the whole world:
// `publicCacheTtl` below hands the dispatcher the job of setting the shared-cache
// headers (lib/cache/module-api-cache.ts), so the CDN answers nearly all of it.
//
// NOTHING PRIVATE PASSES THROUGH HERE. It is the same catalogue data that was
// inlined into public HTML until now - which products match which filters, and
// what each one is called and costs. There is no identifier in it, nothing about
// who is asking, and no route to anything a shopper could not already see by
// reading the page source. That is precisely why it is safe to let a CDN hand
// one copy to everybody.
export const publicCacheTtl = 3600

const Query = z.object({
  // A flow slug, matching what the block stores. Anything else simply finds no
  // flow, which answers 404 rather than an empty dataset - an empty one would
  // let the shell decide the catalogue was gone.
  flow: z.string().min(1).max(120),
  // The block's own default-sort field. Part of the answer rather than a
  // preference: `serverOrder` has to match the order the server already drew the
  // cards in, or the grid rearranges itself the moment this lands. Blank is
  // allowed and means the shop's own order.
  sort: z.string().max(40).optional(),
})

export async function GET(req: Request) {
  const url = new URL(req.url)
  const parsed = Query.safeParse({
    flow: url.searchParams.get('flow') ?? '',
    sort: url.searchParams.get('sort') ?? undefined,
  })
  if (!parsed.success) {
    return NextResponse.json({ error: 'Unknown flow.' }, { status: 400 })
  }

  const built = await buildDiscoveryDataset(parsed.data.flow, parsed.data.sort ?? '')
  // No flow, or a flow whose shelves are empty. Both are "there is nothing to
  // guide anybody through", and the block has already drawn that case.
  if (!built) return NextResponse.json({ error: 'Unknown flow.' }, { status: 404 })

  return NextResponse.json(built.wire)
}
