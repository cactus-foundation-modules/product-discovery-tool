// EDITOR half only - see ProductDiscovery.tsx for why the halves are split.
//
// The launcher names its target by SLUGS, never by id: a Puck field is static
// configuration typed by a person, and slugs are what the admin screens show
// and what the flow's own address carries anyway.

export type ProductDiscoveryLauncherProps = {
  /** The flow's address, without the leading slash: `find-your-desk`. */
  flowSlug?: string
  /** Where in the flow to land, as the browse path: `desks/height-adjustable`.
   *  Blank starts at the first step. */
  pick?: string
  heading?: string
  blurb?: string
  ctaLabel?: string
  imageUrl?: string
}

const CARD: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  border: '1px solid var(--color-border)',
  borderRadius: 14,
  padding: '20px 22px',
  background: 'var(--color-surface)',
  color: 'var(--color-text)',
}

/** The card itself, shared by both halves so the editor canvas and the live
 *  page emit identical markup (standing invariant). */
export function LauncherCard({ heading, blurb, ctaLabel, imageUrl, href }: {
  heading: string
  blurb: string
  ctaLabel: string
  imageUrl?: string
  href?: string
}) {
  const body = (
    <>
      {imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- media library URLs are arbitrary remote hosts, not a configured next/image loader
        <img src={imageUrl} alt="" loading="lazy" style={{ width: '100%', borderRadius: 10, aspectRatio: '16/9', objectFit: 'cover' }} />
      )}
      <strong style={{ fontSize: '1.125rem' }}>{heading}</strong>
      {blurb && <span style={{ color: 'var(--color-text-muted)', fontSize: '0.9375rem' }}>{blurb}</span>}
      <span className="pdt-more" style={{ alignSelf: 'flex-start' }}>{ctaLabel}</span>
    </>
  )
  if (!href) return <div style={CARD}>{body}</div>
  return (
    <a href={href} style={{ ...CARD, textDecoration: 'none' }}>
      {body}
    </a>
  )
}

export function ProductDiscoveryLauncher(props: ProductDiscoveryLauncherProps) {
  const slug = (props.flowSlug ?? '').trim()
  return (
    <>
      {!slug && (
        // The live page renders nothing at all for a launcher pointing nowhere.
        // Saying so here is the only chance anyone gets to notice.
        <p style={{ margin: '0 0 8px', fontSize: '0.8125rem', color: 'var(--color-warning)' }}>
          This launcher has no flow address yet, so it will not appear on the page.
        </p>
      )}
      <LauncherCard
        heading={props.heading || 'Find the right one'}
        blurb={props.blurb || ''}
        ctaLabel={props.ctaLabel || 'Start'}
        imageUrl={props.imageUrl || undefined}
      />
    </>
  )
}

export const productDiscoveryLauncherPuckComponent = {
  label: 'Discovery: Launcher',
  fields: {
    flowSlug: { type: 'text' as const, label: 'Flow address (e.g. find-your-desk)' },
    pick: { type: 'text' as const, label: 'Start at (e.g. desks/height-adjustable)' },
    heading: { type: 'text' as const, label: 'Heading' },
    blurb: { type: 'textarea' as const, label: 'One line under it' },
    ctaLabel: { type: 'text' as const, label: 'Button label' },
    imageUrl: { type: 'text' as const, label: 'Picture URL (optional)' },
  },
  defaultProps: {
    flowSlug: '',
    pick: '',
    heading: 'Find the right one',
    blurb: 'A few questions and we will narrow it down with you.',
    ctaLabel: 'Start',
    imageUrl: '',
  },
  render: ProductDiscoveryLauncher,
}
