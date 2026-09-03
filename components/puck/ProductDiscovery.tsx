import { FLT_SORT_OPTIONS, FLT_SORT_RECOMMENDED_PARAM } from '@/modules/filters-for-shop/lib/sort'
import type { LayoutRef } from '@/lib/puck/LayoutPickerField'
import { ShopLayoutPicker } from '@/modules/shop/components/public/ShopLayoutPicker'
import { FlowPickerField } from '@/modules/product-discovery-tool/components/puck/FlowPickerField'

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
  /** Where step three's questions sit on a wide screen. Named and worded to
   *  match filters' own grid, which offers the same choice over the same
   *  vocabulary. Tablet and below both put them behind the "Narrow down" bar. */
  questionsPosition?: 'left' | 'top'
  /** Whether reaching step three on a phone or tablet opens the questions
   *  drawer for the shopper, rather than waiting for them to tap "Narrow
   *  down". Only ever on the way IN to the step: a shopper who has closed the
   *  drawer is not shown it again. */
  autoOpenQuestions?: 'yes' | 'no'
  /** How the drawer stacks a question's options on a phone or tablet. Side by
   *  side fits three or four across a tablet's width instead of leaving most of
   *  the row empty; one per line is the older, taller reading. */
  drawerOptions?: 'side-by-side' | 'one-per-line'
  /** Whether the FIRST browse step offers "Compare these" and "Not sure yet".
   *  Deeper steps always do. Hidden unless asked for: skipping the first step
   *  of a catalogue-wide flow asks for the whole shop, which is what the shop's
   *  own grid is for. */
  firstStepFoot?: 'show' | 'hide'
  /** The order the results start in. Spelled as the dropdown spells it, with
   *  'recommended' standing in for the empty value - a Puck select with a blank
   *  value reads as nothing chosen. */
  defaultSort?: string
  layoutRef?: LayoutRef | null
  /** The browse path the address asked for, from `?pick=`. NOT an editor field -
   *  per-request context written into the block's props by the page route,
   *  exactly as shop writes a category slug, because a block cannot read the
   *  address it is served at. */
  pick?: string
}

function DiscoverySkeleton({ columns, questionsPosition }: { columns: number; questionsPosition: 'left' | 'top' }) {
  const bar = (width: string, height = 11) => (
    <div style={{ height, width, background: 'var(--color-border)', borderRadius: 4 }} />
  )
  // The questions, as the canvas sees them: a shut row above the results, or a
  // column beside them. Drawn rather than described because where they sit is
  // the whole of what this field decides, and an editor should see the answer
  // without publishing to find out.
  const pill = (width: string) => (
    <div key={width} style={{ height: 30, width, borderRadius: 999, border: '1px solid var(--color-border)' }} />
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22, opacity: 0.6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: '1 1 auto', height: 4, borderRadius: 999, background: 'var(--color-border)' }} />
        {bar('5rem', 10)}
      </div>
      {bar('14rem', 20)}
      {questionsPosition === 'top' && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, padding: '14px 16px', border: '1px solid var(--color-border)', borderRadius: 14 }}>
          {['7rem', '9rem', '6rem', '8rem'].map(pill)}
        </div>
      )}
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
  return <DiscoverySkeleton columns={props.columns ?? 3} questionsPosition={props.questionsPosition === 'top' ? 'top' : 'left'} />
}

const flowField = {
  type: 'custom' as const,
  label: 'Flow',
  // Narrower than Puck hands it: a custom field is called with the whole field
  // context and this one needs two of it. Safe in the parameter position, and
  // it keeps the block's own props honestly typed.
  render: ({ value, onChange }: { value?: string; onChange: (value: string) => void }) => (
    <FlowPickerField value={value} onChange={onChange} />
  ),
}

const layoutField = {
  type: 'custom' as const,
  label: 'Card layout',
  render: ({ value, onChange }: any) => <ShopLayoutPicker type="shopProductCard" value={value} onChange={onChange} />,
}

export const productDiscoveryPuckComponent = {
  label: 'Discovery: Guided Flow',
  fields: {
    flowSlug: flowField,
    columns: { type: 'number' as const, label: 'Result columns' },
    questionsPosition: {
      type: 'select' as const,
      label: 'Questions',
      options: [
        { value: 'left', label: 'Down the left' },
        { value: 'top', label: 'Across the top' },
      ],
    },
    autoOpenQuestions: {
      type: 'select' as const,
      label: 'On a phone or tablet, step three',
      options: [
        { value: 'no', label: 'Opens on the products' },
        { value: 'yes', label: 'Opens the questions' },
      ],
    },
    drawerOptions: {
      type: 'select' as const,
      label: 'Options in the drawer',
      options: [
        { value: 'side-by-side', label: 'Side by side' },
        { value: 'one-per-line', label: 'One per line' },
      ],
    },
    firstStepFoot: {
      type: 'select' as const,
      label: 'Under the first step',
      options: [
        { value: 'hide', label: 'Just the choices' },
        { value: 'show', label: 'Offer compare and “not sure yet”' },
      ],
    },
    // The same list the dropdown itself offers, so the two can never drift.
    defaultSort: {
      type: 'select' as const,
      label: 'Products start sorted by',
      options: FLT_SORT_OPTIONS.map((o) => ({ value: o.value || FLT_SORT_RECOMMENDED_PARAM, label: o.label })),
    },
    layoutRef: layoutField,
  },
  defaultProps: {
    flowSlug: '',
    columns: 3,
    questionsPosition: 'left',
    autoOpenQuestions: 'no',
    drawerOptions: 'side-by-side',
    firstStepFoot: 'hide',
    defaultSort: 'best-selling',
    layoutRef: null,
  },
  render: ProductDiscovery,
}
