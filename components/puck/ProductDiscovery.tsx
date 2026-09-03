import type { LayoutRef } from '@/lib/puck/LayoutPickerField'
import { ShopLayoutPicker } from '@/modules/shop/components/public/ShopLayoutPicker'

// EDITOR half only: placeholder + Puck field config. The server render (db
// access, matching, card stamping, the wizard itself) lives in
// ProductDiscovery.rsc.tsx, wired by `rscImport` in the manifest so it never
// lands in the client editor bundle. Mirrors shop's own ShopProductGrid split
// for the same reason: lib/card-template dynamically imports lib/puck/config.rsc,
// which is tainted by next/headers.

export type ProductDiscoveryProps = {
  /** Which flow to run. Filled in for you on the flow's own page (the route
   *  injects it); typed by hand when the block is dropped on an ordinary page. */
  flowSlug?: string
  columns?: number
  layoutRef?: LayoutRef | null
  /** The browse path the address asked for, from `?pick=`. NOT an editor field -
   *  per-request context written into the block's props by the page route,
   *  exactly as shop writes a category slug, because a block cannot read the
   *  address it is served at. */
  pick?: string
}

function DiscoverySkeleton({ columns }: { columns: number }) {
  const bar = (width: string, height = 11) => (
    <div style={{ height, width, background: 'var(--color-border)', borderRadius: 4 }} />
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22, opacity: 0.6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: '1 1 auto', height: 4, borderRadius: 999, background: 'var(--color-border)' }} />
        {bar('5rem', 10)}
      </div>
      {bar('14rem', 20)}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, minmax(0,1fr))`, gap: 16 }}>
        {Array.from({ length: columns }).map((_, i) => (
          <div key={i} style={{ border: '1px solid var(--color-border)', borderRadius: 14, overflow: 'hidden', background: 'var(--color-surface)' }}>
            <div style={{ aspectRatio: '4/3', background: 'var(--color-bg-subtle)' }} />
            <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {bar('60%', 13)}
              {bar('85%')}
              {bar('40%')}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Editor canvas: static skeleton, no fetch during render (Gazette pattern).
export function ProductDiscovery(props: ProductDiscoveryProps) {
  return <DiscoverySkeleton columns={props.columns ?? 3} />
}

const layoutField = {
  type: 'custom' as const,
  label: 'Card layout',
  render: ({ value, onChange }: any) => <ShopLayoutPicker type="shopProductCard" value={value} onChange={onChange} />,
}

export const productDiscoveryPuckComponent = {
  label: 'Discovery: Guided Flow',
  fields: {
    flowSlug: { type: 'text' as const, label: 'Flow address (blank on a flow’s own page)' },
    columns: { type: 'number' as const, label: 'Result columns' },
    layoutRef: layoutField,
  },
  defaultProps: {
    flowSlug: '',
    columns: 3,
    layoutRef: null,
  },
  render: ProductDiscovery,
}
