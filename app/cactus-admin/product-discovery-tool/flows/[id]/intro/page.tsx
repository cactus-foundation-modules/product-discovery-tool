import { headers } from 'next/headers'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasShopPermission } from '@/modules/shop/lib/access'
import { DESCRIPTION_BUILDER_CHROME_OFF_CSS } from '@/modules/shop/components/admin/description-builder/shared'
import { getFlow } from '@/modules/product-discovery-tool/lib/db/flows'
import { StandaloneIntroEditor } from '@/modules/product-discovery-tool/components/admin/StandaloneIntroEditor'

export const metadata = { title: 'Edit flow intro — Admin' }

// The full-screen intro builder, opened in its own tab from the Product
// Discovery tab. It lives under the admin path (so the session gate and rewrites
// apply) but DESCRIPTION_BUILDER_CHROME_OFF_CSS strips the admin shell, leaving
// nothing but the page builder.
export default async function DiscoveryIntroPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionFromCookie()
  if (!user) return null
  if (!(await hasShopPermission(user, 'shop.products'))) {
    return <div className="alert alert-danger">You do not have permission to edit these flows.</div>
  }

  const { id } = await params
  const flow = await getFlow(id)
  if (!flow) return <div className="alert alert-danger">This flow could not be found.</div>

  const adminPath = (await headers()).get('x-cactus-admin-path') ?? ''

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: DESCRIPTION_BUILDER_CHROME_OFF_CSS }} />
      <StandaloneIntroEditor
        flowId={id}
        flowName={flow.name}
        backHref={`/${adminPath}/m/shop/products?tab=product-discovery-tool`}
        initialData={flow.introPuck}
      />
    </>
  )
}
