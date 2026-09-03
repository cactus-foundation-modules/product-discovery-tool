import { Render } from '@puckeditor/core/rsc'
import type { Data } from '@puckeditor/core'
import { PRODUCT_DISCOVERY_INTRO_LAYOUT_TYPE, hasIntroContent, type PdtPuckData } from '@/modules/product-discovery-tool/lib/types'

// A flow's designed intro. Shared by the Heading block and the built-in page
// shell, so both make the same call about whether there is one.
export async function DiscoveryIntroBody({ intro, className, style }: {
  intro: PdtPuckData | null
  className?: string
  style?: React.CSSProperties
}) {
  if (!hasIntroContent(intro)) return null
  // config.rsc pulls in next/headers through other modules' RSC blocks, so it
  // stays a dynamic import - same reason shop's description body does it.
  const { getModuleLayoutPuckRscConfig } = await import('@/lib/puck/config.rsc')
  return (
    <div className={className} style={style}>
      {/* `as any`: Puck's RSC Render is typed against a concrete config and the
          module config is assembled at runtime - the same cast every surface
          that stamps a document makes. */}
      <Render config={getModuleLayoutPuckRscConfig(PRODUCT_DISCOVERY_INTRO_LAYOUT_TYPE) as any} data={intro as Data} />
    </div>
  )
}
