import type { PdtPuckData } from '@/modules/product-discovery-tool/lib/types'

// The 'productDiscovery' layout is one template stamped for every flow, so its
// blocks carry no per-flow slug of their own - the page writes the current one
// into each block's props right before rendering. Mirrors shop's
// inject-category-context.ts, which does the same job for the Category layout.

const CONTEXT_BLOCKS = new Set(['DiscoveryHeader', 'ProductDiscovery'])

type DiscoveryContext = {
  flowSlug: string
  /** The browse path from `?pick=`. A block cannot read the address it is served
   *  at, so the route reads it and writes it in. */
  pick: string
}

function injectBlocks(blocks: unknown[], ctx: DiscoveryContext): void {
  for (const item of blocks) {
    if (!item || typeof item !== 'object') continue
    const block = item as { type?: string; props?: Record<string, unknown> }
    if (block.type && CONTEXT_BLOCKS.has(block.type) && block.props) {
      // The page's own flow wins over whatever the block was saved with: a
      // template pointed at one flow would otherwise show that flow on every
      // page built from it.
      block.props.flowSlug = ctx.flowSlug
    }
    if (block.type === 'ProductDiscovery' && block.props) {
      block.props.pick = ctx.pick
    }
    if (block.props) {
      for (const value of Object.values(block.props)) {
        if (Array.isArray(value)) injectBlocks(value, ctx)
      }
    }
  }
}

export function injectDiscoveryContext(data: PdtPuckData, ctx: DiscoveryContext): PdtPuckData {
  const cloned = JSON.parse(JSON.stringify(data)) as PdtPuckData
  const content = Array.isArray(cloned.content) ? cloned.content : []
  const zoneBlocks = Object.values(cloned.zones ?? {}).flatMap((z) => (Array.isArray(z) ? z : []))
  injectBlocks([...content, ...zoneBlocks], ctx)
  return cloned
}
