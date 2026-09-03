'use client'

// The running summary of every answer so far: what was picked, at which step,
// and a way to take each one off again.
//
// Each chip names its step, because the same word turns up in more than one
// place - "Black" is a colour and a frame finish - and a chip out of context
// says nothing. Removing a browse answer clears everything chosen below it,
// which the shell handles; removing a feature tick clears nothing.
//
// A chip is DATA, never a closure. The removal handler is passed once, beside
// the list, rather than baked into each entry - the shell builds this list in a
// memo, and a memo that holds functions closing over the shell's own refs is
// exactly what React's rules of refs forbid.
import { PDT_UNSTYLED } from '@/modules/product-discovery-tool/lib/types'

export type PdtAnswerChip =
  | { key: string; kind: 'step'; stepLabel: string; label: string; index: number }
  | { key: string; kind: 'filter'; stepLabel: string; label: string; groupId: string; filterId: string }

export function AnswerChips({ chips, onRemove, onClearAll }: {
  chips: PdtAnswerChip[]
  onRemove: (chip: PdtAnswerChip) => void
  onClearAll?: () => void
}) {
  if (chips.length === 0) return null
  return (
    <div className="pdt-chips" {...PDT_UNSTYLED}>
      <p className="pdt-chips-title">Your answers</p>
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          className="pdt-chip"
          aria-label={`Remove ${chip.stepLabel}: ${chip.label}`}
          onClick={() => onRemove(chip)}
        >
          <span className="pdt-chip-group">{chip.stepLabel}</span>
          <span>{chip.label}</span>
          <span className="pdt-chip-x" aria-hidden>×</span>
        </button>
      ))}
      {onClearAll && chips.length > 1 && (
        <button type="button" className="pdt-clear" onClick={onClearAll}>Start again</button>
      )}
    </div>
  )
}
