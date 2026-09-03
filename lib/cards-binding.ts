import type { LayoutRef } from '@/lib/puck/LayoutPickerField'
import type { PdtShelf } from '@/modules/product-discovery-tool/lib/resolve'

// Types only, in a file of their own on purpose - the same split shop makes for
// its own grid binding, and for the same two reasons:
//
//  - lib/cards-action.tsx is a 'use server' file, and Next allows a server file
//    to export async functions and nothing else.
//  - the client shell names the server function in a prop type, and a client
//    file importing anything that reaches prisma fails the build-time client
//    graph check (scripts/check-client-graph.mjs). `import type` is the one edge
//    that genuinely erases.

/** Everything the block decides and the browser may not: which shelves the flow
 *  is over, which card design, and how many cards one call may render.
 *
 *  Bound at render time and encrypted by Next on the way out. The server
 *  function re-runs the authorising query regardless, so the worst a forged
 *  request can do is ask for cards it could already see. */
export type PdtCardBinding = {
  shelves: PdtShelf[]
  fetchCount: number
  layoutRef?: LayoutRef | null
  maxCards: number
}

/** The prop shape the shell receives. Named here so a client component can name
 *  it with `import type` and never reach the server module behind it. */
export type PdtCardLoader = (ids: string[]) => Promise<React.ReactNode[]>
