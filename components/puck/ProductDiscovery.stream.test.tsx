import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'
import { Suspense, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ProductDiscoveryRsc } from '@/modules/product-discovery-tool/components/puck/ProductDiscovery.rsc'
import { productDiscoveryPuckComponent } from '@/modules/product-discovery-tool/components/puck/ProductDiscovery'

// The flow is the heaviest thing on any page it sits on: one pass resolves five
// hundred products, runs every filter over them, prices them and orders them.
// Measured on the live homepage, doing that BEFORE the first byte was 7 to 8
// seconds of blank browser, against 0.45s for a page with no flow on it.
//
// WHAT IS GUARDED HERE, AND WHAT IS NOT. The boundary belongs around the
// EXPENSIVE half and nothing else. It used to sit around the whole block, which
// fixed the first byte and then painted "Finding your options…" where the
// opening question should have been on any cold render - because any async
// component suspends, however small its queries are. That panel is gone on
// purpose: the cheap half (the flow row, its nodes, its questions, its settings)
// blocks the first flush, costing about 100ms on a cold render, and the opening
// question is simply in the HTML.
//
// So the shape this file pins is:
//
//   - the expensive pass lives behind its own boundary, in DiscoveryCards, and
//   - the half that renders the shell never touches it.
//
// Nothing else can catch a regression here. It typechecks either way, it lints
// either way, it renders the same markup in the end either way, and the symptom
// is either a slow first byte or a loading panel on somebody else's machine.

// The SECOND split, and the one a shopper actually sees.
//
// Putting the whole block behind one boundary fixed the first byte but left the
// opening question - "What are you looking for today?", five tiles, a small
// table read - waiting behind the pass over five hundred products. So the page
// arrived fast and then showed "Finding your options…" where the question should
// have been.
//
// Now the cheap half renders the shell and its first step straight into the
// HTML, and the product pass streams in underneath it under its own boundary.
// The rule that keeps it that way is simply: the half that renders the shell
// must not touch the expensive builder. It is a one-line mistake to undo - add
// an await to the wrong function and the loading screen comes back - and
// nothing else notices, because it still typechecks, still lints and still
// renders the same markup in the end.
describe('the opening step renders without waiting for the product pass', () => {
  const raw = readFileSync(path.join(__dirname, 'ProductDiscovery.rsc.tsx'), 'utf8')
  // Comments stripped before anything is asserted, because the file EXPLAINS the
  // panel it no longer renders - and a check that reads its own explanation as
  // the thing it is banning fails on a correct file. Same lesson, and the same
  // fix, as lib/puck/CactusRender.test.ts.
  const source = raw
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => (line.trimStart().startsWith('//') ? '' : line))
    .join('\n')

  /** One top-level function's body, by name. */
  function bodyOf(name: string): string {
    const at = source.indexOf(`function ${name}(`)
    expect(at, `${name} should exist`).toBeGreaterThan(-1)
    const rest = source.slice(at + 1)
    const next = rest.search(/\n(?:async )?function [A-Z]/)
    return next === -1 ? rest : rest.slice(0, next)
  }

  it('renders the shell without building the answer set', () => {
    const body = bodyOf('ProductDiscoveryBody')
    expect(body).toContain('<DiscoveryShell')
    // The expensive pass belongs to the streamed half. An await on it here puts
    // the opening question back behind the loading screen.
    expect(body).not.toContain('buildDiscoveryDataset')
  })

  it('streams the cards under a boundary of their own', () => {
    const body = bodyOf('ProductDiscoveryBody')
    expect(body).toContain('<Suspense')
    expect(body).toContain('<DiscoveryCards')
  })

  it('has no loading panel of its own for the opening step to hide behind', () => {
    // The reversal this file exists to keep. A boundary around the CHEAP half
    // paints a panel on every cold render, because any async component suspends
    // however small its queries are - and that panel is what a shopper met on
    // the homepage instead of the question. If somebody adds one back, this is
    // the only thing that will notice.
    expect(source).not.toContain('Finding your options')
    expect(source).not.toMatch(/<Suspense[\s\S]{0,200}<ProductDiscoveryBody/)
  })

  it('keeps the expensive pass in the streamed half', () => {
    const body = bodyOf('DiscoveryCards')
    expect(body).toContain('buildDiscoveryDataset')
  })
})

// The option notes used to be every note on the site, read by the cheap half and
// written into the page: 41 KB of every homepage view, for copy nobody can open
// until the features step's questions exist - and those only arrive with the
// fetched answer set. They travel with that set now (lib/dataset.ts), and this is
// the one-line regression nothing else would notice: the page still renders, the
// guidance still works, and every visitor quietly pays for it again.
describe('the option notes stay off the page', () => {
  const source = readFileSync(path.join(__dirname, 'ProductDiscovery.rsc.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => (line.trimStart().startsWith('//') ? '' : line))
    .join('\n')

  it('does not read the notes to render the block', () => {
    expect(source).not.toMatch(/listNotes/)
  })

  it('does not hand the shell a notes prop', () => {
    expect(source).not.toMatch(/\bnotes=\{/)
  })

  it('asks for the dataset by the wire version, so no shell is handed an older shape from the CDN', () => {
    expect(source).toContain('v=${PDT_DATASET_WIRE_VERSION}')
  })
})

// The results' first row used to load its pictures eagerly and urgently wherever
// the block was put - which is also a preload hint in the page head per picture,
// queued ahead of the page's real first picture. A block cannot see whether it
// opens the page, so the owner says so, with the same field shop's Product Grid
// offers for the same cards.
describe('pictures in the first row', () => {
  const source = readFileSync(path.join(__dirname, 'ProductDiscovery.rsc.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => (line.trimStart().startsWith('//') ? '' : line))
    .join('\n')

  it('offers the owner the same choice, in the same words, as shop\'s Product Grid', () => {
    const field = productDiscoveryPuckComponent.fields.imageLoading
    expect(field.label).toBe('Pictures in the first row')
    expect(field.options.map((option) => option.value)).toEqual(['auto', 'eager'])
    expect(field.options[0]!.label).toBe('Load as the shopper scrolls to them')
    expect(field.options[1]!.label).toMatch(/^Load immediately \(/)
  })

  it('loads as the shopper scrolls unless told otherwise', () => {
    expect(productDiscoveryPuckComponent.defaultProps.imageLoading).toBe('auto')
  })

  it('only marks the opening row eager when the owner has asked for it', () => {
    expect(source).toMatch(/const eagerCount = props\.imageLoading === 'eager' \? columns : 0/)
    expect(source).toContain('renderDiscoveryCards(template, items, config.productUrlStyle, eagerCount)')
    // The old unconditional form, which is the regression.
    expect(source).not.toContain('config.productUrlStyle, columns)')
  })
})
