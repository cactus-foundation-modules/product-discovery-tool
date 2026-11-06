// A very small shared memory for the flow's answer set.
//
// One pass over the flow costs about a second of database and render time, and
// every uncached view of a page carrying the block ran it, as did the dataset
// route behind it. Nothing in the answer depends on who is asking - the prices are
// quoted against the shop's default tax zone, not a shopper's - so everyone arriving
// within the same minute can share one. A request landing while the pass is still
// running waits on that one rather than starting its own.
//
// What waits out the minute is a catalogue or flow edit, the same bargain the filter
// match cache beneath this makes, and well inside what the CDN already holds the
// dataset route's answer for.

type Entry<T> = { at: number; value: Promise<T> }

export type SharedBuildCache<T> = {
  /** The answer under `key`, building it only if nothing fresh is held. */
  get(key: string, build: () => Promise<T>): Promise<T>
  size(): number
  clear(): void
}

/**
 * `keep` says whether an answer is worth holding at all. A failed build is never
 * held, or the next minute's visitors would all inherit the failure.
 *
 * Bounded twice over, because part of the key comes from a public address: expired
 * entries go on every miss, and the oldest goes once `max` is reached.
 */
export function createSharedBuildCache<T>(ttlMs: number, max: number, keep: (value: T) => boolean = () => true): SharedBuildCache<T> {
  const entries = new Map<string, Entry<T>>()
  const dropIfCurrent = (key: string, value: Promise<T>) => {
    if (entries.get(key)?.value === value) entries.delete(key)
  }
  return {
    get(key, build) {
      const now = Date.now()
      const hit = entries.get(key)
      if (hit && now - hit.at < ttlMs) return hit.value
      // Insertion order is age order, so the first fresh entry ends the sweep.
      for (const [oldKey, entry] of entries) {
        if (now - entry.at < ttlMs) break
        entries.delete(oldKey)
      }
      const value = build()
      entries.delete(key)
      entries.set(key, { at: now, value })
      while (entries.size > max) entries.delete(entries.keys().next().value as string)
      value.then(
        (answer) => {
          if (!keep(answer)) dropIfCurrent(key, value)
        },
        () => dropIfCurrent(key, value),
      )
      return value
    },
    size: () => entries.size,
    clear: () => entries.clear(),
  }
}
