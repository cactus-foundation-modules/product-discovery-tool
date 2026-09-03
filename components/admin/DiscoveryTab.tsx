import { headers } from 'next/headers'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasShopPermission } from '@/modules/shop/lib/access'
import { DiscoveryScreen } from '@/modules/product-discovery-tool/components/admin/DiscoveryScreen'

// A tab on Shop > Products, beside Filters, rather than a sidebar link of its
// own. The permission check stays here rather than leaning on the host's: this
// is a component, and one that renders whatever it is handed is a refactor away
// from showing the screen to a role that should never reach it.
export async function DiscoveryTab() {
  const user = await getSessionFromCookie()
  if (!user) return null
  const canAccess = await hasShopPermission(user, 'shop.products', { allowAccess: true })
  if (!canAccess) return <div className="alert alert-danger">You do not have permission to manage product discovery.</div>

  // The admin path is per-site and only knowable from the request, so the client
  // screen is handed it rather than guessing at /cactus-admin.
  const adminPath = (await headers()).get('x-cactus-admin-path') ?? 'cactus-admin'
  return <DiscoveryScreen adminPath={adminPath} />
}
