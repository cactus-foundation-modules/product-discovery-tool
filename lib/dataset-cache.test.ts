import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSharedBuildCache } from '@/modules/product-discovery-tool/lib/dataset-cache'

describe('shared build cache', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('shares one build between everyone inside the window, even while it is running', async () => {
    const cache = createSharedBuildCache<number>(60_000, 8)
    let release = (_: number) => {}
    const build = vi.fn(() => new Promise<number>((resolve) => { release = resolve }))
    const first = cache.get('a', build)
    const second = cache.get('a', build)
    release(7)
    expect(await first).toBe(7)
    expect(await second).toBe(7)
    expect(await cache.get('a', build)).toBe(7)
    expect(build).toHaveBeenCalledTimes(1)
  })

  it('builds again once the window has passed', async () => {
    const cache = createSharedBuildCache<number>(60_000, 8)
    const build = vi.fn(async () => 1)
    await cache.get('a', build)
    vi.advanceTimersByTime(60_000)
    await cache.get('a', build)
    expect(build).toHaveBeenCalledTimes(2)
  })

  it('does not hold on to a failed build', async () => {
    const cache = createSharedBuildCache<number>(60_000, 8)
    await expect(cache.get('a', async () => { throw new Error('no') })).rejects.toThrow('no')
    expect(cache.size()).toBe(0)
    expect(await cache.get('a', async () => 2)).toBe(2)
  })

  it('does not hold an answer it was told not to keep', async () => {
    const cache = createSharedBuildCache<number | null>(60_000, 8, (value) => value !== null)
    expect(await cache.get('gone', async () => null)).toBeNull()
    expect(cache.size()).toBe(0)
  })

  it('drops expired entries on a miss and never exceeds its limit', async () => {
    const cache = createSharedBuildCache<number>(60_000, 2)
    await cache.get('a', async () => 1)
    await cache.get('b', async () => 2)
    await cache.get('c', async () => 3)
    expect(cache.size()).toBe(2)
    vi.advanceTimersByTime(60_000)
    await cache.get('d', async () => 4)
    expect(cache.size()).toBe(1)
  })
})
