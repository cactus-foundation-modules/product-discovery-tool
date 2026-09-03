import type { Breakpoints } from '@/modules/shop/lib/breakpoints'

// Stacking order for the open questions sheet and its scrim (the sheet takes
// SHEET_Z + 1). Chosen to sit ABOVE a live-chat launcher, which parks itself at
// 2147482000, and BELOW quote-for-shop's lightbox at 2147483000 - the same band
// filters' own sheet claims, and for the same reason: a modal has to outrank a
// launcher, and a launcher sitting over "See 24 products" is the bug that made
// it necessary. The dialogs below share it.
const SHEET_Z = 2147482100

// The guided flow's stylesheet, emitted once by the block alongside shop's own
// shopCardCss. Class prefix `pdt-`. Colours are tokens only, so the wizard
// tracks the site's light/dark theme with no second palette to keep in step.
// Media queries cannot read CSS custom properties, so the site's own
// breakpoints are baked in at render time - same approach as the shop's grids.
//
// Three layouts, one DOM:
// - Desktop: browse cards in a wide grid; the features step puts the questions
//   down the left of the results.
// - Tablet and below: one step per screen, the questions behind a sticky
//   "See N products" bar that opens them as a sheet.
// - Phone: the same sheet, rising from the bottom edge.
export function discoveryCss({ tabletBp, mobileBp }: Breakpoints): string {
  return `
.pdt-wrap{display:flex;flex-direction:column;gap:20px;margin-top:8px;color:var(--color-text)}

.pdt-progress{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.pdt-progress-track{flex:1 1 160px;min-width:120px;height:4px;border-radius:999px;background:var(--color-bg-subtle);overflow:hidden}
.pdt-progress-fill{display:block;height:100%;border-radius:999px;background:var(--color-primary);transition:width .25s ease}
.pdt-progress-text{font-size:.8125rem;color:var(--color-text-muted);white-space:nowrap}
.pdt-back{appearance:none;background:none;border:0;padding:6px 8px;margin-left:-8px;border-radius:8px;font:inherit;font-size:.875rem;color:var(--color-text-muted);cursor:pointer}
.pdt-back:hover{color:var(--color-text);background:var(--color-bg-subtle)}
.pdt-back:focus-visible{outline:2px solid var(--color-primary);outline-offset:2px}

.pdt-step-head{display:flex;flex-direction:column;gap:6px}
.pdt-step-title{margin:0;font-size:clamp(20px,2.6vw,28px);line-height:1.2;font-weight:600;color:var(--color-text)}
.pdt-step-title:focus{outline:none}
.pdt-step-title:focus-visible{outline:2px solid var(--color-primary);outline-offset:4px;border-radius:4px}
.pdt-step-sub{margin:0;font-size:.9375rem;color:var(--color-text-muted);max-width:62ch}

.pdt-chips{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.pdt-chips-title{margin:0;font-size:.75rem;text-transform:uppercase;letter-spacing:.08em;color:var(--color-text-muted)}
.pdt-chip{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:999px;border:1px solid var(--color-border);background:var(--color-surface);color:var(--color-text);font:inherit;font-size:.8125rem;cursor:pointer}
.pdt-chip:hover{border-color:var(--color-primary)}
.pdt-chip:focus-visible{outline:2px solid var(--color-primary);outline-offset:2px}
.pdt-chip-group{color:var(--color-text-muted)}
.pdt-chip-x{font-size:1rem;line-height:1;color:var(--color-text-muted)}
.pdt-clear{appearance:none;border:0;background:none;padding:4px 6px;border-radius:6px;font:inherit;font-size:.8125rem;color:var(--color-primary);cursor:pointer;text-decoration:underline}
.pdt-clear:focus-visible{outline:2px solid var(--color-primary);outline-offset:2px}

/* Browse steps ---------------------------------------------------------- */
.pdt-browse{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(min(100%,210px),1fr));margin:0;padding:0;border:0}
.pdt-browse legend{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.pdt-choice{position:relative;display:flex;flex-direction:column;border:1px solid var(--color-border);border-radius:14px;background:var(--color-surface);overflow:hidden}
.pdt-choice:has(.pdt-choice-pick:focus-visible){outline:2px solid var(--color-primary);outline-offset:2px}
.pdt-choice:hover{border-color:var(--color-primary)}
.pdt-choice-pick{appearance:none;border:0;background:none;padding:0;margin:0;font:inherit;color:inherit;text-align:left;cursor:pointer;display:flex;flex-direction:column;flex:1 1 auto}
.pdt-choice-pick:focus{outline:none}
.pdt-choice-pic{aspect-ratio:4/3;background:var(--color-bg-subtle);display:block;width:100%;object-fit:cover}
.pdt-choice-icon{aspect-ratio:4/3;display:flex;align-items:center;justify-content:center;background:var(--color-bg-subtle);font-size:2rem}
.pdt-choice-body{display:flex;flex-direction:column;gap:4px;padding:14px 16px}
.pdt-choice-label{font-weight:600;font-size:1rem;color:var(--color-text)}
.pdt-choice-blurb{font-size:.875rem;color:var(--color-text-muted);line-height:1.45}
.pdt-choice-count{font-size:.8125rem;color:var(--color-text-muted)}
.pdt-choice-more{display:flex;gap:12px;padding:0 16px 12px}
.pdt-link{appearance:none;border:0;background:none;padding:0;font:inherit;font-size:.8125rem;color:var(--color-primary);text-decoration:underline;cursor:pointer}
.pdt-link:focus-visible{outline:2px solid var(--color-primary);outline-offset:2px}
.pdt-browse-foot{display:flex;flex-wrap:wrap;gap:12px;align-items:center}
.pdt-skip{appearance:none;border:1px solid var(--color-border);background:var(--color-surface);border-radius:999px;padding:8px 16px;font:inherit;font-size:.875rem;color:var(--color-text);cursor:pointer}
.pdt-skip:hover{border-color:var(--color-primary)}
.pdt-skip:focus-visible{outline:2px solid var(--color-primary);outline-offset:2px}

/* Features step --------------------------------------------------------- */
.pdt-features{display:grid;gap:28px;grid-template-columns:minmax(220px,280px) 1fr;align-items:start}
.pdt-questions{display:flex;flex-direction:column;gap:4px;min-width:0}
.pdt-question{border:0;border-top:1px solid var(--color-border);margin:0;padding:14px 0 4px}
.pdt-question:first-of-type{border-top:0}
.pdt-question legend{display:contents}
.pdt-question-head{display:flex;width:100%;align-items:center;justify-content:space-between;gap:8px;appearance:none;background:none;border:0;padding:0 0 8px;font:inherit;font-weight:600;color:var(--color-text);cursor:pointer;text-align:left}
.pdt-question-head:focus-visible{outline:2px solid var(--color-primary);outline-offset:2px}
.pdt-question-badge{display:inline-flex;min-width:18px;height:18px;padding:0 5px;border-radius:999px;background:var(--color-primary);color:var(--color-primary-contrast,#fff);font-size:.6875rem;align-items:center;justify-content:center;margin-left:6px}
.pdt-chevron{width:8px;height:8px;border-right:2px solid currentColor;border-bottom:2px solid currentColor;transform:rotate(45deg);transition:transform .15s ease;flex:none;opacity:.6}
.pdt-question.is-closed .pdt-chevron{transform:rotate(-45deg)}
.pdt-question.is-closed .pdt-question-body{display:none}
.pdt-question-explainer{margin:0 0 8px;font-size:.8125rem;color:var(--color-text-muted);line-height:1.45}
.pdt-options{display:flex;flex-direction:column;gap:2px;padding-bottom:10px}
.pdt-option{display:flex;align-items:center;gap:8px;padding:5px 4px;border-radius:6px;font-size:.875rem;cursor:pointer}
.pdt-option:hover{background:var(--color-bg-subtle)}
.pdt-option input{flex:none;margin:0}
.pdt-option-label{flex:1 1 auto;min-width:0}
.pdt-option-count{font-size:.75rem;color:var(--color-text-muted);font-variant-numeric:tabular-nums}
.pdt-option.is-dead{opacity:.55}
.pdt-option.is-dead .pdt-option-label{text-decoration:line-through}
.pdt-option-swatch{width:16px;height:16px;border-radius:999px;border:1px solid var(--color-border);flex:none;background-size:cover;background-position:center}
.pdt-option-note{margin:0 0 4px 26px;font-size:.75rem;color:var(--color-text-muted);line-height:1.4}
.pdt-secondary-toggle{align-self:flex-start;margin-top:8px}
.pdt-no-questions{margin:0;font-size:.875rem;color:var(--color-text-muted)}

.pdt-results{display:flex;flex-direction:column;gap:14px;min-width:0}
.pdt-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.pdt-showing{margin:0;font-size:.875rem;color:var(--color-text-muted)}
.pdt-sort{display:inline-flex;align-items:center;gap:8px;font-size:.875rem;color:var(--color-text-muted)}
.pdt-sort-select{font:inherit;font-size:.875rem;padding:6px 10px;border-radius:8px;border:1px solid var(--color-border);background:var(--color-surface);color:var(--color-text)}
.pdt-empty{margin:0;font-size:.9375rem;color:var(--color-text-muted)}
.pdt-recovery{border:1px solid var(--color-border);border-radius:12px;padding:14px 16px;background:var(--color-surface);display:flex;flex-direction:column;gap:8px}
.pdt-recovery-title{margin:0;font-weight:600;font-size:.9375rem}
.pdt-recovery-list{display:flex;flex-wrap:wrap;gap:8px;margin:0;padding:0;list-style:none}
.pdt-cards-failed{margin:0;font-size:.875rem;color:var(--color-text-muted)}
.pdt-pager{display:flex;justify-content:center;padding-top:8px}
.pdt-more{appearance:none;display:inline-block;border:1px solid var(--color-border);background:var(--color-surface);border-radius:999px;padding:10px 22px;font:inherit;font-size:.875rem;color:var(--color-text);cursor:pointer;text-decoration:none}
.pdt-more:hover{border-color:var(--color-primary)}
.pdt-more:focus-visible{outline:2px solid var(--color-primary);outline-offset:2px}
.pdt-finish{display:flex;justify-content:center;padding-top:6px}

/* Compare drawer, product compare and explainers ------------------------ */
.pdt-scrim{position:fixed;inset:0;background:rgba(0,0,0,.45);opacity:0;pointer-events:none;transition:opacity .2s ease;z-index:${SHEET_Z}}
.pdt-scrim.is-open{opacity:1;pointer-events:auto}
.pdt-dialog{position:fixed;z-index:${SHEET_Z + 1};inset:auto 0 0 0;max-height:82vh;display:flex;flex-direction:column;background:var(--color-surface);border-top:1px solid var(--color-border);border-radius:16px 16px 0 0;transform:translateY(100%);transition:transform .22s ease;overflow:hidden}
.pdt-dialog.is-open{transform:translateY(0)}
@media (min-width:${tabletBp}){
  .pdt-dialog{inset:50% auto auto 50%;transform:translate(-50%,-46%) scale(.98);opacity:0;width:min(880px,92vw);max-height:80vh;border:1px solid var(--color-border);border-radius:16px;transition:opacity .18s ease,transform .18s ease}
  .pdt-dialog.is-open{transform:translate(-50%,-50%) scale(1);opacity:1}
}
.pdt-dialog-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 20px;border-bottom:1px solid var(--color-border)}
.pdt-dialog-title{margin:0;font-size:1.0625rem;font-weight:600}
.pdt-dialog-close{appearance:none;border:0;background:none;padding:6px;border-radius:8px;color:var(--color-text-muted);cursor:pointer;line-height:0}
.pdt-dialog-close:hover{background:var(--color-bg-subtle);color:var(--color-text)}
.pdt-dialog-close:focus-visible{outline:2px solid var(--color-primary);outline-offset:2px}
.pdt-dialog-close svg{width:20px;height:20px}
.pdt-dialog-body{padding:16px 20px 24px;overflow:auto}
.pdt-compare-scroll{overflow-x:auto}
.pdt-compare{border-collapse:collapse;width:100%;min-width:520px;font-size:.875rem}
.pdt-compare th,.pdt-compare td{border-bottom:1px solid var(--color-border);padding:10px 12px;text-align:left;vertical-align:top;line-height:1.45}
.pdt-compare thead th{font-size:.75rem;text-transform:uppercase;letter-spacing:.06em;color:var(--color-text-muted);font-weight:600}
.pdt-compare tbody th{font-weight:600;color:var(--color-text);white-space:nowrap}
.pdt-compare-pic{width:52px;height:52px;border-radius:8px;object-fit:cover;border:1px solid var(--color-border);display:block;margin-bottom:6px}
.pdt-explainer{margin:0;font-size:.9375rem;line-height:1.55;color:var(--color-text);white-space:pre-wrap}

.pdt-picks{display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding-top:4px}
.pdt-picks-note{margin:0;font-size:.8125rem;color:var(--color-text-muted)}

/* Sticky bar and question sheet, tablet and below ------------------------ */
.pdt-bar{display:none}
@media (max-width:${tabletBp}){
  .pdt-features{grid-template-columns:1fr}
  .pdt-questions{position:fixed;inset:auto 0 0 0;z-index:${SHEET_Z + 1};background:var(--color-surface);border-top:1px solid var(--color-border);border-radius:16px 16px 0 0;max-height:80vh;overflow:auto;padding:0 20px 20px;transform:translateY(100%);transition:transform .22s ease}
  .pdt-questions.is-open{transform:translateY(0)}
  .pdt-questions-head{position:sticky;top:0;background:var(--color-surface);display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 0 12px;border-bottom:1px solid var(--color-border);margin-bottom:8px}
  .pdt-bar{display:flex;position:sticky;bottom:0;z-index:5;gap:10px;padding:10px 0;background:var(--color-bg);border-top:1px solid var(--color-border)}
  .pdt-bar button{flex:1 1 auto}
}
@media (min-width:${tabletBp}){
  .pdt-questions-head{display:none}
}
.pdt-bar-btn{appearance:none;border:1px solid var(--color-border);background:var(--color-surface);border-radius:999px;padding:12px 18px;font:inherit;font-size:.9375rem;color:var(--color-text);cursor:pointer}
.pdt-bar-primary{background:var(--color-primary);border-color:var(--color-primary);color:var(--color-primary-contrast,#fff)}
.pdt-bar-btn:focus-visible{outline:2px solid var(--color-primary);outline-offset:2px}

@media (max-width:${mobileBp}){
  .pdt-browse{grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr));gap:12px}
  .pdt-choice-body{padding:12px}
  .pdt-compare{min-width:420px}
}
`
}
