'use client'

import { useEffect, useState } from 'react'
import type { PdtSettings } from '@/modules/product-discovery-tool/lib/types'

const TOGGLES: Array<{ key: keyof PdtSettings; label: string; hint: string }> = [
  {
    key: 'showCounts',
    label: 'Show how many products are behind each answer',
    hint: 'A shopper sees “Height adjustable - 34 desks” rather than guessing whether a choice leads anywhere.',
  },
  {
    key: 'compareEnabled',
    label: 'Offer the side-by-side comparisons',
    hint: 'Lets shoppers put the options - or two or three of the results - beside each other with your own words in the table.',
  },
  {
    key: 'zeroResultRecovery',
    label: 'Never end on “nothing matches”',
    hint: 'When a combination leaves nothing, we offer the nearest ones instead: “6 without Glass top”. Turn this off and the shopper simply gets an empty list.',
  },
  {
    key: 'swapCardImages',
    label: 'Show the matching version’s photo on the results',
    hint: 'With Oak chosen, a product that comes in oak shows its oak photo rather than its usual one.',
  },
  {
    key: 'preselectOnClick',
    label: 'Open products with the chosen options already set',
    hint: 'The shopper does not have to answer the same questions twice on the product page.',
  },
]

// A sub-tab of shop's settings tab rather than a top-level Settings tab, hosted
// through the 'shop.settings-sub-tabs' slot (manifest `host`). Shop lends the
// space and nothing else: own fetch, own save, own permission, own module API.
export function ProductDiscoverySettingsTab() {
  const [settings, setSettings] = useState<PdtSettings | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch('/api/m/product-discovery-tool/admin/settings')
      .then((r) => r.json())
      .then((d: { settings?: PdtSettings }) => {
        if (d.settings) setSettings(d.settings)
      })
      .catch(() => setError('Could not load these settings. Please refresh the page.'))
  }, [])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!settings) return
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      const res = await fetch('/api/m/product-discovery-tool/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Could not save these settings.')
      } else {
        if (data.settings) setSettings(data.settings)
        setSaved(true)
      }
    } catch {
      setError('Could not save these settings.')
    }
    setSaving(false)
  }

  if (!settings) {
    return <p style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
  }

  return (
    <form onSubmit={save}>
      <p style={{ color: 'var(--color-text-muted)', marginBottom: '1.5rem' }}>
        How the guided flows behave for shoppers. What each flow asks, and in what order, is set up on the Products
        screen under Product Discovery.
      </p>

      {TOGGLES.map((t) => (
        <div key={t.key} style={{ marginBottom: '1.25rem' }}>
          <label style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={settings[t.key]}
              onChange={(e) => {
                setSaved(false)
                setSettings({ ...settings, [t.key]: e.target.checked })
              }}
              style={{ marginTop: '0.2rem' }}
            />
            <span>
              <span style={{ display: 'block', color: 'var(--color-text)' }}>{t.label}</span>
              <span style={{ display: 'block', fontSize: '0.875rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>
                {t.hint}
              </span>
            </span>
          </label>
        </div>
      ))}

      {error && <p style={{ color: 'var(--color-error)', marginBottom: '1rem' }}>{error}</p>}
      {saved && !error && <p style={{ color: 'var(--color-text-muted)', marginBottom: '1rem' }}>Saved.</p>}

      <button type="submit" className="btn btn-primary" disabled={saving}>
        {saving ? 'Saving…' : 'Save settings'}
      </button>
    </form>
  )
}
