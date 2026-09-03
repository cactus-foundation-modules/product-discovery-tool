'use client'

import { StandaloneDescriptionBuilder } from '@/modules/shop/components/admin/description-builder/StandaloneDescriptionBuilder'
import { PRODUCT_DISCOVERY_INTRO_LAYOUT_TYPE, type PdtPuckData } from '@/modules/product-discovery-tool/lib/types'

/**
 * A flow's intro builder, on its own full-screen page with none of the admin
 * chrome (the route strips it).
 *
 * The builder itself is the one products and categories already use - this
 * wrapper only points it at a flow row and its intro field. An import of another
 * module's component, which is the sanctioned direction: this module hard-depends
 * on shop, and nothing here is added TO shop.
 */
export function StandaloneIntroEditor({ flowId, flowName, backHref, initialData }: {
  flowId: string
  flowName: string
  backHref: string
  initialData: PdtPuckData | null
}) {
  return (
    <StandaloneDescriptionBuilder
      layoutType={PRODUCT_DISCOVERY_INTRO_LAYOUT_TYPE}
      eyebrow="Editing flow intro"
      title={flowName}
      backHref={backHref}
      backLabel="Back to product discovery"
      initialData={initialData}
      endpoint={`/api/m/product-discovery-tool/admin/flows/${flowId}`}
      field="introPuck"
      unsavedMessage="You have unsaved changes to this intro. Leave without saving?"
    />
  )
}
