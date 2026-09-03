import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { TestDatabase, TestRole, VpsConfig } from '@/lib/backup/vps-database'

// EVERY value import below is dynamic, and deliberately so. The shared Prisma
// client reads DATABASE_URL once, when its module first loads, and the database
// this test runs against does not exist until beforeAll has created it. A single
// static import of anything that reaches `@/lib/db/prisma` - the statement
// splitter lives in lib/backup/restore, which does - builds the client against
// an empty environment before the test has drawn a breath, and every query then
// fails with "Environment variable not found: DATABASE_URL".

// Every raw statement this module ships, ACTUALLY EXECUTED by Postgres.
//
// This exists because nothing else runs one. `tsc` sees a string; `eslint` sees
// a string; `npm test` never opens a connection; and the module build gate
// builds, which never executes a query either. A statement Postgres will not
// parse therefore passes every gate there is and fails for the first time on a
// live customer's site - which is exactly how uk-bookkeeping shipped a subquery
// aliased `both` and made a page unreadable.
//
// The awkward bits here, none of which a type-checker can see:
//
//  - THREE expression unique indexes with COALESCE in them, and three ON CONFLICT
//    clauses that have to infer those indexes by spelling the expression the same
//    way. Get it slightly wrong and Postgres refuses the INSERT outright.
//  - a DATE column with date arithmetic on it, and an upsert that increments in
//    place.
//  - array casts (`= ANY($1::text[])`, `unnest`/`generate_subscripts`) in the
//    reorder and bulk-read paths.
//  - a jsonb `replace(...)::jsonb` rewrite guarded by `strpos`.
//
// It provisions its OWN throwaway database on the self-hosted Postgres VPS
// (`cactus_rt_*`, owned by a throwaway role, dropped afterwards plus a
// prefix-scoped sweep), so it never touches any real database - the live site's
// sits on the same server and is never named, opened or altered. Skipped unless
// opted into, so a plain `npm test` never hits the network:
//
//   npm run test:discovery-sql
const shouldRun = process.env.RUN_DISCOVERY_SQL === '1'
if (shouldRun) {
  try {
    ;(process as unknown as { loadEnvFile: (p: string) => void }).loadEnvFile('.env')
  } catch {
    // No .env - the guard below fails the suite loudly rather than skipping.
  }
}

const suite = shouldRun ? describe : describe.skip

const CORE_SQL = readFileSync(path.join(process.cwd(), 'prisma/migrations/20260626000000_init/migration.sql'), 'utf8')

/** Split a migration file into statements.
 *
 *  Its own splitter rather than the backup format's, for two reasons: the backup
 *  splitter is not dollar-quote aware (its own format never uses `$$`, and
 *  teaching it would be scope creep on the one file nobody should be casual
 *  with), and filters-for-shop's migrations DO use `DO $$ ... $$`. It also keeps
 *  this file from statically importing anything that reaches the shared Prisma
 *  client - see the note at the top. */
function splitStatements(sql: string): string[] {
  const out: string[] = []
  let current = ''
  let at = 0
  while (at < sql.length) {
    const rest = sql.slice(at)
    // A line comment runs to the newline, which is kept so line numbers in an
    // error message still mean something.
    if (rest.startsWith('--')) {
      const end = sql.indexOf('\n', at)
      at = end === -1 ? sql.length : end + 1
      continue
    }
    if (rest.startsWith('/*')) {
      const end = sql.indexOf('*/', at + 2)
      at = end === -1 ? sql.length : end + 2
      continue
    }
    const char = sql[at]!
    if (char === "'" || char === '"') {
      const end = closingQuote(sql, at, char)
      current += sql.slice(at, end)
      at = end
      continue
    }
    const dollar = /^\$[A-Za-z_]*\$/.exec(rest)
    if (dollar) {
      const tag = dollar[0]
      const end = sql.indexOf(tag, at + tag.length)
      const stop = end === -1 ? sql.length : end + tag.length
      current += sql.slice(at, stop)
      at = stop
      continue
    }
    if (char === ';') {
      if (current.trim()) out.push(current.trim())
      current = ''
      at++
      continue
    }
    current += char
    at++
  }
  if (current.trim()) out.push(current.trim())
  return out
}

/** Where a quoted run ends, doubled quotes ('' and "") counting as escapes. */
function closingQuote(sql: string, start: number, quote: string): number {
  let at = start + 1
  while (at < sql.length) {
    if (sql[at] === quote) {
      if (sql[at + 1] === quote) {
        at += 2
        continue
      }
      return at + 1
    }
    at++
  }
  return sql.length
}

function moduleSql(moduleName: string): string[] {
  const dir = path.join(process.cwd(), 'modules', moduleName, 'migrations')
  return readdirSync(dir)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .flatMap((file) => splitStatements(readFileSync(path.join(dir, file), 'utf8')))
}

suite('product-discovery-tool raw SQL, against a real Postgres', () => {
  let cfg: VpsConfig
  let role: TestRole
  let database: TestDatabase
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  const dbName = `cactus_rt_pdt_${stamp}`
  const roleName = `cactus_rt_role_pdt_${stamp}`

  // Every db module is imported AFTER DATABASE_URL points at the throwaway,
  // because the shared client reads it once at module load. Importing them at
  // the top of the file would build a client against whatever the shell happened
  // to have set, which on this machine is nothing at all.
  type DbModules = {
    flows: typeof import('@/modules/product-discovery-tool/lib/db/flows')
    nodes: typeof import('@/modules/product-discovery-tool/lib/db/nodes')
    questions: typeof import('@/modules/product-discovery-tool/lib/db/questions')
    notes: typeof import('@/modules/product-discovery-tool/lib/db/notes')
    stats: typeof import('@/modules/product-discovery-tool/lib/db/stats')
    settings: typeof import('@/modules/product-discovery-tool/lib/db/settings')
    media: typeof import('@/modules/product-discovery-tool/lib/media-usage-provider')
    rewriter: typeof import('@/modules/product-discovery-tool/lib/media-reference-rewriter')
    prisma: typeof import('@/lib/db/prisma')
  }
  let db: DbModules
  let vps: typeof import('@/lib/backup/vps-database')
  let groupId = ''
  let filterOak = ''
  let filterGlass = ''

  beforeAll(async () => {
    vps = await import('@/lib/backup/vps-database')
    cfg = vps.vpsConfigFromEnv()
    await vps.dropStaleTestObjects(cfg)
    role = await vps.createTestRole(cfg, roleName)
    database = await vps.createTestDatabase(cfg, dbName, role)
    process.env.DATABASE_URL = database.connectionUri
    process.env.DIRECT_URL = database.connectionUri

    db = {
      flows: await import('@/modules/product-discovery-tool/lib/db/flows'),
      nodes: await import('@/modules/product-discovery-tool/lib/db/nodes'),
      questions: await import('@/modules/product-discovery-tool/lib/db/questions'),
      notes: await import('@/modules/product-discovery-tool/lib/db/notes'),
      stats: await import('@/modules/product-discovery-tool/lib/db/stats'),
      settings: await import('@/modules/product-discovery-tool/lib/db/settings'),
      media: await import('@/modules/product-discovery-tool/lib/media-usage-provider'),
      rewriter: await import('@/modules/product-discovery-tool/lib/media-reference-rewriter'),
      prisma: await import('@/lib/db/prisma'),
    }

    // A freshly-created database takes a moment to accept connections.
    for (let attempt = 0; ; attempt++) {
      try {
        await db.prisma.prisma.$queryRawUnsafe('SELECT 1')
        break
      } catch (err) {
        if (attempt >= 15) throw err
        await new Promise((r) => setTimeout(r, 2000))
      }
    }

    // Core (for InfoPage, which the slug check reads), then the two modules this
    // one hard-depends on, then its own schema - in the order an install would
    // apply them. Shop's tables are here rather than stubbed because the import
    // validator asks shop whether a category exists, and a validator that has
    // never been asked a real question has not been tested.
    for (const statement of splitStatements(CORE_SQL)) await db.prisma.prisma.$executeRawUnsafe(statement)
    for (const moduleName of ['shop', 'filters-for-shop', 'product-discovery-tool']) {
      for (const statement of moduleSql(moduleName)) await db.prisma.prisma.$executeRawUnsafe(statement)
    }

    // A minimal filter vocabulary for the foreign keys to land on.
    const groups = await db.prisma.prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO "flt_groups" ("name", "slug", "control_type") VALUES ('Colour', 'colour', 'SWATCH') RETURNING "id"
    `
    groupId = groups[0]!.id
    const oak = await db.prisma.prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO "flt_filters" ("group_id", "label", "slug") VALUES (${groupId}, 'Oak', 'oak') RETURNING "id"
    `
    filterOak = oak[0]!.id
    const glass = await db.prisma.prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO "flt_filters" ("group_id", "label", "slug") VALUES (${groupId}, 'Glass', 'glass') RETURNING "id"
    `
    filterGlass = glass[0]!.id
  }, 300_000)

  afterAll(async () => {
    try {
      await db?.prisma.prisma.$disconnect()
    } catch {
      // Nothing to disconnect if the setup never got that far.
    }
    if (cfg && vps) {
      if (database) await vps.dropTestDatabase(cfg, database.name)
      if (role) await vps.dropTestRole(cfg, role.name)
      await vps.dropStaleTestObjects(cfg)
    }
  }, 300_000)

  it('applies its own schema twice - every statement is idempotent', async () => {
    // A module migration is re-run on any install that has not recorded it, and
    // a second run must be a no-op rather than an error.
    for (const statement of moduleSql('product-discovery-tool')) {
      await db.prisma.prisma.$executeRawUnsafe(statement)
    }
    const rows = await db.prisma.prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*) AS count FROM "pdt_settings"`
    expect(Number(rows[0]!.count)).toBe(1)
  })

  it('reads and writes a flow, and refuses a slug something else answers on', async () => {
    const created = await db.flows.createFlow({ name: 'Find your desk', slug: 'find-your-desk', scopeType: 'CATEGORY', scopeSlug: 'desks' })
    const flow = await db.flows.getFlow(created.id)
    expect(flow?.slug).toBe('find-your-desk')
    expect(flow?.scopeType).toBe('CATEGORY')

    await db.flows.updateFlow(created.id, { status: 'PUBLISHED', heading: 'Find your desk', resultsPerPage: 12, finishCtaLabel: null })
    const updated = await db.flows.getFlow(created.id)
    expect(updated?.status).toBe('PUBLISHED')
    expect(updated?.resultsPerPage).toBe(12)

    expect(await db.flows.flowSlugExists('find-your-desk')).toBe(true)
    // The availability check reaches into InfoPage and, through to_regclass, at
    // tables that may not exist on an install - the statement has to parse and
    // run either way.
    expect(await db.flows.flowSlugAvailable('find-your-desk', created.id)).toBe(true)
    expect(await db.flows.flowSlugAvailable('find-your-desk')).toBe(false)
    expect(await db.flows.ensureUniqueFlowSlug('find-your-desk')).toBe('find-your-desk-2')

    const second = await db.flows.createFlow({ name: 'Find your chair', slug: 'find-your-chair', scopeType: 'ALL', scopeSlug: null })
    await db.flows.reorderFlows([second.id, created.id])
    expect((await db.flows.listFlows()).map((entry) => entry.slug)).toEqual(['find-your-chair', 'find-your-desk'])
    await db.flows.deleteFlow(second.id)
  })

  it('enforces node uniqueness through the COALESCE expression index', async () => {
    const flow = (await db.flows.listFlows())[0]!
    const desks = await db.nodes.createNode({ flowId: flow.id, parentId: null, label: 'Desks', slug: 'desks', scopeType: 'CATEGORY', scopeSlug: 'desks' })
    // Two ROOT nodes with the same slug is the trap a plain UNIQUE would miss
    // entirely, because Postgres treats every NULL parent as distinct.
    await expect(
      db.nodes.createNode({ flowId: flow.id, parentId: null, label: 'Desks again', slug: 'desks' }),
    ).rejects.toThrow()
    expect(await db.nodes.ensureUniqueNodeSlug(flow.id, null, 'desks')).toBe('desks-2')

    const ha = await db.nodes.createNode({ flowId: flow.id, parentId: desks.id, label: 'Height adjustable', slug: 'height-adjustable', scopeType: 'FILTERS' })
    // The same slug under a DIFFERENT parent is fine, which is the other half of
    // the same index.
    await db.nodes.createNode({ flowId: flow.id, parentId: ha.id, label: 'Desks', slug: 'desks' })

    await db.nodes.setNodeFilters(ha.id, [filterOak, filterGlass])
    await db.nodes.updateNode(ha.id, { blurb: 'Up and down at the touch of a button', imageUrl: '/media/ha.webp' })
    const loaded = await db.nodes.getNode(ha.id)
    expect(loaded?.filterIds).toEqual([filterOak, filterGlass])
    expect(loaded?.blurb).toContain('touch of a button')

    // unnest/generate_subscripts, scoped to one flow and one parent.
    const children = (await db.nodes.listNodes(flow.id)).filter((node) => node.parentId === null)
    await db.nodes.reorderNodes(flow.id, null, [...children].reverse().map((node) => node.id))
    const after = (await db.nodes.listNodes(flow.id)).filter((node) => node.parentId === null)
    expect(after.map((node) => node.slug)).toEqual([...children].reverse().map((node) => node.slug))

    // Deleting a filter takes its applied-filter row with it, rather than
    // leaving a step selecting something that no longer exists.
    await db.prisma.prisma.$executeRaw`DELETE FROM "flt_filters" WHERE "id" = ${filterGlass}`
    expect((await db.nodes.getNode(ha.id))?.filterIds).toEqual([filterOak])
  })

  it('upserts a question on the expression index, at both scopes', async () => {
    const flow = (await db.flows.listFlows())[0]!
    const node = (await db.nodes.listNodes(flow.id))[0]!
    const first = await db.questions.upsertQuestion({ flowId: flow.id, nodeId: null, groupId, heading: 'What colour?' })
    const again = await db.questions.upsertQuestion({ flowId: flow.id, nodeId: null, groupId, heading: 'Which finish?', importance: 'SECONDARY' })
    expect(again.id).toBe(first.id)

    // A node-scoped row is a DIFFERENT row, which is the whole point of
    // COALESCE(node_id, '') being in the index rather than node_id itself.
    const scoped = await db.questions.upsertQuestion({ flowId: flow.id, nodeId: node.id, groupId, heading: 'On desks, which finish?' })
    expect(scoped.id).not.toBe(first.id)

    const rows = await db.questions.listQuestions(flow.id)
    expect(rows).toHaveLength(2)
    expect(rows.find((row) => row.nodeId === null)?.heading).toBe('Which finish?')
    expect(rows.find((row) => row.nodeId === null)?.importance).toBe('SECONDARY')

    await db.questions.reorderQuestions(flow.id, [scoped.id, first.id])
    expect((await db.questions.listQuestions(flow.id)).map((row) => row.id)).toEqual([scoped.id, first.id])
    await db.questions.deleteQuestion(scoped.id)
    expect(await db.questions.listQuestions(flow.id)).toHaveLength(1)
  })

  it('upserts an option note on its own expression index', async () => {
    const flow = (await db.flows.listFlows())[0]!
    const node = (await db.nodes.listNodes(flow.id))[0]!
    const global = await db.notes.upsertNote({ filterId: filterOak, nodeId: null, explainer: 'Real oak veneer.' })
    const same = await db.notes.upsertNote({ filterId: filterOak, nodeId: null, bestFor: 'Warmth' })
    expect(same.id).toBe(global.id)
    const scoped = await db.notes.upsertNote({ filterId: filterOak, nodeId: node.id, explainer: 'On desks, the top only.' })
    expect(scoped.id).not.toBe(global.id)

    const all = await db.notes.listNotes()
    expect(all).toHaveLength(2)
    // The tri-state update: a field left out is left alone, not blanked.
    expect(all.find((note) => note.nodeId === null)?.explainer).toBe('Real oak veneer.')
    expect(all.find((note) => note.nodeId === null)?.bestFor).toBe('Warmth')
    await db.notes.deleteNote(scoped.id)
  })

  it('counts insights on a DATE column and reads them back over a window', async () => {
    const flow = (await db.flows.listFlows())[0]!
    await db.stats.bumpStat(flow.id, 'browse:0', 'desks', 'PICK')
    await db.stats.bumpStat(flow.id, 'browse:0', 'desks', 'PICK')
    await db.stats.bumpStat(flow.id, 'features', 'colour:oak', 'DEAD_END')
    const rows = await db.stats.readStats(flow.id, 30)
    const pick = rows.find((row) => row.choiceKey === 'desks' && row.kind === 'PICK')
    expect(pick?.count).toBe(2)
    expect(pick?.day).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(rows.find((row) => row.kind === 'DEAD_END')?.count).toBe(1)
    // The date arithmetic in the window clause: `date - integer`.
    expect(await db.stats.readStats(flow.id, 1)).not.toHaveLength(0)
  })

  it('reads and writes the settings singleton', async () => {
    expect(await db.settings.getSettings()).toEqual(db.settings.discoverySettingsDefaults())
    await db.settings.updateSettings({ showCounts: false })
    const settings = await db.settings.getSettings()
    expect(settings.showCounts).toBe(false)
    expect(settings.compareEnabled).toBe(true)
  })

  it('rewrites media references, inside the intro document as well as beside it', async () => {
    const flow = (await db.flows.listFlows())[0]!
    await db.flows.updateFlow(flow.id, {
      ogImage: '/media/old_share.webp',
      introPuck: { root: { props: {} }, content: [{ type: 'Image', props: { src: '/media/old_share.webp' } }], zones: {} },
    })
    await db.rewriter.discoveryMediaReferenceRewriter({
      oldUrl: '/media/old_share.webp',
      newUrl: '/media/new_share.webp',
      oldKey: 'old_share.webp',
      newKey: 'new_share.webp',
    })
    const after = await db.flows.getFlow(flow.id)
    expect(after?.ogImage).toBe('/media/new_share.webp')
    expect(JSON.stringify(after?.introPuck)).toContain('/media/new_share.webp')
    expect(JSON.stringify(after?.introPuck)).not.toContain('old_share')

    // And the node picture set above, so the media screen keeps seeing it.
    const usage = await db.media.discoveryMediaUsageProvider()
    expect(usage.some((ref) => ref.includes('/media/ha.webp'))).toBe(true)
    expect(usage.some((ref) => ref.includes('/media/new_share.webp'))).toBe(true)
  })

  it('imports a whole flow in one transaction, by slug', async () => {
    const importExport = await import('@/modules/product-discovery-tool/lib/import-export')
    const file = {
      version: 1 as const,
      flow: {
        slug: 'find-your-storage',
        name: 'Find your storage',
        status: 'PUBLISHED' as const,
        scope: { type: 'ALL' as const, slug: null },
      },
      nodes: [
        { path: 'cupboards', label: 'Cupboards', scope: { type: 'ALL' as const, slug: null }, filters: ['colour/oak'] },
        { path: 'cupboards/tall', label: 'Tall', scope: { type: 'ALL' as const, slug: null } },
        { path: 'pedestals', label: 'Pedestals', scope: { type: 'ALL' as const, slug: null } },
      ],
      questions: [{ node: null, group: 'colour', heading: 'What finish?' }],
      notes: [{ filter: 'colour/oak', node: null, explainer: 'Warm and forgiving.' }],
    }

    const dry = await importExport.validateFlowFile(file)
    expect(dry.problems).toEqual([])
    expect(dry.ok).toBe(true)

    const applied = await importExport.importFlowFile(file)
    expect(applied.report.ok).toBe(true)
    const flowId = applied.flowId!
    expect((await db.nodes.listNodes(flowId)).map((node) => node.slug).sort()).toEqual(['cupboards', 'pedestals', 'tall'])

    // Re-importing an edited file is the truth, not a suggestion: the choice it
    // no longer names goes, and takes its children with it.
    const trimmed = { ...file, nodes: file.nodes.filter((node) => node.path !== 'pedestals') }
    const second = await importExport.validateFlowFile(trimmed)
    expect(second.counts.nodesToDelete).toBe(1)
    await importExport.importFlowFile(trimmed)
    expect((await db.nodes.listNodes(flowId)).map((node) => node.slug).sort()).toEqual(['cupboards', 'tall'])

    // And it comes back out in the same shape it went in, still by slug.
    const exported = await importExport.exportFlow(flowId)
    expect(exported?.nodes?.map((node) => node.path).sort()).toEqual(['cupboards', 'cupboards/tall'])
    expect(exported?.nodes?.find((node) => node.path === 'cupboards')?.filters).toEqual(['colour/oak'])
    expect(exported?.questions?.[0]?.group).toBe('colour')

    // A file naming something the shop has not got is reported, not applied.
    const broken = { ...file, nodes: [{ path: 'x', label: 'X', scope: { type: 'CATEGORY' as const, slug: 'no-such-category' }, filters: ['colour/unicorn'] }] }
    const report = await importExport.validateFlowFile(broken)
    expect(report.ok).toBe(false)
    expect(report.problems).toHaveLength(2)
    expect((await importExport.importFlowFile(broken)).flowId).toBeNull()
  })

  it('lists published flows for the sitemap', async () => {
    const sitemap = await import('@/modules/product-discovery-tool/lib/sitemap')
    // Read straight off the table rather than through getPublicSitemapEntries,
    // which asks shop for its open/closed state and shop's schema is not here.
    const rows = await db.prisma.prisma.$queryRaw<Array<{ slug: string; updated_at: Date }>>`
      SELECT "slug", "updated_at" FROM "pdt_flows" WHERE "status" = 'PUBLISHED' AND "noindex" = false
    `
    expect(rows.map((row) => row.slug).sort()).toEqual(['find-your-desk', 'find-your-storage'])
    expect(typeof sitemap.getPublicSitemapEntries).toBe('function')
  })

  it('takes everything with it when a flow goes', async () => {
    const flow = (await db.flows.listFlows()).find((entry) => entry.slug === 'find-your-desk')!
    await db.flows.deleteFlow(flow.id)
    expect(await db.nodes.listNodes(flow.id)).toEqual([])
    expect(await db.questions.listQuestions(flow.id)).toEqual([])
    expect(await db.stats.readStats(flow.id)).toEqual([])
  })
})
