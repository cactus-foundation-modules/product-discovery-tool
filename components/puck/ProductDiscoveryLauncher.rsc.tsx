import { connection } from 'next/server'
import { getFlowBySlug } from '@/modules/product-discovery-tool/lib/db/flows'
import { listNodes } from '@/modules/product-discovery-tool/lib/db/nodes'
import { buildNodeTree, formatPickPath, parsePickPath, walkPath, PICK_PARAM } from '@/modules/product-discovery-tool/lib/flow'
import { LauncherCard, productDiscoveryLauncherPuckComponent, type ProductDiscoveryLauncherProps } from './ProductDiscoveryLauncher'

// Server (RSC) half of Discovery: Launcher.
//
// A card that drops a shopper into the middle of a flow - "Find your desk" on
// the Desks category page, arriving at step two with Desks already answered.
// The same deep link the flow writes for itself, so nothing about the launcher
// is a second way of addressing a step.
//
// A launcher pointing at nothing renders NOTHING rather than a card that 404s:
// a flow may have been unpublished or a node renamed since somebody dropped
// this on a page, and a dead call to action is worse than no call to action.
export async function ProductDiscoveryLauncherRsc(props: ProductDiscoveryLauncherProps) {
  await connection()
  const slug = (props.flowSlug ?? '').trim()
  if (!slug) return null
  const flow = await getFlowBySlug(slug)
  if (!flow || flow.status !== 'PUBLISHED') return null

  // A path naming a node that no longer exists is trimmed back to the part that
  // still resolves, rather than passed through to land on "we could not find
  // that". The shopper gets as far into the flow as the configuration allows.
  const wanted = parsePickPath(props.pick)
  const path = wanted.length > 0 ? walkPath(buildNodeTree(await listNodes(flow.id)), wanted).nodes.map((n) => n.slug) : []
  const pick = formatPickPath(path)
  const href = pick ? `/${flow.slug}?${PICK_PARAM}=${encodeURIComponent(pick)}` : `/${flow.slug}`

  return (
    <LauncherCard
      heading={props.heading || flow.heading || flow.name}
      blurb={props.blurb || flow.standfirst || ''}
      ctaLabel={props.ctaLabel || 'Start'}
      imageUrl={props.imageUrl || undefined}
      href={href}
    />
  )
}

export const productDiscoveryLauncherPuckRscComponent = {
  ...productDiscoveryLauncherPuckComponent,
  render: ProductDiscoveryLauncherRsc,
}
