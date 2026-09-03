import { describe, expect, it } from 'vitest'
import { askedQuestions, pickQuestionRow } from '@/modules/product-discovery-tool/lib/questions'
import type { PdtQuestion } from '@/modules/product-discovery-tool/lib/types'

function row(groupId: string, nodeId: string | null, fields: Partial<PdtQuestion> = {}): PdtQuestion {
  return {
    id: `${groupId}-${nodeId ?? 'all'}`,
    flowId: 'flow',
    nodeId,
    groupId,
    heading: null,
    explainer: null,
    importance: 'PRIMARY',
    multi: true,
    position: 0,
    hidden: false,
    ...fields,
  }
}

const GROUPS = [
  { id: 'colour', name: 'Colour', slug: 'colour' },
  { id: 'frame', name: 'Frame', slug: 'frame' },
  { id: 'width', name: 'Width', slug: 'width' },
]

describe('pickQuestionRow', () => {
  it('prefers the row scoped to the deepest node on the path', () => {
    const rows = [row('colour', null, { heading: 'global' }), row('colour', 'desks', { heading: 'on desks' }), row('colour', 'ha', { heading: 'on sit-stands' })]
    expect(pickQuestionRow(rows, 'colour', ['desks', 'ha'])?.heading).toBe('on sit-stands')
  })

  it('falls back to the flow-wide row', () => {
    expect(pickQuestionRow([row('colour', null, { heading: 'global' })], 'colour', ['desks'])?.heading).toBe('global')
  })

  it('ignores a row scoped to a node that is not on this path', () => {
    expect(pickQuestionRow([row('colour', 'chairs')], 'colour', ['desks'])).toBeNull()
  })
})

describe('askedQuestions', () => {
  it('asks an uncurated group anyway, using its own name', () => {
    const asked = askedQuestions(GROUPS, [], [], new Set())
    expect(asked.map((q) => q.heading)).toEqual(['Colour', 'Frame', 'Width'])
  })

  it('puts curated questions first, in their own order', () => {
    const rows = [row('width', null, { position: 0 }), row('frame', null, { position: 1, heading: 'What sort of legs?' })]
    const asked = askedQuestions(GROUPS, rows, [], new Set())
    expect(asked.map((q) => q.heading)).toEqual(['Width', 'What sort of legs?', 'Colour'])
  })

  it('drops a hidden group', () => {
    const asked = askedQuestions(GROUPS, [row('frame', null, { hidden: true })], [], new Set())
    expect(asked.map((q) => q.group.id)).toEqual(['colour', 'width'])
  })

  it('never asks about something the chosen type already IS', () => {
    // Picking "Height adjustable" as a type must not then ask "Height
    // adjustable?" as a feature.
    const asked = askedQuestions(GROUPS, [], [], new Set(['frame']))
    expect(asked.map((q) => q.group.id)).toEqual(['colour', 'width'])
  })

  it('carries the wording, the importance and the single/multiple choice through', () => {
    const rows = [row('colour', null, { heading: 'What colour?', explainer: 'The finish you see.', importance: 'SECONDARY', multi: false })]
    const asked = askedQuestions(GROUPS, rows, [], new Set())
    expect(asked[0]).toMatchObject({ heading: 'What colour?', explainer: 'The finish you see.', importance: 'SECONDARY', multi: false })
  })

  it('treats a blank override as no override', () => {
    const asked = askedQuestions(GROUPS, [row('colour', null, { heading: '   ' })], [], new Set())
    expect(asked[0]!.heading).toBe('Colour')
  })
})
