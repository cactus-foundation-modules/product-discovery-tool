import { describe, it, expect } from 'vitest'
import { Suspense, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ProductDiscoveryRsc } from '@/modules/product-discovery-tool/components/puck/ProductDiscovery.rsc'

// The flow is the heaviest thing on any page it sits on: one pass resolves five
// hundred products, runs every filter over them, prices them and orders them.
// Measured on the live homepage, doing that BEFORE the first byte was 7 to 8 seconds
// of blank browser, against 0.45s for a page with no flow on it.
//
// The fix is a Suspense boundary, and it only works if it sits OUTSIDE the async
// work - a `<Suspense>` written inside an async component has already awaited
// everything by the time React sees it, which looks identical in review and streams
// nothing. So the shape is the fix, and the shape is what this guards:
//
//   - the exported component must NOT be async, and
//   - what it returns must be a Suspense boundary with a fallback.
//
// Nothing else can catch this. It typechecks either way, it lints either way, it
// renders the same markup either way, and the only symptom is a slow first byte on
// somebody else's machine.
describe('the guided flow streams rather than blocking the first byte', () => {
  it('is not an async component', () => {
    // An async function's constructor is AsyncFunction; awaiting the whole flow
    // before returning is exactly what we are preventing.
    expect(ProductDiscoveryRsc.constructor.name).toBe('Function')
  })

  it('returns a Suspense boundary that has a fallback', () => {
    // Called with the bare minimum - it must not touch the database to hand back
    // the boundary, which is the whole point of the split.
    const el = ProductDiscoveryRsc({ flowSlug: 'anything' } as Parameters<typeof ProductDiscoveryRsc>[0]) as ReactElement<{ fallback?: unknown }>
    expect(el.type).toBe(Suspense)
    expect(el.props.fallback).toBeTruthy()
  })

  it('holds a minimum height, so the page below it does not jump when the flow lands', () => {
    const el = ProductDiscoveryRsc({ flowSlug: 'anything' } as Parameters<typeof ProductDiscoveryRsc>[0]) as ReactElement<{ fallback?: ReactElement }>
    // Rendered rather than inspected: the height lives inside the placeholder
    // component, not on the element handed to Suspense.
    const html = renderToStaticMarkup(el.props.fallback as ReactElement)
    expect(html).toMatch(/min-height/i)
    // And it announces itself, because a screen reader meeting an empty box wants
    // to know something is coming.
    expect(html).toContain('aria-busy')
  })
})
