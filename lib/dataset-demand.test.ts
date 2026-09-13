// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  PDT_DATASET_IDLE_CEILING_MS,
  PDT_DATASET_ROOT_MARGIN,
  watchForDatasetDemand,
  type PdtDatasetDemandEnvironment,
} from '@/modules/product-discovery-tool/lib/dataset-demand'

// When the shell asks for the answer set. It used to ask on idle for every
// visitor; it now asks when the block nears the screen or the shopper reaches
// for it, and falls back to idle wherever that cannot be watched. Every branch
// here is invisible in a typecheck and in the rendered markup - get one wrong
// and either every visitor pays for the set again, or a finder never wakes up.

/** A stand-in observer the test can fire by hand. */
class FakeObserver {
  static instances: FakeObserver[] = []
  observed: Element[] = []
  disconnected = false
  constructor(
    readonly callback: IntersectionObserverCallback,
    readonly options: IntersectionObserverInit | undefined,
  ) {
    FakeObserver.instances.push(this)
  }
  observe(element: Element) {
    this.observed.push(element)
  }
  disconnect() {
    this.disconnected = true
  }
  fire(isIntersecting: boolean) {
    const entry = { isIntersecting } as IntersectionObserverEntry
    this.callback([entry], this as unknown as IntersectionObserver)
  }
}

type Harness = {
  environment: PdtDatasetDemandEnvironment
  idleCalls: { timeout: number; run: () => void; cancelled: boolean }[]
  timeouts: { run: () => void; cleared: boolean }[]
}

function harness({ observer = true, idle = true }: { observer?: boolean; idle?: boolean } = {}): Harness {
  FakeObserver.instances = []
  const idleCalls: Harness['idleCalls'] = []
  const timeouts: Harness['timeouts'] = []
  return {
    idleCalls,
    timeouts,
    environment: {
      IntersectionObserver: observer ? (FakeObserver as unknown as typeof IntersectionObserver) : undefined,
      requestIdleCallback: idle
        ? (run, options) => idleCalls.push({ timeout: options.timeout, run, cancelled: false }) - 1
        : undefined,
      cancelIdleCallback: idle
        ? (handle) => {
            const call = idleCalls[handle]
            if (call) call.cancelled = true
          }
        : undefined,
      setTimeout: (run) => timeouts.push({ run, cleared: false }) - 1,
      clearTimeout: (handle) => {
        const call = timeouts[handle]
        if (call) call.cleared = true
      },
    },
  }
}

function block(): HTMLDivElement {
  const element = document.createElement('div')
  element.appendChild(document.createElement('button'))
  document.body.appendChild(element)
  return element
}

describe('watchForDatasetDemand', () => {
  it('waits while the block is well off the screen, and asks once it comes near', () => {
    const { environment, idleCalls } = harness()
    let asked = 0
    const element = block()
    watchForDatasetDemand({ element, arrivedInsideFlow: false, onDemand: () => asked++, environment })

    const observer = FakeObserver.instances[0]!
    expect(observer.observed).toEqual([element])
    expect(observer.options?.rootMargin).toBe(PDT_DATASET_ROOT_MARGIN)
    // Not on idle: that is exactly the cost this exists to stop.
    expect(idleCalls).toHaveLength(0)

    observer.fire(false)
    expect(asked).toBe(0)
    observer.fire(true)
    expect(asked).toBe(1)
    expect(observer.disconnected).toBe(true)
  })

  it('gives a viewport of lead, so the set is in hand before the question is read', () => {
    expect(PDT_DATASET_ROOT_MARGIN).toBe('100% 0px')
  })

  it('asks on the first interaction if that comes before the observer', () => {
    const { environment } = harness()
    let asked = 0
    const element = block()
    watchForDatasetDemand({ element, arrivedInsideFlow: false, onDemand: () => asked++, environment })

    // From a descendant, as a real press or tab lands.
    element.querySelector('button')!.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    expect(asked).toBe(1)
    expect(FakeObserver.instances[0]!.disconnected).toBe(true)
  })

  it.each(['pointerover', 'pointerdown', 'focusin'])('counts %s as reaching for the block', (type) => {
    const { environment } = harness()
    let asked = 0
    const element = block()
    watchForDatasetDemand({ element, arrivedInsideFlow: false, onDemand: () => asked++, environment })
    element.dispatchEvent(new Event(type, { bubbles: true }))
    expect(asked).toBe(1)
  })

  it('asks only once, however many signals follow', () => {
    const { environment } = harness()
    let asked = 0
    const element = block()
    watchForDatasetDemand({ element, arrivedInsideFlow: false, onDemand: () => asked++, environment })
    element.dispatchEvent(new Event('pointerover', { bubbles: true }))
    element.dispatchEvent(new Event('focusin', { bubbles: true }))
    FakeObserver.instances[0]!.fire(true)
    expect(asked).toBe(1)
  })

  it('falls back to idle, as it always did, where there is no observer', () => {
    const { environment, idleCalls } = harness({ observer: false })
    let asked = 0
    watchForDatasetDemand({ element: block(), arrivedInsideFlow: false, onDemand: () => asked++, environment })
    expect(idleCalls).toHaveLength(1)
    expect(idleCalls[0]!.timeout).toBe(PDT_DATASET_IDLE_CEILING_MS)
    idleCalls[0]!.run()
    expect(asked).toBe(1)
  })

  it('falls back to a zero timeout where there is no idle callback either', () => {
    const { environment, timeouts } = harness({ observer: false, idle: false })
    let asked = 0
    watchForDatasetDemand({ element: block(), arrivedInsideFlow: false, onDemand: () => asked++, environment })
    expect(timeouts).toHaveLength(1)
    timeouts[0]!.run()
    expect(asked).toBe(1)
  })

  it('does not wait for the block when the address already points inside the flow', () => {
    const { environment, idleCalls } = harness()
    let asked = 0
    watchForDatasetDemand({ element: block(), arrivedInsideFlow: true, onDemand: () => asked++, environment })
    // The original idle fetch, not the observer: this visitor came for the finder.
    expect(FakeObserver.instances).toHaveLength(0)
    idleCalls[0]!.run()
    expect(asked).toBe(1)
  })

  it('falls back to idle when there is no element to watch', () => {
    const { environment, idleCalls } = harness()
    let asked = 0
    watchForDatasetDemand({ element: null, arrivedInsideFlow: false, onDemand: () => asked++, environment })
    expect(FakeObserver.instances).toHaveLength(0)
    idleCalls[0]!.run()
    expect(asked).toBe(1)
  })

  it('never asks once the shell has stopped watching', () => {
    const { environment } = harness()
    let asked = 0
    const element = block()
    const stop = watchForDatasetDemand({ element, arrivedInsideFlow: false, onDemand: () => asked++, environment })
    stop()
    expect(FakeObserver.instances[0]!.disconnected).toBe(true)
    element.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    FakeObserver.instances[0]!.fire(true)
    expect(asked).toBe(0)
  })

  it('cancels a pending idle fetch when the shell stops watching', () => {
    const { environment, idleCalls } = harness({ observer: false })
    let asked = 0
    const stop = watchForDatasetDemand({ element: block(), arrivedInsideFlow: false, onDemand: () => asked++, environment })
    stop()
    expect(idleCalls[0]!.cancelled).toBe(true)
    // Even a browser that runs it anyway gets nothing.
    idleCalls[0]!.run()
    expect(asked).toBe(0)
  })
})
