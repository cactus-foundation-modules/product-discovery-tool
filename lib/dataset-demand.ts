// When the shell asks for the flow's answer set.
//
// It used to ask as soon as the browser went idle after mount, for every
// visitor to every page the block sat on. Measured on the live homepage that is
// 167 KB of gzip over the wire, 670 KB of JSON for the main thread to parse, and
// 3.4 seconds at the origin on a cold copy - paid by the large majority who
// scroll straight past the finder or never reach it.
//
// So it now asks when the block is about to matter, whichever comes first:
//
//  - the block comes within about a viewport of the screen. A viewport of lead
//    is what keeps the original reason for fetching early: by the time anybody
//    has read the first question the set has usually arrived, so engaging with
//    the flow still feels immediate. A block that sits in the first viewport
//    is already inside that margin and asks at once, which is right;
//  - the shopper points at it, presses on it, or tabs into it. Belt and braces
//    for a block the observer cannot see - one inside a panel that was hidden
//    when the page loaded, say - since nobody can interact with a thing without
//    it having become visible first.
//
// And the way it always did - once the browser is idle - wherever the observer
// is not there to ask, and wherever the shopper arrived on a link to a point
// INSIDE the flow: that visitor came for the finder, so there is nothing to wait
// for.
//
// No React and nothing that reaches the server, so the shell can import it and
// the tests can drive it with a fake observer.

/** How far outside the screen the block counts as "about to be seen": one
 *  viewport's height above and below. Percentages resolve against the viewport
 *  for the implicit root. */
export const PDT_DATASET_ROOT_MARGIN = '100% 0px'

/** The idle fallback's ceiling. An idle moment almost always comes first; this
 *  is for a page that never goes idle, which should not leave the finder inert
 *  for ever. */
export const PDT_DATASET_IDLE_CEILING_MS = 1500

/** The interactions that count as reaching for the block. `pointerover` gives a
 *  head start of a few hundred milliseconds on a click; `focusin` covers a
 *  keyboard. Each is removed after the first. */
export const PDT_DATASET_INTERACTION_EVENTS = ['pointerover', 'pointerdown', 'focusin'] as const

/** The browser facilities the watcher leans on, handed in so a test can supply
 *  its own. `undefined` means the browser does not have that one. */
export type PdtDatasetDemandEnvironment = {
  IntersectionObserver: typeof IntersectionObserver | undefined
  requestIdleCallback: ((callback: () => void, options: { timeout: number }) => number) | undefined
  cancelIdleCallback: ((handle: number) => void) | undefined
  setTimeout: (callback: () => void, delayMs: number) => number
  clearTimeout: (handle: number) => void
}

/** The real browser's facilities. Only ever called in the browser, from an
 *  effect. */
export function browserDatasetDemandEnvironment(): PdtDatasetDemandEnvironment {
  return {
    IntersectionObserver: typeof window.IntersectionObserver === 'function' ? window.IntersectionObserver : undefined,
    requestIdleCallback: typeof window.requestIdleCallback === 'function'
      ? (callback, options) => window.requestIdleCallback(callback, options)
      : undefined,
    cancelIdleCallback: typeof window.cancelIdleCallback === 'function'
      ? (handle) => window.cancelIdleCallback(handle)
      : undefined,
    setTimeout: (callback, delayMs) => window.setTimeout(callback, delayMs),
    clearTimeout: (handle) => window.clearTimeout(handle),
  }
}

export type PdtDatasetDemandOptions = {
  /** The block's own outermost element, watched and listened on. Null falls
   *  back to the idle behaviour, because there is nothing to watch. */
  element: HTMLElement | null
  /** The shopper arrived on an address that already points inside the flow, so
   *  the set is wanted regardless of where the block sits. */
  arrivedInsideFlow: boolean
  /** Called at most once, when the set is wanted. */
  onDemand: () => void
  environment: PdtDatasetDemandEnvironment
}

/**
 * Start watching for the moment the answer set is wanted.
 *
 * Returns the function that stops watching, for the effect's cleanup. Calling
 * it after the demand has fired is harmless, and after it has been called the
 * demand never fires.
 */
export function watchForDatasetDemand(options: PdtDatasetDemandOptions): () => void {
  const { element, arrivedInsideFlow, onDemand, environment } = options
  let settled = false
  const stopWatching: Array<() => void> = []
  const stop = () => {
    for (const undo of stopWatching.splice(0)) undo()
  }
  const demand = () => {
    if (settled) return
    settled = true
    stop()
    onDemand()
  }

  const Observer = environment.IntersectionObserver
  if (arrivedInsideFlow || !element || !Observer) {
    // The original behaviour, unchanged: after paint, so parsing never lands in
    // front of the first frame.
    const { requestIdleCallback, cancelIdleCallback } = environment
    if (requestIdleCallback && cancelIdleCallback) {
      const handle = requestIdleCallback(demand, { timeout: PDT_DATASET_IDLE_CEILING_MS })
      stopWatching.push(() => cancelIdleCallback(handle))
    } else {
      const handle = environment.setTimeout(demand, 0)
      stopWatching.push(() => environment.clearTimeout(handle))
    }
  } else {
    const observer = new Observer(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) demand()
      },
      { rootMargin: PDT_DATASET_ROOT_MARGIN },
    )
    observer.observe(element)
    stopWatching.push(() => observer.disconnect())
  }

  if (element) {
    for (const type of PDT_DATASET_INTERACTION_EVENTS) {
      element.addEventListener(type, demand, { passive: true })
      stopWatching.push(() => element.removeEventListener(type, demand))
    }
  }

  return () => {
    settled = true
    stop()
  }
}
