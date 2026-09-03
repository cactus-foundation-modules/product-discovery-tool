import { connection } from 'next/server'
import { getFlowBySlug } from '@/modules/product-discovery-tool/lib/db/flows'
import { DiscoveryIntroBody } from '@/modules/product-discovery-tool/components/public/DiscoveryIntroBody'
import { discoveryHeaderPuckComponent, type DiscoveryHeaderProps } from './DiscoveryHeader'

// Server (RSC) half of Discovery: Heading. Kept out of the client editor bundle
// - see DiscoveryHeader.tsx.

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

export async function DiscoveryHeaderRsc(props: DiscoveryHeaderProps) {
  await connection()
  if (!props.flowSlug) return null
  const flow = await getFlowBySlug(props.flowSlug)
  if (!flow) return null

  return (
    <div>
      {props.eyebrow && <span style={EYEBROW}>{props.eyebrow}</span>}
      <h1 style={HEADING}>{flow.heading || flow.name}</h1>
      {flow.standfirst && (
        <p style={{ margin: '0.75rem 0 0', fontSize: '1.0625rem', color: 'var(--color-text-muted)' }}>{flow.standfirst}</p>
      )}
      {props.showIntro !== 'no' && <DiscoveryIntroBody intro={flow.introPuck} style={{ marginTop: '1.25rem' }} />}
    </div>
  )
}

export const discoveryHeaderPuckRscComponent = {
  ...discoveryHeaderPuckComponent,
  render: DiscoveryHeaderRsc,
}
