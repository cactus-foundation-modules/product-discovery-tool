'use client'

import type { PdtGridTable } from '@/modules/product-discovery-tool/lib/compare'

// A like-for-like comparison, drawn from copy that is written once and shown in
// two places - here and on the option cards beside it. Columns with nothing in
// them for any row are already gone by the time this sees the table (see
// lib/compare.ts), so an owner who has only written "best for" gets a two-column
// table rather than a wall of empty cells.
//
// Scrolls inside its own container rather than pushing the page sideways: three
// products with three columns each does not fit a phone, and a comparison worth
// reading is worth scrolling.
export function CompareTable({ table, caption, rowHeader = 'Option' }: { table: PdtGridTable; caption?: string; rowHeader?: string }) {
  return (
    <div className="pdt-compare-scroll">
      <table className="pdt-compare">
        {caption && <caption className="pdt-explainer" style={{ textAlign: 'left', paddingBottom: 10 }}>{caption}</caption>}
        <thead>
          <tr>
            <th scope="col">{rowHeader}</th>
            {table.headers.map((header) => (
              <th key={header} scope="col">{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row) => (
            <tr key={row.key}>
              <th scope="row">
                {row.image && (
                  // eslint-disable-next-line @next/next/no-img-element -- media library URLs are arbitrary remote hosts, not a configured next/image loader
                  <img className="pdt-compare-pic" src={row.image} alt="" loading="lazy" />
                )}
                {row.label}
              </th>
              {row.cells.map((cell, at) => (
                <td key={table.headers[at] ?? at}>{cell || '—'}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
