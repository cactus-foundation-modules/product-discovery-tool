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
//   down the left of the results, or across the top of them when the block is
//   set that way (`pdt-pos-left` / `pdt-pos-top`, spelled as filters' own grid
//   spells the same choice).
// - Tablet and below: one step per screen, the questions behind a sticky
//   "See N products" bar that opens them as a sheet. BOTH positions land here -
//   a phone has no room for a row of questions above the products, and the
//   position field says so.
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
/* The heading takes focus on every step change so a screen reader announces the
   new step (see DiscoveryShell). It draws NO ring for it: this focus is the
   page's doing, not the shopper's, and Safari hands a programmatically focused
   element :focus-visible after an ordinary mouse click - which put a box around
   "Which sort of desks?" and left it there. The heading is not tabbable, so
   there is no keyboard journey through it to indicate; what a keyboard user
   needs from the move is the announcement, and they still get it. */
.pdt-step-title{margin:0;font-size:clamp(20px,2.6vw,28px);line-height:1.2;font-weight:600;color:var(--color-text)}
.pdt-step-title:focus,.pdt-step-title:focus-visible{outline:none}
.pdt-step-sub{margin:0;font-size:.9375rem;color:var(--color-text-muted);max-width:62ch}

.pdt-chips{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.pdt-chips-title{margin:0;font-size:.75rem;text-transform:uppercase;letter-spacing:.08em;color:var(--color-text-muted)}
.pdt-chip{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:999px;border:1px solid var(--color-border);background:var(--color-surface);color:var(--color-text);font:inherit;font-size:.8125rem;cursor:pointer}
.pdt-chip:hover{border-color:var(--color-primary);background:var(--color-primary-subtle)}
.pdt-chip:focus-visible{outline:2px solid var(--color-primary);outline-offset:2px}
.pdt-chip-group{color:var(--color-text-muted)}
.pdt-chip-x{font-size:1rem;line-height:1;color:var(--color-text-muted)}
.pdt-clear{appearance:none;border:0;background:none;padding:4px 6px;border-radius:6px;font:inherit;font-size:.8125rem;color:var(--color-primary);cursor:pointer;text-decoration:underline}
.pdt-clear:hover{color:var(--color-text)}
.pdt-clear:focus-visible{outline:2px solid var(--color-primary);outline-offset:2px}

/* Browse steps ---------------------------------------------------------- */
.pdt-browse{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(min(100%,210px),1fr));margin:0;padding:0;border:0}
.pdt-browse legend{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.pdt-choice{position:relative;display:flex;flex-direction:column;border:1px solid var(--color-border);border-radius:14px;background:var(--color-surface);overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.06);transition:box-shadow .25s ease,transform .25s ease,border-color .25s ease,background .25s ease}
.pdt-choice:has(.pdt-choice-pick:focus-visible){outline:2px solid var(--color-primary);outline-offset:2px}
/* The same lift, easing and shadow as shop's own product card, deliberately
   copied value for value: these are cards in the same flow as those, and two
   nearly-identical hovers read as a bug rather than as two components. */
.pdt-choice:hover{transform:translateY(-4px);box-shadow:0 8px 30px rgba(0,0,0,.10);border-color:var(--color-primary);background:var(--color-primary-subtle)}
.pdt-choice-pick{appearance:none;border:0;background:none;padding:0;margin:0;font:inherit;color:inherit;text-align:left;cursor:pointer;display:flex;flex-direction:column;flex:1 1 auto}
.pdt-choice-pick:focus{outline:none}
/* Square, not 4:3. The pictures behind these cards are ordinary product
   photography of wildly different things - a locker, a monitor arm, a booth -
   and a square crop is the one shape that treats them all the same. */
.pdt-choice-pic{aspect-ratio:1/1;background:var(--color-bg-subtle);display:block;width:100%;object-fit:cover}
.pdt-choice-icon{aspect-ratio:1/1;display:flex;align-items:center;justify-content:center;background:var(--color-bg-subtle);font-size:2rem}
.pdt-choice-body{display:flex;flex-direction:column;gap:4px;padding:14px 16px}
.pdt-choice-label{font-weight:600;font-size:1rem;color:var(--color-text)}
.pdt-choice-blurb{font-size:.875rem;color:var(--color-text-muted);line-height:1.45}
.pdt-choice-count{font-size:.8125rem;color:var(--color-text-muted)}
.pdt-choice-more{display:flex;gap:12px;padding:0 16px 12px}
.pdt-link{appearance:none;border:0;background:none;padding:0;font:inherit;font-size:.8125rem;color:var(--color-primary);text-decoration:underline;cursor:pointer}
/* A link hover changes the TEXT and nothing else. No fill: these sit inside
   paragraphs and under options, where a pill of colour behind three words reads
   as a mistake, and --color-text is black on a light theme and white on a dark
   one without either being spelled out. */
.pdt-link:hover{color:var(--color-text)}
.pdt-link:focus-visible{outline:2px solid var(--color-primary);outline-offset:2px}
/* Sits IN the browse grid (see StepBrowse). is-beside is the spare cell at the
   end of a short last row - one button above the other, centred in the hole
   they are filling. is-below is a row of its own, spanning the lot and centred,
   which is the only arrangement that does not look abandoned at one end of an
   otherwise full row. */
.pdt-browse-foot{display:flex;gap:12px}
.pdt-browse-foot.is-below{grid-column:1/-1;flex-wrap:wrap;align-items:center;justify-content:center;padding-top:4px}
.pdt-browse-foot.is-beside{flex-direction:column;align-items:center;justify-content:center;gap:14px}
.pdt-browse-foot .pdt-skip{padding:12px 26px;font-size:.9375rem}
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
.pdt-question-head:hover{text-decoration:underline;text-underline-offset:3px}
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
  /* No ground and no rule of its own: the bar is a place to put the button, not
     a band across the page. Painted, it showed as a strip of the page colour
     above and below the button wherever the section behind it was any other
     shade. The button carries a shadow instead, which is what lifts it off the
     products it now floats over. */
  .pdt-bar{display:flex;position:sticky;bottom:0;z-index:5;gap:10px;padding:10px 0;background:none;border:0}
  .pdt-bar button{flex:1 1 auto}
  /* A tablet's drawer is the full width of the screen, and one tick per line
     leaves three quarters of every row empty. Side by side, the same question
     is three or four columns of ticks and the one under it is on screen with
     it. auto-fit does the phone for free: at 375px only one track fits, which
     is the one-per-line reading anyway.

     minmax(min(100%, 215px), 1fr) rather than minmax(215px, 1fr): the bare form
     cannot shrink below its floor, so a narrow phone would scroll sideways. */
  .pdt-features.pdt-opts-grid .pdt-options{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,215px),1fr));gap:4px 20px;align-items:start}
}
@media (min-width:${tabletBp}){
  .pdt-questions-head{display:none}

  /* Questions across the top ------------------------------------------------
     One column, so the questions stack above the results in DOM order, and each
     question becomes a bordered control in an auto-fitting row rather than a
     line in a list. The row is capped with a rule rather than boxed, which is
     what filters' own "across the top" does, so a site running both does not
     get two different ideas of the same layout.

     minmax(min(100%, 230px), 1fr) and not minmax(230px, 1fr): the bare form
     cannot go narrower than its floor, so at any width under 230px the track
     overflows the page and takes the whole grid sideways with it. */
  /* Block, NOT a one-column grid. A grid item's containing block is its grid
     area, and position:sticky cannot travel outside its containing block -
     so a sticky bar in row one of a two-row grid is pinned to the height of
     row one, which is itself, and never sticks to anything. As a block child
     its containing block is the whole features box, questions and results
     together, which is the height it needs to travel. (This is the same reason
     filters' sticky sidebar works: there the panel's grid area is the full
     height of the results beside it.) The gap becomes a margin with it. */
  .pdt-features.pdt-pos-top{display:block}
  .pdt-features.pdt-pos-top>.pdt-questions{margin-bottom:20px}
  /* Not sticky. The questions stay where they are and scroll away with
     everything else; a floating "Narrow down" button appears when they have
     gone and brings the shopper back to them (see .pdt-jump). scroll-margin-top
     is what stops that jump landing them under the site's own fixed header, and
     it is the variable a site with a taller header moves - spelled the way
     filters' own sticky panel spells its own.
     Wrapped flex, not an auto-fit grid: equal tracks padded "Budget" out to the
     width of "Frame or base colour" and left a field of empty pill. Each closed
     question is now as wide as its own words, and max-width:100% keeps a long
     one on the row rather than sending the page sideways. */
  .pdt-features.pdt-pos-top .pdt-questions{display:flex;flex-direction:row;flex-wrap:wrap;gap:10px;align-items:start;padding:10px 0 22px;border-bottom:1px solid var(--color-border);scroll-margin-top:var(--pdt-sticky-top,7rem)}
  /* An open question takes the whole row and lays its options out across it -
     the same reading as the drawer on a tablet, for the same reason: a question
     the width of its own title leaves three quarters of the row empty once it
     is open. Only one is ever open here (see StepFeatures), so this is one
     band, never a wall. */
  .pdt-features.pdt-pos-top .pdt-question:not(.is-closed){flex:1 1 100%}
  .pdt-features.pdt-pos-top .pdt-question:not(.is-closed) .pdt-options{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,215px),1fr));gap:4px 20px;align-items:start}
  /* The panel's own label earns its place here: down the left the step heading
     is answer enough, but a bare row of controls above the products needs
     saying. The sheet's close button has nothing to close. */
  .pdt-features.pdt-pos-top .pdt-questions-head{display:flex;flex:1 1 100%;align-items:center;padding:0;margin:0;border:0;font-size:.9375rem}
  .pdt-features.pdt-pos-top .pdt-questions-head .pdt-dialog-close{display:none}
  .pdt-features.pdt-pos-top .pdt-question{flex:0 1 auto;max-width:100%;border:1px solid var(--color-border);border-radius:12px;background:var(--color-surface);padding:0;min-width:0}
  .pdt-features.pdt-pos-top .pdt-question-head{padding:11px 14px}
  .pdt-features.pdt-pos-top .pdt-question.is-closed .pdt-question-head{padding-bottom:11px}
  .pdt-features.pdt-pos-top .pdt-question-body{padding:0 14px 12px}
  .pdt-features.pdt-pos-top .pdt-options{padding-bottom:6px}
  .pdt-features.pdt-pos-top .pdt-no-questions{flex:1 1 100%}
}
/* Every colour is a custom property with the module's own as the fallback, so a
   block that sets none looks exactly as it always did and one that sets some
   overrides only those. The values may arrive as light-dark(l, d) - the site
   sets color-scheme, so the browser picks the arm and nothing here has to know
   which mode is on. */
.pdt-bar-btn{appearance:none;border:1px solid var(--pdt-bar-btn-border,var(--color-border));background:var(--pdt-bar-btn-bg,var(--color-surface));border-radius:999px;padding:12px 18px;font:inherit;font-size:.9375rem;color:var(--pdt-bar-btn-fg,var(--color-text));cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,.18)}
.pdt-bar-btn:hover{border-color:var(--pdt-bar-btn-hover-border,var(--color-primary));background:var(--pdt-bar-btn-hover-bg,var(--color-primary-subtle));color:var(--pdt-bar-btn-hover-fg,var(--pdt-bar-btn-fg,var(--color-text)))}
.pdt-bar-btn:focus-visible{outline:2px solid var(--color-primary);outline-offset:2px}
/* The same button as the phone's, floated at the top of the window on a wide
   screen once the questions have scrolled away. Fixed rather than sticky: it
   belongs to the window, not to a box in the flow, and it has to clear the
   site's own header - hence the same offset variable the jump uses. Under the
   dialogs and their scrim, over everything else. */
.pdt-jump{position:fixed;top:var(--pdt-sticky-top,7rem);left:50%;transform:translateX(-50%);z-index:6}

@media (prefers-reduced-motion:reduce){
  .pdt-choice{transition:border-color .25s ease,background .25s ease}
  .pdt-choice:hover{transform:none}
  .pdt-progress-fill,.pdt-dialog,.pdt-questions,.pdt-scrim{transition:none}
}

@media (max-width:${mobileBp}){
  .pdt-browse{grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr));gap:12px}
  .pdt-choice-body{padding:12px}
  .pdt-compare{min-width:420px}
}
`
}
