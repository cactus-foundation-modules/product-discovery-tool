import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// Core paints every <button> inside <main> on the storefront with an
// !important hover fill and does not recolour the text with it, so this module
// opts its own chrome out with PDT_UNSTYLED and owns every state itself.
//
// Missing it does not look like a missing attribute. It looks like a colour
// bug: the button answers the block's own hover setting with the theme's colour
// instead, and if it has a twin that IS exempt - the "Narrow down" button has
// one on a phone - the two show different colours from one setting. That is how
// it was found, and it is why this is pinned in source: no stylesheet, type or
// render test can see an attribute that is absent.

const dir = path.join(process.cwd(), 'modules/product-discovery-tool/components/public')
const read = (file: string) => readFileSync(path.join(dir, file), 'utf8')

/** Every JSX tag in the file, as its opening text, so an attribute can be
 *  looked for on the element that carries the class rather than anywhere near
 *  it. Deliberately crude: the alternative is parsing TSX to check for a
 *  missing attribute, which is a lot of machinery for a one-line rule. */
function openingTagWithClass(source: string, className: string): string {
  const at = source.indexOf(className)
  expect(at, `no element with class "${className}"`).toBeGreaterThan(-1)
  const start = source.lastIndexOf('<', at)
  const end = source.indexOf('>', at)
  return source.slice(start, end + 1)
}

describe('module chrome opts out of the site button fill', () => {
  const shell = read('DiscoveryShell.tsx')

  it('exempts the floating narrow-down button, which has no container to inherit it from', () => {
    expect(openingTagWithClass(shell, 'pdt-jump')).toContain('PDT_UNSTYLED')
  })

  it('exempts the bar its twin sits in, so one setting gives both the same colour', () => {
    expect(openingTagWithClass(shell, '"pdt-bar"')).toContain('PDT_UNSTYLED')
  })

  it('never marks the wizard root, which would take the fill off shop cards too', () => {
    // The exemption covers a whole subtree with no way back in, and the product
    // grid renders inside .pdt-wrap. Those buttons are the site's chrome.
    expect(openingTagWithClass(shell, '"pdt-wrap"')).not.toContain('PDT_UNSTYLED')
  })
})
