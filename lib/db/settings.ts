import { prisma } from '@/lib/db/prisma'
import type { PdtSettings } from '@/modules/product-discovery-tool/lib/types'

const DEFAULTS: PdtSettings = {
  zeroResultRecovery: true,
  showCounts: true,
  compareEnabled: true,
  swapCardImages: true,
  preselectOnClick: true,
}

export function discoverySettingsDefaults(): PdtSettings {
  return { ...DEFAULTS }
}

export async function getSettings(): Promise<PdtSettings> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT * FROM "pdt_settings" WHERE "id" = 'singleton' LIMIT 1
  `
  const row = rows[0]
  if (!row) return { ...DEFAULTS }
  return {
    zeroResultRecovery: (row.zero_result_recovery as boolean) ?? DEFAULTS.zeroResultRecovery,
    showCounts: (row.show_counts as boolean) ?? DEFAULTS.showCounts,
    compareEnabled: (row.compare_enabled as boolean) ?? DEFAULTS.compareEnabled,
    swapCardImages: (row.swap_card_images as boolean) ?? DEFAULTS.swapCardImages,
    preselectOnClick: (row.preselect_on_click as boolean) ?? DEFAULTS.preselectOnClick,
  }
}

export async function updateSettings(fields: Partial<PdtSettings>): Promise<void> {
  if (Object.values(fields).every((value) => value === undefined)) return
  await prisma.$executeRaw`
    INSERT INTO "pdt_settings" ("id") VALUES ('singleton') ON CONFLICT ("id") DO NOTHING
  `
  await prisma.$executeRaw`
    UPDATE "pdt_settings" SET
      "zero_result_recovery" = COALESCE(${fields.zeroResultRecovery ?? null}::boolean, "zero_result_recovery"),
      "show_counts" = COALESCE(${fields.showCounts ?? null}::boolean, "show_counts"),
      "compare_enabled" = COALESCE(${fields.compareEnabled ?? null}::boolean, "compare_enabled"),
      "swap_card_images" = COALESCE(${fields.swapCardImages ?? null}::boolean, "swap_card_images"),
      "preselect_on_click" = COALESCE(${fields.preselectOnClick ?? null}::boolean, "preselect_on_click"),
      "updated_at" = CURRENT_TIMESTAMP
    WHERE "id" = 'singleton'
  `
}
