import { prisma } from '@/lib/db/prisma'
import type { MediaReferenceChange } from '@/lib/media/reference-rewriters'

// Provider for the core.media-reference-rewriters extension point.
//
// The guidance pictures are media items held as urls rather than ids - a browse
// node's photograph, an option note's illustration, a flow's social share image
// - so a blob that moves would otherwise take the pictures out of the flow with
// nothing reporting it. A flow's designed intro holds more of the same inside
// its document.
export async function discoveryMediaReferenceRewriter(change: MediaReferenceChange): Promise<void> {
  const { oldUrl, newUrl, oldKey, newKey } = change

  // A needle is only worth swapping when it actually moved; '' reads as "nothing
  // to do for this pair", since replace() with an empty needle returns the
  // string untouched and the WHERE guards keep it from matching every row.
  const urlFrom = oldUrl && oldUrl !== newUrl ? oldUrl : ''
  const keyFrom = oldKey && oldKey !== newKey ? oldKey : ''
  if (!urlFrom && !keyFrom) return

  if (urlFrom) {
    await prisma.$executeRaw`
      UPDATE "pdt_nodes" SET "image_url" = ${newUrl} WHERE "image_url" = ${urlFrom}
    `
    await prisma.$executeRaw`
      UPDATE "pdt_option_notes" SET "image_url" = ${newUrl} WHERE "image_url" = ${urlFrom}
    `
    await prisma.$executeRaw`
      UPDATE "pdt_flows" SET "og_image" = ${newUrl} WHERE "og_image" = ${urlFrom}
    `
  }

  // The intro document is Puck JSON, so the swap happens inside the blob - and
  // in one statement rather than read-swap-write, exactly as core does for page
  // and layout content. Postgres holds the row for the duration of an UPDATE, so
  // two images on the same intro rewritten at the same time stack instead of the
  // second one putting the first one's dead url back.
  //
  // strpos rather than LIKE: these needles carry filenames, and an underscore in
  // a filename would be read as a wildcard.
  await prisma.$executeRaw`
    UPDATE "pdt_flows"
    SET "intro_puck" = replace(replace("intro_puck"::text, ${urlFrom}, ${newUrl}), ${keyFrom}, ${newKey})::jsonb
    WHERE (${urlFrom} <> '' AND strpos("intro_puck"::text, ${urlFrom}) > 0)
       OR (${keyFrom} <> '' AND strpos("intro_puck"::text, ${keyFrom}) > 0)
  `
}
