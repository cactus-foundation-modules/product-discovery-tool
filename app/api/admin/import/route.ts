import { NextResponse } from 'next/server'
import { requireShopUser } from '@/modules/shop/lib/access'
import { FlowFileSchema, importFlowFile, validateFlowFile } from '@/modules/product-discovery-tool/lib/import-export'

// Validate, then apply, as two calls to one endpoint.
//
// `?dryRun=1` resolves every reference and reports what names nothing, writing
// nothing at all. On a live site the report is read first, always - which is
// why the real import refuses outright if the dry run would have reported
// anything, rather than applying the good half.
export async function POST(request: Request) {
  const gate = await requireShopUser('shop.products')
  if (gate.error) return gate.error
  const parsed = FlowFileSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({
      error: 'That file is not a flow this version understands.',
      problems: parsed.error.issues.map((issue) => ({ where: issue.path.join('.') || 'the file', problem: issue.message })),
    }, { status: 400 })
  }
  const dryRun = new URL(request.url).searchParams.get('dryRun') === '1'
  if (dryRun) return NextResponse.json({ dryRun: true, report: await validateFlowFile(parsed.data) })
  const { report, flowId } = await importFlowFile(parsed.data)
  if (!report.ok) return NextResponse.json({ dryRun: false, report }, { status: 400 })
  return NextResponse.json({ dryRun: false, report, flowId })
}
