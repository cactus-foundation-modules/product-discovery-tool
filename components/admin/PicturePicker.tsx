'use client'

import { useState } from 'react'
import { MediaPickerModal } from '@/modules/shop/components/admin/MediaPickerModal'
import { LABEL, HINT } from '@/modules/product-discovery-tool/components/admin/shared'

// Picking a picture for a choice card or an option note.
//
// The library, not a box to paste a url into. Two things follow from that and
// both are the point:
//
//  - the picture is a MEDIA ITEM, so it is in the library's folders, it can be
//    uploaded from here, and the media screen counts it as used - this module's
//    media-usage provider already reports these columns, so a picture behind a
//    flow is never offered up for deletion as an orphan;
//  - when that item is later optimised, renamed or moved, core's rewriters walk
//    every registered reference and this module's own rewriter updates these
//    columns with the rest. A hand-typed url survives none of that: it points at
//    a blob that has gone, and the first anybody knows is a broken card.
//
// What is STORED is still the url, which is what the storefront renders and what
// both of those mechanisms key on. The picker only stops it being typed.

export function PicturePicker({ label, hint, value, onChange }: {
  label: string
  hint?: string
  value: string | null
  onChange: (url: string | null) => void
}) {
  const [picking, setPicking] = useState(false)

  return (
    <div>
      <span style={LABEL}>{label}</span>
      <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element -- media library URLs are arbitrary remote hosts, not a configured next/image loader
          <img
            src={value}
            alt=""
            style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg-subtle)' }}
          />
        ) : (
          <div
            aria-hidden
            style={{ width: 56, height: 56, borderRadius: 8, border: '1px dashed var(--color-border)', background: 'var(--color-bg-subtle)' }}
          />
        )}
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPicking(true)}>
          {value ? 'Replace' : 'Choose a picture'}
        </button>
        {value && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onChange(null)}>
            Remove
          </button>
        )}
      </div>
      {hint && <span style={HINT}>{hint}</span>}
      {picking && (
        <MediaPickerModal
          onClose={() => setPicking(false)}
          onAdd={(items) => {
            // One picture per card, however many the library let somebody tick.
            const first = items[0]
            if (first) onChange(first.url)
            setPicking(false)
          }}
        />
      )}
    </div>
  )
}
