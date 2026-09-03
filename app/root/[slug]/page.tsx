import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Render } from '@puckeditor/core/rsc'
import { getSiteUrlOrNull } from '@/lib/config/env'
import { getSessionFromCookie } from '@/lib/auth/session'
import { resolveThemeLayout } from '@/lib/layout/resolveThemeLayout'
import { getModuleLayoutPuckRscConfig } from '@/lib/puck/config.rsc'
import { getShopGate, hasShopPermission } from '@/modules/shop/lib/access'
import { ShopClosedNotice, ShopStaffPreviewBanner } from '@/modules/shop/components/public/ShopClosedNotice'
import { getFlowBySlug } from '@/modules/product-discovery-tool/lib/db/flows'
import { injectDiscoveryContext } from '@/modules/product-discovery-tool/lib/inject-discovery-context'
import { formatPickPath, parsePickPath, PICK_PARAM } from '@/modules/product-discovery-tool/lib/flow'
import { PRODUCT_DISCOVERY_LAYOUT_TYPE, type PdtFlow, type PdtPuckData } from '@/modules/product-discovery-tool/lib/types'
import { DiscoveryIntroBody } from '@/modules/product-discovery-tool/components/public/DiscoveryIntroBody'
import { ProductDiscoveryRsc } from '@/modules/product-discovery-tool/components/puck/ProductDiscovery.rsc'

// A flow's page, at the bare top-level address it owns.
//
// Reached only through core's bare-slug route, via the publicRootSlug claim in
// cactus.module.json - which is why this sits outside app/public/, where every
// page file would also be mounted under a base path. Core has already asked
// discoveryClaimsRootSlug() before it gets here, so a row with this slug exists;
// whether it may be SHOWN is decided below, not by the claim, so staff keep
// their preview of a draft.

type Props = {
  params: Promise<{ slug: string }>
  // Read for `?pick=`, the browse path. A block cannot read the address it is
  // served at, so the route reads it and writes it into the block's props.
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function pickFromParams(params: Record<string, string | string[] | undefined>): string {
  const raw = params[PICK_PARAM]
  return formatPickPath(parsePickPath(Array.isArray(raw) ? raw[0] : raw))
}

// Draft flows are staff-only. Resolved the same way in both halves of the file
// so the tab title can never publish a page the body refuses to render.
async function mayPreviewDraft(): Promise<boolean> {
  const user = await getSessionFromCookie()
  if (!user) return false
  return hasShopPermission(user, 'shop.products', { allowAccess: true })
}

async function resolveVisible(slug: string): Promise<{ flow: PdtFlow; draft: boolean } | null> {
  const flow = await getFlowBySlug(slug)
  if (!flow) return null
  if (flow.status === 'PUBLISHED') return { flow, draft: false }
  if (!(await mayPreviewDraft())) return null
  return { flow, draft: true }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  // A closed shop must not publish these page names either, exactly as shop's
  // own surfaces withhold theirs.
  if ((await getShopGate()).blocked) return {}
  const visible = await resolveVisible(slug)
  if (!visible) return {}
  const { flow, draft } = visible

  const siteUrl = getSiteUrlOrNull()
  const description = flow.metaDescription || flow.standfirst || undefined
  return {
    title: flow.metaTitle || flow.heading || flow.name,
    description,
    // Self-canonical at the bare address, with no query string on it. Every
    // answer the shopper gives writes itself into the query string, so without
    // this each combination would read to a crawler as a separate address for
    // the same page - and unlike a filter collection, these combinations are not
    // pages anybody meant to publish.
    ...(siteUrl ? { alternates: { canonical: `${siteUrl}/${flow.slug}` } } : {}),
    // A flow still in draft is only visible to staff, so it must never be
    // indexed regardless of the owner's own setting.
    ...(flow.noindex || draft ? { robots: { index: false, follow: true } } : {}),
    ...(flow.ogImage
      ? { openGraph: { title: flow.metaTitle || flow.heading || flow.name, description, images: [{ url: flow.ogImage }] } }
      : {}),
  }
}

export default async function ProductDiscoveryFlowPage({ params, searchParams }: Props) {
  const { slug } = await params
  const pick = pickFromParams(await searchParams)
  const gate = await getShopGate()
  if (gate.blocked) return <ShopClosedNotice message={gate.message} />

  const visible = await resolveVisible(slug)
  if (!visible) notFound()
  const { flow, draft } = visible

  const banners = (
    <>
      {gate.staffPreview && <ShopStaffPreviewBanner />}
      {draft && (
        <div style={{ margin: 0, borderRadius: 0, padding: '0.75rem 1.5rem', textAlign: 'center', background: 'var(--color-warning-bg)', color: 'var(--color-warning)', fontSize: '0.875rem', fontWeight: 500 }}>
          Draft — not visible to the public
        </div>
      )}
    </>
  )

  // One designed layout, stamped for every flow - the same arrangement the
  // shop's Category layout has with its categories. The flow's own slug and the
  // address's browse path are written into the blocks' props on the way past.
  const layout = await resolveThemeLayout(PRODUCT_DISCOVERY_LAYOUT_TYPE, { moduleName: 'product-discovery-tool', slug: flow.slug })
  if (layout?.builderData) {
    const data = injectDiscoveryContext(layout.builderData as PdtPuckData, { flowSlug: flow.slug, pick })
    return (
      <>
        {banners}
        {/* `as any`: Puck's RSC Render is typed against a concrete config and
            the module config is assembled at runtime. */}
        <Render config={getModuleLayoutPuckRscConfig(PRODUCT_DISCOVERY_LAYOUT_TYPE) as any} data={data as any} />
      </>
    )
  }

  // No layout published yet: the plain version of the same page, so a flow works
  // the day it is created. The starter layout is seeded published on install, so
  // this is the resting state only on a site whose owner has unpublished it.
  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '2rem 1.5rem' }}>
      {banners}
      <h1 style={{ fontSize: '1.75rem', margin: 0 }}>{flow.heading || flow.name}</h1>
      {flow.standfirst && (
        <p style={{ color: 'var(--color-text-muted)', marginTop: '0.5rem' }}>{flow.standfirst}</p>
      )}
      <DiscoveryIntroBody intro={flow.introPuck} style={{ marginTop: '1.5rem' }} />
      <div style={{ marginTop: '1.5rem' }}>
        <ProductDiscoveryRsc flowSlug={flow.slug} pick={pick} columns={3} />
      </div>
    </div>
  )
}
