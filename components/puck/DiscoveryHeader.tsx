// EDITOR half only - see ProductDiscovery.tsx for why the halves are split.
//
// One block rather than the two filter collections use (a heading and an intro).
// A flow page has exactly one thing to say before the wizard starts, and
// splitting that across two blocks would only be two ways to leave one of them
// off a layout.

export type DiscoveryHeaderProps = {
  /** Filled in by the flow's own page route; typed by hand anywhere else. */
  flowSlug?: string
  eyebrow?: string
  showIntro?: string
}

const HEADING: React.CSSProperties = {
  margin: 0,
  fontFamily: 'var(--display-family, Georgia, serif)',
  fontSize: 'clamp(30px, 4vw, 44px)',
  fontWeight: 600,
  lineHeight: 1.1,
  color: 'var(--color-fg)',
}

const EYEBROW: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  color: 'var(--color-primary)',
  marginBottom: '0.75rem',
}

export function DiscoveryHeader(props: DiscoveryHeaderProps) {
  return (
    <div>
      {props.eyebrow && <span style={EYEBROW}>{props.eyebrow}</span>}
      <h1 style={HEADING}>Your flow&rsquo;s heading</h1>
      <p style={{ margin: '0.75rem 0 0', fontSize: '1.0625rem', color: 'var(--color-text-muted)' }}>
        The standfirst you wrote for it, and any designed intro underneath.
      </p>
    </div>
  )
}

export const discoveryHeaderPuckComponent = {
  label: 'Discovery: Heading',
  fields: {
    eyebrow: { type: 'text' as const, label: 'Small line above (optional)' },
    showIntro: {
      type: 'select' as const,
      label: 'Show the designed intro',
      options: [
        { value: 'yes', label: 'Yes' },
        { value: 'no', label: 'No' },
      ],
    },
  },
  defaultProps: {
    eyebrow: '',
    showIntro: 'yes',
  },
  render: DiscoveryHeader,
}
