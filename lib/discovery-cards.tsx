import { Render } from '@puckeditor/core/rsc'
import type { Data } from '@puckeditor/core'
import { withCardAdminEditHrefs } from '@/modules/shop/lib/card-template'
import { injectShopProductCardEmbed } from '@/modules/shop/lib/inject-part-context'
import { formatMoney } from '@/modules/shop/lib/money'
import { productHref, type ProductUrlStyle } from '@/modules/shop/lib/product-url'
import type { PuckData } from '@/modules/shop/lib/types'
import type { CardItem } from '@/modules/shop/lib/card-template'

// Cards in the shop's own Product Card layout, tagged so the wizard can show,
// hide and re-dress them in place. The flow never invents a card design.
//
// The anchor shape deliberately mirrors shop's own renderCards rather than
// calling it: the only difference is the data-pdt-product tag the shell hangs
// its narrowing on, and shop's helper has nowhere to hang it. Template
// resolution, context building and the injected embed all still come from shop,
// so a change to the card design lands here too.
//
// Lifted into a file of its own so the block and the server function behind
// on-demand paging stamp cards through the SAME code. Page one and page nine
// differing by a stray class is a bug nobody notices until a shopper scrolls.
//
// `eagerCount` matches shop's renderCards: how many cards at the front of this
// list are above the fold and so load their picture eagerly. The first render
// passes its column count; the fetched pages pass nothing, because a page the
// shopper scrolled to is by definition already scrolled past.
export async function renderDiscoveryCards(template: PuckData | null, items: CardItem[], urlStyle: ProductUrlStyle, eagerCount = 0) {
  const { getModuleLayoutPuckRscConfig } = await import('@/lib/puck/config.rsc')
  const config = getModuleLayoutPuckRscConfig('shopProductCard')
  // Every block registered for the card layout type, exactly as shop's own
  // renderCards passes - without it a companion module's card part renders its
  // editor skeleton on the live grid.
  const partTypes = config.categories.blocks.components
  const withEdit = await withCardAdminEditHrefs(items)
  return withEdit.map(({ product, ctx }, at) => (
    // Same wrapper shape as shop's renderCards: a div with a stretched link
    // sibling, so any carousel arrows and overlay controls are real buttons
    // above the link rather than interactive content nested in an <a>.
    <div key={product.id} className="shop-card" data-pdt-product={product.id}>
      <a className="shop-card-link" href={ctx.productHref ?? productHref(product.slug, urlStyle)} aria-label={product.name} />
      {template ? (
        // `as any`: Puck's RSC Render is typed against a concrete config and the
        // module config is assembled at runtime - the same cast every surface
        // that stamps a document makes.
        <Render config={config as any} data={injectShopProductCardEmbed(template, at < eagerCount ? { ...ctx, eager: true } : ctx, partTypes) as Data} />
      ) : (
        <>
          <div className="shop-card-img">
            {ctx.image && (
              // Lazy, matching shop's own card part: a grid draws a card
              // hundreds of times over, so the untemplated fallback cannot be
              // the eager one.
              // eslint-disable-next-line @next/next/no-img-element -- media library URLs are arbitrary remote hosts, not a configured next/image loader
              <img src={ctx.image.url} alt={ctx.image.alt} loading="lazy" decoding="async" />
            )}
          </div>
          <h3 className="shop-card-name">{product.name}</h3>
          <div className="shop-card-pricerow">
            {ctx.fromPrice != null ? (
              <span className="shop-card-price">{ctx.fromPriceVaries ? 'From ' : ''}{formatMoney(ctx.fromPrice, ctx.currencySymbol)}</span>
            ) : (
              <>
                <span className="shop-card-price">{formatMoney(ctx.prices.now, ctx.currencySymbol)}</span>
                {ctx.prices.was && <span className="shop-card-compare">{formatMoney(ctx.prices.was, ctx.currencySymbol)}</span>}
              </>
            )}
          </div>
        </>
      )}
    </div>
  ))
}
